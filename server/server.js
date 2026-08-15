const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { randomUUID } = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// In-memory room store
// ---------------------------------------------------------------------------
// rooms: Map<roomId, Room>
// Room = {
//   id, hostId, createdAt,
//   participants: Map<userId, { id, username, role, socketId, joinedAt }>,
//   video: { videoId, playState: 'playing'|'paused', currentTime, lastUpdate },
//   chat: [{ id, userId, username, text, ts }]
// }
const rooms = new Map();

const ROLES = {
  HOST: 'host',
  MODERATOR: 'moderator',
  PARTICIPANT: 'participant'
};

function canControlPlayback(role) {
  return role === ROLES.HOST || role === ROLES.MODERATOR;
}

function isHost(role) {
  return role === ROLES.HOST;
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let code;
  do {
    code = Array.from(
      { length: 6 },
      () => chars[Math.floor(Math.random() * chars.length)]
    ).join('');
  } while (rooms.has(code));
  return code;
}

function serializeParticipants(room) {
  return Array.from(room.participants.values()).map((p) => ({
    userId: p.id,
    username: p.username,
    role: p.role
  }));
}

// Compute the "live" current time of a room's video, accounting for time
// elapsed since the last update, so late joiners and periodic drift-correction
// broadcasts reflect an accurate position without every client polling the host.
function getLiveVideoState(room) {
  const v = room.video;
  let currentTime = v.currentTime;

  if (v.playState === 'playing') {
    currentTime +=
      (Date.now() - v.lastUpdate) / 1000;
  }

  return {
    videoId: v.videoId,
    playState: v.playState,
    currentTime
  };
}

function touchVideoState(room, patch) {
  const live = getLiveVideoState(room);

  room.video = {
    videoId:
      patch.videoId !== undefined
        ? patch.videoId
        : live.videoId,

    playState:
      patch.playState !== undefined
        ? patch.playState
        : live.playState,

    currentTime:
      patch.currentTime !== undefined
        ? patch.currentTime
        : live.currentTime,

    lastUpdate: Date.now()
  };
}

function broadcastSyncState(room) {
  const live = getLiveVideoState(room);

  io.to(room.id).emit(
    'sync_state',
    live
  );
}

function roomSnapshot(room) {
  return {
    roomId: room.id,
    participants:
      serializeParticipants(room),
    video:
      getLiveVideoState(room)
  };
}

function findParticipantBySocket(room, socketId) {
  for (
    const p of room.participants.values()
  ) {
    if (p.socketId === socketId) {
      return p;
    }
  }

  return null;
}

// Periodic drift-correction broadcast for rooms with active playback.
setInterval(() => {
  for (const room of rooms.values()) {
    if (
      room.video.playState === 'playing' &&
      room.participants.size > 0
    ) {
      broadcastSyncState(room);
    }
  }
}, 5000);


// ---------------------------------------------------------------------------
// Socket handlers
// ---------------------------------------------------------------------------

io.on('connection', (socket) => {

  socket.data.userId =
    randomUUID();

  socket.data.roomId =
    null;


  // -------------------------------------------------------------------------
  // CREATE ROOM
  // -------------------------------------------------------------------------

  socket.on(
    'create_room',
    ({ username }, cb) => {

      const roomId =
        generateRoomCode();

      const userId =
        socket.data.userId;

      const room = {
        id: roomId,

        hostId: userId,

        createdAt:
          Date.now(),

        participants:
          new Map(),

        video: {
          videoId: null,

          playState:
            'paused',

          currentTime:
            0,

          lastUpdate:
            Date.now()
        },

        chat: []
      };


      room.participants.set(
        userId,
        {
          id: userId,

          username:
            (username || 'Host')
              .trim()
              .slice(0, 30),

          role:
            ROLES.HOST,

          socketId:
            socket.id,

          joinedAt:
            Date.now()
        }
      );


      rooms.set(
        roomId,
        room
      );


      socket.join(
        roomId
      );

      socket.data.roomId =
        roomId;


      if (
        typeof cb ===
        'function'
      ) {

        cb({
          ok: true,

          roomId,

          userId,

          role:
            ROLES.HOST,

          ...roomSnapshot(
            room
          )
        });
      }
    }
  );


  // -------------------------------------------------------------------------
  // JOIN ROOM
  // -------------------------------------------------------------------------

  socket.on(
    'join_room',
    ({ roomId, username }, cb) => {

      const room =
        rooms.get(
          (roomId || '')
            .toUpperCase()
        );


      if (!room) {

        if (
          typeof cb ===
          'function'
        ) {

          cb({
            ok: false,

            error:
              'Room not found. Check the code and try again.'
          });
        }

        return;
      }


      const userId =
        socket.data.userId;


      const participant = {

        id:
          userId,

        username:
          (username || 'Guest')
            .trim()
            .slice(0, 30) ||
          'Guest',

        role:
          ROLES.PARTICIPANT,

        socketId:
          socket.id,

        joinedAt:
          Date.now()
      };


      room.participants.set(
        userId,
        participant
      );


      socket.join(
        room.id
      );

      socket.data.roomId =
        room.id;


      if (
        typeof cb ===
        'function'
      ) {

        cb({
          ok: true,

          roomId:
            room.id,

          userId,

          role:
            participant.role,

          ...roomSnapshot(
            room
          )
        });
      }


      socket
        .to(room.id)
        .emit(
          'user_joined',
          {
            username:
              participant.username,

            userId,

            role:
              participant.role,

            participants:
              serializeParticipants(
                room
              )
          }
        );


      // Send the joiner an immediate, accurate sync
      // so their player starts in the right spot.
      socket.emit(
        'sync_state',
        getLiveVideoState(room)
      );
    }
  );


  // -------------------------------------------------------------------------
  // LEAVE
  // -------------------------------------------------------------------------

  socket.on(
    'leave_room',
    () => {
      handleLeave(socket);
    }
  );


  // -------------------------------------------------------------------------
  // DISCONNECT
  // -------------------------------------------------------------------------

  socket.on(
    'disconnect',
    () => {
      handleLeave(socket);
    }
  );


  // -------------------------------------------------------------------------
  // PLAY
  // -------------------------------------------------------------------------

  socket.on(
    'play',
    ({ currentTime } = {}) => {

      const {
        room,
        participant
      } = context(socket);


      if (
        !room ||
        !participant
      ) {
        return;
      }


      if (
        !canControlPlayback(
          participant.role
        )
      ) {

        return socket.emit(
          'error_message',
          {
            error:
              'Only the host or a moderator can control playback.'
          }
        );
      }


      touchVideoState(
        room,
        {
          playState:
            'playing',

          currentTime
        }
      );


      broadcastSyncState(
        room
      );
    }
  );


  // -------------------------------------------------------------------------
  // PAUSE
  // -------------------------------------------------------------------------

  socket.on(
    'pause',
    ({ currentTime } = {}) => {

      const {
        room,
        participant
      } = context(socket);


      if (
        !room ||
        !participant
      ) {
        return;
      }


      if (
        !canControlPlayback(
          participant.role
        )
      ) {

        return socket.emit(
          'error_message',
          {
            error:
              'Only the host or a moderator can control playback.'
          }
        );
      }


      touchVideoState(
        room,
        {
          playState:
            'paused',

          currentTime
        }
      );


      broadcastSyncState(
        room
      );
    }
  );


  // -------------------------------------------------------------------------
  // SEEK
  // -------------------------------------------------------------------------

  socket.on(
    'seek',
    ({ time } = {}) => {

      const {
        room,
        participant
      } = context(socket);


      if (
        !room ||
        !participant
      ) {
        return;
      }


      if (
        !canControlPlayback(
          participant.role
        )
      ) {

        return socket.emit(
          'error_message',
          {
            error:
              'Only the host or a moderator can seek.'
          }
        );
      }


      touchVideoState(
        room,
        {
          currentTime:
            time
        }
      );


      broadcastSyncState(
        room
      );
    }
  );


  // -------------------------------------------------------------------------
  // CHANGE VIDEO
  // -------------------------------------------------------------------------

  socket.on(
    'change_video',
    ({ videoId } = {}) => {

      const {
        room,
        participant
      } = context(socket);


      if (
        !room ||
        !participant
      ) {
        return;
      }


      if (
        !canControlPlayback(
          participant.role
        )
      ) {

        return socket.emit(
          'error_message',
          {
            error:
              'Only the host or a moderator can change the video.'
          }
        );
      }


      if (!videoId) {
        return;
      }


      touchVideoState(
        room,
        {
          videoId,

          playState:
            'playing',

          currentTime:
            0
        }
      );


      broadcastSyncState(
        room
      );
    }
  );


  // -------------------------------------------------------------------------
  // ASSIGN ROLE
  // -------------------------------------------------------------------------

  socket.on(
    'assign_role',
    ({ userId, role } = {}) => {

      const {
        room,
        participant
      } = context(socket);


      if (
        !room ||
        !participant
      ) {
        return;
      }


      if (
        !isHost(
          participant.role
        )
      ) {

        return socket.emit(
          'error_message',
          {
            error:
              'Only the host can assign roles.'
          }
        );
      }


      if (
        !Object.values(
          ROLES
        ).includes(role) ||
        role === ROLES.HOST
      ) {

        return socket.emit(
          'error_message',
          {
            error:
              'Invalid role.'
          }
        );
      }


      const target =
        room.participants.get(
          userId
        );


      if (!target) {
        return;
      }


      if (
        target.id ===
        room.hostId
      ) {
        return;
      }


      target.role =
        role;


      io.to(room.id).emit(
        'role_assigned',
        {
          userId:
            target.id,

          username:
            target.username,

          role:
            target.role,

          participants:
            serializeParticipants(
              room
            )
        }
      );
    }
  );


  // -------------------------------------------------------------------------
  // REMOVE PARTICIPANT
  // -------------------------------------------------------------------------

  socket.on(
    'remove_participant',
    ({ userId } = {}) => {

      const {
        room,
        participant
      } = context(socket);


      if (
        !room ||
        !participant
      ) {
        return;
      }


      if (
        !isHost(
          participant.role
        )
      ) {

        return socket.emit(
          'error_message',
          {
            error:
              'Only the host can remove participants.'
          }
        );
      }


      const target =
        room.participants.get(
          userId
        );


      if (
        !target ||
        target.id ===
          room.hostId
      ) {
        return;
      }


      room.participants.delete(
        userId
      );


      io.to(room.id).emit(
        'participant_removed',
        {
          userId,

          participants:
            serializeParticipants(
              room
            )
        }
      );


      const targetSocket =
        io.sockets.sockets.get(
          target.socketId
        );


      if (targetSocket) {

        targetSocket.emit(
          'you_were_removed'
        );

        targetSocket.leave(
          room.id
        );

        targetSocket.data.roomId =
          null;
      }
    }
  );


  // -------------------------------------------------------------------------
  // TRANSFER HOST
  // -------------------------------------------------------------------------

  socket.on(
    'transfer_host',
    ({ userId } = {}) => {

      const {
        room,
        participant
      } = context(socket);


      if (
        !room ||
        !participant
      ) {
        return;
      }


      if (
        !isHost(
          participant.role
        )
      ) {

        return socket.emit(
          'error_message',
          {
            error:
              'Only the host can transfer host.'
          }
        );
      }


      const target =
        room.participants.get(
          userId
        );


      if (!target) {
        return;
      }


      participant.role =
        ROLES.MODERATOR;

      target.role =
        ROLES.HOST;

      room.hostId =
        target.id;


      io.to(room.id).emit(
        'role_assigned',
        {
          userId:
            participant.id,

          username:
            participant.username,

          role:
            participant.role,

          participants:
            serializeParticipants(
              room
            )
        }
      );


      io.to(room.id).emit(
        'role_assigned',
        {
          userId:
            target.id,

          username:
            target.username,

          role:
            target.role,

          participants:
            serializeParticipants(
              room
            )
        }
      );


      io.to(room.id).emit(
        'host_transferred',
        {
          newHostId:
            target.id,

          newHostUsername:
            target.username,

          participants:
            serializeParticipants(
              room
            )
        }
      );
    }
  );


  // -------------------------------------------------------------------------
  // CHAT
  // -------------------------------------------------------------------------

  socket.on(
    'chat_message',
    ({ text } = {}) => {

      const {
        room,
        participant
      } = context(socket);


      if (
        !room ||
        !participant
      ) {
        return;
      }


      const clean =
        (text || '')
          .toString()
          .trim()
          .slice(0, 500);


      if (!clean) {
        return;
      }


      const msg = {

        id:
          randomUUID(),

        userId:
          participant.id,

        username:
          participant.username,

        text:
          clean,

        ts:
          Date.now()
      };


      room.chat.push(
        msg
      );


      if (
        room.chat.length >
        200
      ) {
        room.chat.shift();
      }


      io.to(room.id).emit(
        'chat_message',
        msg
      );
    }
  );


  // -------------------------------------------------------------------------
  // HELPERS
  // -------------------------------------------------------------------------

  function context(sock) {

    const roomId =
      sock.data.roomId;


    if (!roomId) {
      return {};
    }


    const room =
      rooms.get(
        roomId
      );


    if (!room) {
      return {};
    }


    const participant =
      room.participants.get(
        sock.data.userId
      );


    return {
      room,
      participant
    };
  }


  function handleLeave(sock) {

    const roomId =
      sock.data.roomId;


    if (!roomId) {
      return;
    }


    const room =
      rooms.get(
        roomId
      );


    if (!room) {
      return;
    }


    const userId =
      sock.data.userId;


    const leaving =
      room.participants.get(
        userId
      );


    if (!leaving) {
      return;
    }


    room.participants.delete(
      userId
    );


    sock.leave(
      roomId
    );


    sock.data.roomId =
      null;


    if (
      room.participants.size ===
      0
    ) {

      rooms.delete(
        roomId
      );

      return;
    }


    // If the host left, promote the longest-tenured remaining participant.
    if (
      leaving.role ===
      ROLES.HOST
    ) {

      const next =
        Array.from(
          room.participants.values()
        ).sort(
          (a, b) =>
            a.joinedAt -
            b.joinedAt
        )[0];


      next.role =
        ROLES.HOST;

      room.hostId =
        next.id;


      io.to(room.id).emit(
        'host_transferred',
        {
          newHostId:
            next.id,

          newHostUsername:
            next.username,

          participants:
            serializeParticipants(
              room
            )
        }
      );
    }


    io.to(room.id).emit(
      'user_left',
      {
        username:
          leaving.username,

        userId,

        participants:
          serializeParticipants(
            room
          )
      }
    );
  }
});


server.listen(
  PORT,
  () => {
    console.log(
      `Watch Party server running on http://localhost:${PORT}`
    );
  }
);
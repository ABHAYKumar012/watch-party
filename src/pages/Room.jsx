import { useEffect, useRef, useState } from "react";
import socket from "../services/socket";


// ======================================================
// LOAD YOUTUBE IFRAME API
// ======================================================

const loadYouTubeAPI = () => {
  return new Promise((resolve) => {

    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }

    if (document.getElementById("youtube-iframe-api")) {

      window.onYouTubeIframeAPIReady = () => {
        resolve();
      };

      return;
    }

    const script = document.createElement("script");

    script.id = "youtube-iframe-api";
    script.src = "https://www.youtube.com/iframe_api";

    window.onYouTubeIframeAPIReady = () => {
      resolve();
    };

    document.body.appendChild(script);
  });
};


// ======================================================
// ROOM
// ======================================================

function Room({ roomData, onLeave }) {

  // ====================================================
  // USER / ROOM
  // ====================================================

  const myUserId = roomData.userId;

  const [myRole, setMyRole] = useState(
    roomData.role || "participant"
  );

  const [participants, setParticipants] = useState(
    roomData.participants || []
  );

  const [activeTab, setActiveTab] = useState("people");

  const [toast, setToast] = useState("");


  // ====================================================
  // CHAT
  // ====================================================

  const [messages, setMessages] = useState([]);

  const [chatInput, setChatInput] = useState("");

  const chatMessagesRef = useRef(null);


  // ====================================================
  // VIDEO
  // ====================================================

  const [videoId, setVideoId] = useState(
    roomData.video?.videoId || null
  );

  const [videoInput, setVideoInput] = useState("");

  const [isPlaying, setIsPlaying] = useState(
    roomData.video?.playState === "playing"
  );

  const [currentTime, setCurrentTime] = useState(
    roomData.video?.currentTime || 0
  );

  const [duration, setDuration] = useState(0);

  const [isSeeking, setIsSeeking] = useState(false);


  // ====================================================
  // YOUTUBE PLAYER
  // ====================================================

  const playerRef = useRef(null);

  const playerContainerRef = useRef(null);

  const [playerReady, setPlayerReady] = useState(false);


  // Prevent remote state updates from
  // triggering another socket event.
  const applyingRemoteUpdateRef = useRef(false);

  // YouTube can briefly fire PAUSED/PLAYING while seekTo()
  // is running. These transient events must not become
  // room-wide playback commands.
  const suppressPlayerEventsUntilRef = useRef(0);

  const timeUpdateIntervalRef = useRef(null);


  // ====================================================
  // PERMISSIONS
  // ====================================================

  const canControl =
    myRole === "host" ||
    myRole === "moderator";


  
  // Keep the latest permission available to the YouTube
  // event handlers without recreating the player.
  const canControlRef = useRef(canControl);

  useEffect(() => {
    canControlRef.current = canControl;
  }, [canControl]);
// ====================================================
  // TOAST
  // ====================================================

  const showToast = (message, duration = 2000) => {

    setToast(message);

    setTimeout(() => {
      setToast("");
    }, duration);

  };


  // ====================================================
  // FORMAT TIME
  // ====================================================

  const formatTime = (seconds) => {

    if (
      !Number.isFinite(seconds) ||
      seconds < 0
    ) {
      return "0:00";
    }

    const totalSeconds =
      Math.floor(seconds);

    const minutes =
      Math.floor(totalSeconds / 60);

    const remainingSeconds =
      totalSeconds % 60;

    return `${minutes}:${String(
      remainingSeconds
    ).padStart(2, "0")}`;
  };


  // ====================================================
// EXTRACT YOUTUBE ID
// ====================================================

const extractVideoId = (input) => {
  let raw = input.trim();

  if (!raw) {
    return null;
  }

  // Remove spaces accidentally copied around the URL
  raw = raw.replace(/\s+/g, "");

  // Direct 11-character YouTube ID
  if (
    /^[a-zA-Z0-9_-]{11}$/.test(raw)
  ) {
    return raw;
  }

  // Add https:// when user pastes:
  // youtube.com/watch?v=XXXXXXXXXXX
  // www.youtube.com/watch?v=XXXXXXXXXXX
  // youtu.be/XXXXXXXXXXX
  if (
    !/^https?:\/\//i.test(raw)
  ) {
    raw = `https://${raw}`;
  }

  try {
    const url = new URL(raw);

    const hostname =
      url.hostname.toLowerCase();

    // ------------------------------------------
    // youtu.be/VIDEO_ID
    // ------------------------------------------

    if (
      hostname === "youtu.be" ||
      hostname === "www.youtu.be"
    ) {
      const id =
        url.pathname
          .split("/")
          .filter(Boolean)[0];

      if (
        id &&
        /^[a-zA-Z0-9_-]{11}$/.test(id)
      ) {
        return id;
      }
    }


    // ------------------------------------------
    // youtube.com/watch?v=VIDEO_ID
    // ------------------------------------------

    if (
      hostname === "youtube.com" ||
      hostname === "www.youtube.com" ||
      hostname === "m.youtube.com"
    ) {
      const v =
        url.searchParams.get("v");

      if (
        v &&
        /^[a-zA-Z0-9_-]{11}$/.test(v)
      ) {
        return v;
      }


      // ----------------------------------------
      // youtube.com/embed/VIDEO_ID
      // ----------------------------------------

      const embedMatch =
        url.pathname.match(
          /\/embed\/([a-zA-Z0-9_-]{11})/
        );

      if (embedMatch) {
        return embedMatch[1];
      }


      // ----------------------------------------
      // youtube.com/shorts/VIDEO_ID
      // ----------------------------------------

      const shortsMatch =
        url.pathname.match(
          /\/shorts\/([a-zA-Z0-9_-]{11})/
        );

      if (shortsMatch) {
        return shortsMatch[1];
      }


      // ----------------------------------------
      // youtube.com/live/VIDEO_ID
      // ----------------------------------------

      const liveMatch =
        url.pathname.match(
          /\/live\/([a-zA-Z0-9_-]{11})/
        );

      if (liveMatch) {
        return liveMatch[1];
      }
    }

  } catch (error) {
    console.log(
      "Invalid YouTube URL:",
      input
    );
  }

  return null;
};
  // ====================================================
  // YOUTUBE PLAYER
  // ====================================================

  useEffect(() => {

    let cancelled = false;


    const createPlayer = async () => {

      await loadYouTubeAPI();


      if (cancelled) {
        return;
      }


      if (!playerContainerRef.current) {
        return;
      }


      if (playerRef.current) {
        return;
      }


      const playerOptions = {

        width: "100%",

        height: "100%",


        playerVars: {

          autoplay: 0,

          // Our React controls are used.
          controls: 0,

          // Prevent keyboard control.
          disablekb: 1,

          modestbranding: 1,

          rel: 0,

          playsinline: 1

        },


        events: {

          // ------------------------------------------
          // READY
          // ------------------------------------------

          onReady: (event) => {

            if (cancelled) {
              return;
            }


            setPlayerReady(true);


            const player =
              event.target;


            const playerDuration =
              player.getDuration();


            if (
              Number.isFinite(
                playerDuration
              ) &&
              playerDuration > 0
            ) {

              setDuration(
                playerDuration
              );

            }


            if (videoId) {

              try {

                player.cueVideoById(
                  videoId
                );

              } catch (error) {

                console.log(
                  "Initial video load error:",
                  error
                );

              }

            }

          },


          // ------------------------------------------
          // STATE CHANGE
          // ------------------------------------------

          onStateChange: (event) => {

            if (cancelled) {
              return;
            }


            // Ignore events produced by
            // remote synchronization.
            if (
              applyingRemoteUpdateRef.current ||
              Date.now() < suppressPlayerEventsUntilRef.current
            ) {
              return;
            }


            // PLAYING

            if (
              event.data ===
              window.YT.PlayerState.PLAYING
            ) {

              const time =
                playerRef.current
                  ?.getCurrentTime() || 0;


              setIsPlaying(true);

              setCurrentTime(time);


              if (canControlRef.current) {

                socket.emit(
                  "play",
                  {
                    currentTime: time
                  }
                );

              }

            }


            // PAUSED

            else if (
              event.data ===
              window.YT.PlayerState.PAUSED
            ) {

              const time =
                playerRef.current
                  ?.getCurrentTime() || 0;


              setIsPlaying(false);

              setCurrentTime(time);


              if (canControlRef.current) {

                socket.emit(
                  "pause",
                  {
                    currentTime: time
                  }
                );

              }

            }


            // ENDED

            else if (
              event.data ===
              window.YT.PlayerState.ENDED
            ) {

              const time =
                playerRef.current
                  ?.getCurrentTime() || 0;


              setIsPlaying(false);

              setCurrentTime(time);


              if (canControlRef.current) {

                socket.emit(
                  "pause",
                  {
                    currentTime: time
                  }
                );

              }

            }

          }

        }

      };


      // Important:
      // Do NOT pass undefined as videoId.

      if (videoId) {
        playerOptions.videoId = videoId;
      }


      playerRef.current =
        new window.YT.Player(
          playerContainerRef.current,
          playerOptions
        );

    };


    createPlayer();


    return () => {

      cancelled = true;


      if (playerRef.current) {

        try {

          playerRef.current.destroy();

        } catch (error) {

          console.log(
            "Player cleanup error:",
            error
          );

        }

        playerRef.current = null;

      }

    };

  }, []);


  // ====================================================
  // UPDATE CUSTOM TIMELINE
  // ====================================================

  useEffect(() => {

    if (!playerReady) {
      return;
    }


    timeUpdateIntervalRef.current =
      setInterval(() => {

        if (!playerRef.current) {
          return;
        }


        const time =
          playerRef.current.getCurrentTime();


        const playerDuration =
          playerRef.current.getDuration();


        if (!isSeeking) {

          setCurrentTime(time);

        }


        if (
          Number.isFinite(playerDuration) &&
          playerDuration > 0
        ) {

          setDuration(
            playerDuration
          );

        }

      }, 250);


    return () => {

      if (
        timeUpdateIntervalRef.current
      ) {

        clearInterval(
          timeUpdateIntervalRef.current
        );

        timeUpdateIntervalRef.current =
          null;

      }

    };

  }, [
    playerReady,
    isSeeking
  ]);


  // ====================================================
  // AUTO-SCROLL CHAT
  // ====================================================

  useEffect(() => {

    if (!chatMessagesRef.current) {
      return;
    }


    chatMessagesRef.current.scrollTop =
      chatMessagesRef.current.scrollHeight;

  }, [messages]);


  // ====================================================
  // SOCKET EVENTS
  // ====================================================

  useEffect(() => {

    // ----------------------------------------------
    // USER JOINED
    // ----------------------------------------------

    const handleUserJoined = (data) => {

      setParticipants(
        data.participants || []
      );

    };


    // ----------------------------------------------
    // USER LEFT
    // ----------------------------------------------

    const handleUserLeft = (data) => {

      setParticipants(
        data.participants || []
      );

    };


    // ----------------------------------------------
    // ROLE ASSIGNED
    // ----------------------------------------------

    const handleRoleAssigned = (data) => {

      setParticipants(
        data.participants || []
      );


      // If the role belongs to us,
      // update our local permission.
      if (
        data.userId === myUserId
      ) {

        setMyRole(
          data.role
        );


        showToast(
          `You are now ${data.role}.`
        );

      }

    };


    // ----------------------------------------------
    // PARTICIPANT REMOVED
    // ----------------------------------------------

    const handleParticipantRemoved = (data) => {

      setParticipants(
        data.participants || []
      );

    };


    // ----------------------------------------------
    // HOST TRANSFERRED
    // ----------------------------------------------

    const handleHostTransferred = (data) => {

      setParticipants(
        data.participants || []
      );

    };


    // ----------------------------------------------
    // ERROR
    // ----------------------------------------------

    const handleErrorMessage = (data) => {

      showToast(
        data?.error ||
        "Action not allowed.",
        2500
      );

    };


    // ----------------------------------------------
    // CHAT MESSAGE
    // ----------------------------------------------

    const handleChatMessage = (message) => {

      setMessages((previous) => [
        ...previous,
        message
      ]);

    };


    // ----------------------------------------------
    // REMOVED FROM ROOM
    // ----------------------------------------------

    const handleRemoved = () => {

      alert(
        "You've been removed from the room by the host."
      );

      onLeave();

    };


    // ----------------------------------------------
    // REGISTER
    // ----------------------------------------------

    socket.on(
      "user_joined",
      handleUserJoined
    );

    socket.on(
      "user_left",
      handleUserLeft
    );

    socket.on(
      "role_assigned",
      handleRoleAssigned
    );

    socket.on(
      "participant_removed",
      handleParticipantRemoved
    );

    socket.on(
      "host_transferred",
      handleHostTransferred
    );

    socket.on(
      "error_message",
      handleErrorMessage
    );

    socket.on(
      "chat_message",
      handleChatMessage
    );

    socket.on(
      "you_were_removed",
      handleRemoved
    );


    // ----------------------------------------------
    // CLEANUP
    // ----------------------------------------------

    return () => {

      socket.off(
        "user_joined",
        handleUserJoined
      );

      socket.off(
        "user_left",
        handleUserLeft
      );

      socket.off(
        "role_assigned",
        handleRoleAssigned
      );

      socket.off(
        "participant_removed",
        handleParticipantRemoved
      );

      socket.off(
        "host_transferred",
        handleHostTransferred
      );

      socket.off(
        "error_message",
        handleErrorMessage
      );

      socket.off(
        "chat_message",
        handleChatMessage
      );

      socket.off(
        "you_were_removed",
        handleRemoved
      );

    };

  }, [myUserId, onLeave]);


  // ====================================================
  // SYNC STATE
  // ====================================================

  useEffect(() => {

    const handleSyncState = (state) => {

      if (!state) {
        return;
      }


      const remoteVideoId =
        state.videoId || null;

      const remotePlayState =
        state.playState || "paused";

      const remoteTime =
        Number(state.currentTime) || 0;


      setCurrentTime(
        remoteTime
      );


      setIsPlaying(
        remotePlayState === "playing"
      );


      // Player isn't ready yet.
      // Just save the video ID.
      if (
        !playerRef.current ||
        !playerReady
      ) {

        if (remoteVideoId) {

          setVideoId(
            remoteVideoId
          );

        }

        return;

      }


      applyingRemoteUpdateRef.current =
        true;


      // --------------------------------------------
      // DIFFERENT VIDEO
      // --------------------------------------------

      if (
        remoteVideoId &&
        remoteVideoId !== videoId
      ) {

        setVideoId(
          remoteVideoId
        );


        try {

          playerRef.current.loadVideoById(
            remoteVideoId,
            remoteTime
          );

        } catch (error) {

          console.log(
            "Remote video load error:",
            error
          );

        }

      }


      // --------------------------------------------
      // SAME VIDEO
      // --------------------------------------------

      else if (remoteVideoId) {

        const localTime =
          playerRef.current
            .getCurrentTime();


        const difference =
          Math.abs(
            localTime - remoteTime
          );


        // Only correct noticeable drift.

        if (difference > 0.5) {

          try {

            playerRef.current.seekTo(
              remoteTime,
              true
            );

          } catch (error) {

            console.log(
              "Remote seek error:",
              error
            );

          }

        }

      }


      // --------------------------------------------
      // PLAY / PAUSE
      // --------------------------------------------

      if (
        remotePlayState === "playing"
      ) {

        try {

          playerRef.current.playVideo();

        } catch (error) {

          console.log(
            "Remote play error:",
            error
          );

        }

      } else {

        try {

          playerRef.current.pauseVideo();

        } catch (error) {

          console.log(
            "Remote pause error:",
            error
          );

        }

      }


      // --------------------------------------------
      // RELEASE LOCK
      // --------------------------------------------

      setTimeout(() => {

        applyingRemoteUpdateRef.current =
          false;

      }, 600);

    };


    socket.on(
      "sync_state",
      handleSyncState
    );


    return () => {

      socket.off(
        "sync_state",
        handleSyncState
      );

    };

  }, [
    playerReady,
    videoId
  ]);


  // ====================================================
  // COPY ROOM CODE
  // ====================================================

  const copyRoomCode = async () => {

    try {

      await navigator.clipboard.writeText(
        roomData.roomId
      );


      showToast(
        "Room code copied!"
      );

    } catch (error) {

      showToast(
        "Couldn't copy room code."
      );

    }

  };


  // ====================================================
  // PLAY / PAUSE
  // ====================================================

  const handlePlayPause = () => {

    if (
      !canControl ||
      !playerReady ||
      !playerRef.current ||
      !videoId
    ) {
      return;
    }

    // An intentional button press is a real playback command,
    // so clear any old seek suppression window.
    suppressPlayerEventsUntilRef.current = 0;


    if (isPlaying) {

      playerRef.current.pauseVideo();

    } else {

      playerRef.current.playVideo();

    }

  };


  // ====================================================
  // SEEK
  // ====================================================

  const handleSeekStart = () => {

    if (!canControl) {
      return;
    }

    setIsSeeking(true);

  };


  const handleSeekChange = (event) => {

    if (!canControl) {
      return;
    }


    const time =
      Number(event.target.value);


    setCurrentTime(
      time
    );

  };


  const handleSeekEnd = () => {

    if (
      !canControl ||
      !playerReady ||
      !playerRef.current
    ) {

      setIsSeeking(false);

      return;

    }


    const time =
      Number(currentTime);

    // Save the playback state before seeking.
    const wasPlaying = isPlaying;


    // Seeking can make YouTube emit a temporary PAUSED
    // or PLAYING event. Suppress those events so they
    // cannot overwrite the server's room state.
    applyingRemoteUpdateRef.current = true;

    suppressPlayerEventsUntilRef.current =
      Date.now() + 1200;


    try {

      playerRef.current.seekTo(
        time,
        true
      );

    } catch (error) {

      console.log(
        "Seek error:",
        error
      );

    }


    setCurrentTime(time);

    setIsSeeking(false);


    // The server's seek handler preserves the existing
    // playState, so a seek while playing stays playing.
    socket.emit(
      "seek",
      {
        time
      }
    );


    // Keep the local player in the same state too.
    if (wasPlaying) {

      try {

        playerRef.current.playVideo();

      } catch (error) {

        console.log(
          "Resume after seek error:",
          error
        );

      }

    } else {

      try {

        playerRef.current.pauseVideo();

      } catch (error) {

        console.log(
          "Pause after seek error:",
          error
        );

      }

    }


    setTimeout(() => {

      applyingRemoteUpdateRef.current =
        false;

    }, 1200);

  };


  // ====================================================
  // LOAD VIDEO
  // ====================================================

  const handleLoadVideo = () => {

    if (!canControl) {
      return;
    }


    const id =
      extractVideoId(videoInput);


    if (!id) {

      showToast(
        "Please enter a valid YouTube URL.",
        2500
      );

      return;

    }


    // Server is responsible for
    // broadcasting the new video.

    socket.emit(
      "change_video",
      {
        videoId: id
      }
    );

  };


  // ====================================================
  // CHAT SEND
  // ====================================================

  const handleSendMessage = (event) => {

    event.preventDefault();


    const text =
      chatInput.trim();


    if (!text) {
      return;
    }


    socket.emit(
      "chat_message",
      {
        text
      }
    );


    setChatInput("");

  };


  // ====================================================
  // LEAVE ROOM
  // ====================================================

  const handleLeave = () => {

    socket.emit(
      "leave_room"
    );

    onLeave();

  };


  // ====================================================
  // PARTICIPANT MANAGEMENT
  // ====================================================

  const handleMakeModerator = (userId) => {

    if (myRole !== "host") {
      return;
    }

    socket.emit("assign_role", {
      userId,
      role: "moderator",
    });

  };


  const handleMakeParticipant = (userId) => {

    if (myRole !== "host") {
      return;
    }

    socket.emit("assign_role", {
      userId,
      role: "participant",
    });

  };


  const handleRemoveParticipant = (userId) => {

    if (myRole !== "host") {
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to remove this participant?"
    );

    if (!confirmed) {
      return;
    }

    socket.emit("remove_participant", {
      userId,
    });

  };


  const handleTransferHost = (userId) => {

    if (myRole !== "host") {
      return;
    }

    const confirmed = window.confirm(
      "Transfer host role to this participant?"
    );

    if (!confirmed) {
      return;
    }

    socket.emit("transfer_host", {
      userId,
    });

  };


  // ====================================================
  // RENDER
  // ====================================================

  return (

    <div className="room-page">


      {/* ==================================================
          HEADER
      ================================================== */}

      <header className="room-header">

        <div className="room-brand">

          <div className="room-brand-icon">
            ▶
          </div>


          <div>

            <div className="room-brand-title">
              Watch <span>Party</span>
            </div>


            <div className="room-code-wrapper">

              <span className="room-code-label">
                ROOM CODE
              </span>


              <strong className="room-code">
                {roomData.roomId}
              </strong>


              <button
                className="copy-code-btn"
                onClick={copyRoomCode}
                title="Copy room code"
              >
                📋
              </button>

            </div>

          </div>

        </div>


        <div className="room-header-right">

          <div className="live-status">

            <span className="live-dot"></span>

            LIVE

          </div>


          <div
            className={`role-pill ${myRole}`}
          >
            {myRole}
          </div>


          <button
            className="leave-button"
            onClick={handleLeave}
          >
            Leave
          </button>

        </div>

      </header>


      {/* ==================================================
          MAIN
      ================================================== */}

      <main className="room-content">


        {/* =================================================
            VIDEO
        ================================================= */}

        <section className="video-section">


          <div className="video-container">

            <div
              ref={playerContainerRef}
              className={`youtube-player ${
                !canControl
                  ? "readonly"
                  : ""
              }`}
            />


            {!videoId && (

              <div className="video-empty-overlay">

                <div className="video-placeholder-icon">
                  ▶
                </div>


                <h2>
                  Your watch party starts here
                </h2>


                <p>
                  Paste a YouTube link below
                  to start watching.
                </p>

              </div>

            )}

          </div>


          {/* =================================================
              PLAYBACK CONTROLS
          ================================================= */}

          <div className="playback-controls">


            {/* ONE PLAY / PAUSE BUTTON */}

            <button
              className="video-control"
              disabled={
                !canControl ||
                !playerReady ||
                !videoId
              }
              onClick={
                handlePlayPause
              }
              title={
                isPlaying
                  ? "Pause"
                  : "Play"
              }
            >

              {isPlaying
                ? "⏸"
                : "▶"}

            </button>


            {/* TIMELINE */}

            <input
              className="seek-bar"
              type="range"
              min="0"
              max={duration || 0}
              step="0.1"
              value={
                Math.min(
                  currentTime,
                  duration || 0
                )
              }
              disabled={
                !canControl ||
                !playerReady ||
                !videoId ||
                !duration
              }
              onMouseDown={
                handleSeekStart
              }
              onTouchStart={
                handleSeekStart
              }
              onChange={
                handleSeekChange
              }
              onMouseUp={
                handleSeekEnd
              }
              onTouchEnd={
                handleSeekEnd
              }
            />


            {/* TIME */}

            <span className="video-time">

              {formatTime(
                currentTime
              )}

              {" / "}

              {formatTime(
                duration
              )}

            </span>

          </div>


          {/* =================================================
              VIDEO URL
          ================================================= */}

          <div className="video-url-section">

            <input
              type="text"
              placeholder="Paste YouTube link or video ID..."
              value={videoInput}
              onChange={(event) =>
                setVideoInput(
                  event.target.value
                )
              }
              disabled={
                !canControl
              }
              onKeyDown={(event) => {

                if (
                  event.key === "Enter"
                ) {

                  handleLoadVideo();

                }

              }}
            />


            <button
              onClick={
                handleLoadVideo
              }
              disabled={
                !canControl
              }
            >
              Load Video
            </button>

          </div>


          {/* PARTICIPANT MESSAGE */}

          {!canControl && (

            <p className="watching-message">

              🔒 Playback is controlled
              by the host or moderator.

            </p>

          )}

        </section>


        {/* =================================================
            SIDEBAR
        ================================================= */}

        <aside className="room-sidebar">


          {/* =================================================
              TABS
          ================================================= */}

          <div className="sidebar-tabs">

            <button
              className={
                activeTab === "people"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setActiveTab("people")
              }
            >

              People

              <span className="people-count">

                {participants.length}

              </span>

            </button>


            <button
              className={
                activeTab === "chat"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setActiveTab("chat")
              }
            >

              Chat

              {messages.length > 0 && (

                <span className="people-count">
                  {messages.length}
                </span>

              )}

            </button>

          </div>


          {/* =================================================
              PEOPLE
          ================================================= */}

          {activeTab === "people" && (

            <div className="people-panel">

              <ul className="people-list">

                {participants.map(
                  (participant) => (

                    <li
                      className="person-card"
                      key={
                        participant.userId
                      }
                    >

                      <div className="person-left">

                        <div className="person-avatar">

                          {participant.username
                            ?.charAt(0)
                            .toUpperCase()}

                        </div>

                        <div>

                          <div
                            className={
                              participant.userId ===
                              myUserId
                                ? "person-name you"
                                : "person-name"
                            }
                          >

                            {participant.username}

                            {participant.userId ===
                              myUserId && (
                              <span>
                                {" "}
                                (you)
                              </span>
                            )}

                          </div>

                        </div>

                      </div>

                      <div className="person-actions">

                        <span
                          className={`person-role ${participant.role}`}
                        >
                          {participant.role}
                        </span>

                        {myRole === "host" &&
                          participant.userId !== myUserId && (

                          <div className="participant-menu">

                            {participant.role === "participant" && (
                              <button
                                type="button"
                                className="manage-button"
                                onClick={() =>
                                  handleMakeModerator(
                                    participant.userId
                                  )
                                }
                                title="Make Moderator"
                                aria-label="Make Moderator"
                              >
                                🛡️
                              </button>
                            )}

                            {participant.role === "moderator" && (
                              <button
                                type="button"
                                className="manage-button"
                                onClick={() =>
                                  handleMakeParticipant(
                                    participant.userId
                                  )
                                }
                                title="Remove Moderator Role"
                                aria-label="Remove Moderator Role"
                              >
                                👤
                              </button>
                            )}

                            <button
                              type="button"
                              className="manage-button transfer"
                              onClick={() =>
                                handleTransferHost(
                                  participant.userId
                                )
                              }
                              title="Transfer Host"
                              aria-label="Transfer Host"
                            >
                              👑
                            </button>

                            <button
                              type="button"
                              className="manage-button remove"
                              onClick={() =>
                                handleRemoveParticipant(
                                  participant.userId
                                )
                              }
                              title="Remove Participant"
                              aria-label="Remove Participant"
                            >
                              ✕
                            </button>

                          </div>
                        )}

                      </div>

                    </li>

                  )
                )}

              </ul>

            </div>

          )}


          {/* =================================================
              CHAT
          ================================================= */}

          {activeTab === "chat" && (

            <div className="chat-panel">


              {/* MESSAGES */}

              <div
                className="chat-messages"
                ref={chatMessagesRef}
              >

                {messages.length === 0 ? (

                  <div className="empty-chat">

                    <div>
                      💬
                    </div>


                    <h3>
                      No messages yet
                    </h3>


                    <p>
                      Start the conversation!
                    </p>

                  </div>

                ) : (

                  messages.map(
                    (message) => (

                      <div
                        className={
                          message.userId ===
                          myUserId
                            ? "chat-message own"
                            : "chat-message"
                        }
                        key={
                          message.id
                        }
                      >

                        <div className="chat-message-user">

                          {message.username}

                        </div>


                        <div className="chat-message-text">

                          {message.text}

                        </div>

                      </div>

                    )
                  )

                )}

              </div>


              {/* INPUT */}

              <form
                className="chat-input-area"
                onSubmit={
                  handleSendMessage
                }
              >

                <input
                  type="text"
                  placeholder="Type a message..."
                  value={chatInput}
                  maxLength={500}
                  onChange={(event) =>
                    setChatInput(
                      event.target.value
                    )
                  }
                />


                <button
                  type="submit"
                  disabled={
                    !chatInput.trim()
                  }
                  title="Send message"
                >
                  ➤
                </button>

              </form>

            </div>

          )}

        </aside>

      </main>


      {/* ==================================================
          TOAST
      ================================================== */}

      {toast && (

        <div className="copy-toast">

          ✓ {toast}

        </div>

      )}

    </div>

  );

}


export default Room;
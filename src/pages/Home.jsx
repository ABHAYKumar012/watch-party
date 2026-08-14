    import { useState } from "react";
import socket from "../services/socket";

function Home({ onRoomCreated, onRoomJoined }) {
    
    const [joinName, setJoinName] = useState("");
    const [roomCode, setRoomCode] = useState("");
    const [joinError, setJoinError] = useState("");

  const [hostName, setHostName] = useState("");
  const [error, setError] = useState("");

  const handleCreateRoom = () => {

    setError("");

    const username = hostName.trim() || "Host";

    socket.emit(
      "create_room",
      { username },
      (response) => {

        console.log("Create room response:", response);

        if (!response || !response.ok) {
          setError(
            response?.error || "Could not create room."
          );
          return;
        }

        // Send room information back to App
        onRoomCreated(response);
      }
    );
  };

  const handleJoinRoom = () => {

  setJoinError("");

  const username = joinName.trim() || "Guest";
  const code = roomCode.trim().toUpperCase();

  if (!code) {
    setJoinError("Please enter a room code.");
    return;
  }

  socket.emit(
    "join_room",
    {
      roomId: code,
      username
    },
    (response) => {

      console.log("Join room response:", response);

      if (!response || !response.ok) {
        setJoinError(
          response?.error || "Could not join room."
        );
        return;
      }

      onRoomJoined(response);
    }
  );
};

  return (
    <main className="landing-page">

      <section className="hero">

        <div className="hero-icon">
          ▶
        </div>

        <h1>
          Watch <span>Party</span>
        </h1>

        <p>
          Watch together. Anywhere. Anytime.
        </p>

        <div className="hero-line"></div>

      </section>


      <section className="room-options">

        {/* CREATE ROOM */}

        <div className="room-card create-card">

          <div className="card-icon">
            ♙
          </div>

          <h2>Create Room</h2>

          <p>
            Be the host and start your watch party 🎉
          </p>

          <label>
            Host Name
          </label>

          <div className="input-wrapper">

            <span>♙</span>

            <input
              type="text"
              placeholder="Enter host name"
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
            />

          </div>

          {error && (
            <p className="form-error">
              {error}
            </p>
          )}

          <button
            className="create-button"
            onClick={handleCreateRoom}
          >
            ＋ &nbsp; Create Room
          </button>

        </div>


        {/* JOIN ROOM */}

        <div className="room-card join-card">

          <div className="card-icon join-icon">
            ♧
          </div>

          <h2>Join Room</h2>

          <p>
            Enter the room code to join the party 🎟️
          </p>

          <label>
            Your Name
          </label>

          <div className="input-wrapper blue-input">

            <span>♙</span>

            <input
  type="text"
  placeholder="Enter your name"
  value={joinName}
  onChange={(e) => setJoinName(e.target.value)}
/>

          </div>

          <label>
            Room Code
          </label>

          <div className="input-wrapper blue-input">

            <span>#</span>

            <input
  type="text"
  placeholder="Enter 6-character code"
  maxLength="6"
  value={roomCode}
  onChange={(e) =>
    setRoomCode(e.target.value.toUpperCase())
  }
/>


          </div>
          {joinError && (
  <p className="form-error">
    {joinError}
  </p>
)}

          <button
  className="join-button"
  onClick={handleJoinRoom}
>
  → &nbsp; Join Room
</button>

        </div>

      </section>


      <section className="features">

        <div className="feature">

          <div className="feature-icon">
            👥
          </div>

          <div>
            <h3>Watch Together</h3>

            <p>
              Sync playback and enjoy
              <br />
              with friends
            </p>
          </div>

        </div>


        <div className="feature">

          <div className="feature-icon green">
            🔒
          </div>

          <div>
            <h3>Private & Secure</h3>

            <p>
              Only invited people can
              <br />
              join your room
            </p>
          </div>

        </div>


        <div className="feature">

          <div className="feature-icon orange">
            🌐
          </div>

          <div>
            <h3>Anywhere, Anytime</h3>

            <p>
              Invite friends and watch
              <br />
              together from anywhere
            </p>
          </div>

        </div>

      </section>

    </main>
  );
}

export default Home;
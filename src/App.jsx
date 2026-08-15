import { useEffect, useState } from "react";
import Home from "./pages/Home";
import Room from "./pages/Room";
import socket from "./services/socket";
import "./index.css";

function App() {
  const [roomData, setRoomData] = useState(null);

  useEffect(() => {
    socket.on("connect", () => {
      console.log("Connected to Socket.IO:", socket.id);
    });

    socket.on("disconnect", () => {
      console.log("Disconnected from Socket.IO");
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
    };
  }, []);

  const handleRoomCreated = (data) => {
    console.log("Room created:", data);

    setRoomData(data);
  };

  const handleRoomJoined = (data) => {
    console.log("Room joined:", data);

    setRoomData(data);
  };

  const handleLeave = () => {
    setRoomData(null);
  };

  useEffect(() => {
  const handleBeforeUnload = (event) => {
    event.preventDefault();
    event.returnValue = "";
  };

  window.addEventListener(
    "beforeunload",
    handleBeforeUnload
  );

  return () => {
    window.removeEventListener(
      "beforeunload",
      handleBeforeUnload
    );
  };
}, []);

  if (roomData) {
    return (
      <Room
        roomData={roomData}
        onLeave={handleLeave}
      />
    );
  }

  return (
    <div className="app">
      <Home
        onRoomCreated={handleRoomCreated}
        onRoomJoined={handleRoomJoined}
      />
    </div>
  );
}

export default App;
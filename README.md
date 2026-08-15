# 🎬 Watch Party

A real-time movie/video watch party application that allows multiple users to watch YouTube videos together in a shared room.

Users can create or join rooms using a unique room code and watch videos together with synchronized playback, role-based controls, and real-time chat.

## 🚀 Live Demo

**Live Application:**  
https://watch-party-client-nall.onrender.com

---

## ✨ Features

- 🎬 Create a private watch party room
- 🔑 Join a room using a 6-character room code
- 👑 Automatic Host role for the room creator
- 🛡️ Moderator role with playback control permissions
- 👤 Participant role with restricted controls
- ▶️ Synchronized Play/Pause
- ⏩ Synchronized video seeking
- 🎥 YouTube video integration
- 💬 Real-time room chat
- 👥 Real-time participant list
- 🔄 Automatic host promotion when the current host leaves
- 📋 Copy room code
- 📱 Responsive mobile-friendly UI
- 🌐 Deployed publicly using Render

---

## 🛠️ Tech Stack

### Frontend

- React.js
- Vite
- JavaScript
- HTML5
- CSS3
- Socket.IO Client

### Backend

- Node.js
- Express.js
- Socket.IO

### Deployment

- Render
- GitHub

---

# 🏗️ Architecture Overview

The Watch Party application uses a client-server architecture with
WebSockets for real-time communication.

## Application Flow

```text
React Frontend
     │
     │ Socket.IO
     ▼
Node.js + Express + Socket.IO Server
     │
     │ Broadcast events
     ▼
Users connected to the same room
```

## 📁 Project Structure

```text
watch-party/
│
├── public/
│
├── server/
│   ├── node_modules/
│   ├── package.json
│   ├── package-lock.json
│   └── server.js
│
├── src/
│   ├── pages/
│   │   ├── Home.jsx
│   │   └── Room.jsx
│   │
│   ├── services/
│   │   └── socket.js
│   │
│   ├── App.jsx
│   ├── App.css
│   ├── index.css
│   └── main.jsx
│
├── .gitignore
├── eslint.config.js
├── index.html
├── package.json
├── package-lock.json
├── README.md
└── vite.config.js



import { useEffect, useState } from "react";

import { createRoom, getRoom, joinRoom } from "./api/rooms";
import { CodeEditor } from "./components/CodeEditor";
import { LanguageSelector } from "./components/LanguageSelector";

import {
  LANGUAGE_OPTIONS,
  type ProgrammingLanguage,
} from "./config/languages";

import "./App.css";

const DEFAULT_CODE = `function greet(name: string) {
  return "Hello, " + name + "!";
}

console.log(greet("Code Together"));`;
// Read a room ID from a URL shaped like:
//
// /rooms/abc123
//
// If the current URL is not a room URL, return null.
function getRoomIdFromUrl(): string | null {
  const match = window.location.pathname.match(
    /^\/rooms\/([^/]+)$/
  );

  return match ? match[1] : null;
}

function App() {
  // The code currently displayed inside Monaco.
  const [code, setCode] = useState(DEFAULT_CODE);

  // The programming language currently selected by the user.
  const [language, setLanguage] =
    useState<ProgrammingLanguage>("typescript");

  // Stores the ID returned by the backend after a room is created.
  // null means that this browser has not created a room yet.
  const [roomId, setRoomId] = useState<string | null>(null);

  // Used to disable the button while the HTTP request is running.
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);

  // The participant ID identifies this browser session inside the room.
  const [participantId, setParticipantId] =
    useState<string | null>(null);

  // Used only for displaying who joined.
  const [displayName, setDisplayName] =
    useState<string | null>(null);

  // Tracks the current Websocket connection state for the UI.
  const [socketStatus, setSocketStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");


  //when the application first loads, check whether the URL already contains a room ID.
  //This lets someone open a shared /rooms/:roomId link directly.
  // When the application first loads, check whether the URL
  // already contains a room ID.
  //
  // This lets someone open a shared /rooms/:roomId link directly.
  useEffect(() => {
    const roomIdFromUrl = getRoomIdFromUrl();

    // If this is just the normal homepage, there is no room to load.
    if (!roomIdFromUrl) {
      return;
    }

    async function loadRoom() {
      try {
        const room = await getRoom(roomIdFromUrl);

        // Store the room ID so the UI knows we are inside a room.
        setRoomId(room.id);

        // Load the server's current editor state.
        setCode(room.editorState.code);
        setLanguage(room.editorState.language);
      } catch (error) {
        console.error("Could not load room:", error);

        alert(
          "Could not load this room. It may not exist anymore."
        );
      }
    }

    void loadRoom();
  }, []);

  // Open a WebSocket connection after this browser
  // has successfully joined a room.
  useEffect(() => {
    // We cannot start a room connection until we know
    // both which room we are in and who this participant is.
    if (!roomId || !participantId) {
      return;
    }

    setSocketStatus("connecting");

    const socket = new WebSocket("ws://localhost:3000");

    // Runs when the WebSocket connection is successfully established.
    socket.onopen = () => {
      console.log("WebSocket connected");
      setSocketStatus("connected");
    };

    // Runs whenever the backend sends us a WebSocket message.
    socket.onmessage = (event) => {
      console.log("WebSocket message:", event.data);
    };

    // Runs when the WebSocket connection closes.
    socket.onclose = () => {
      console.log("WebSocket disconnected");
      setSocketStatus("disconnected");
    };

    // Runs if the browser encounters a WebSocket-level error.
    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    // React calls this cleanup function when the effect
    // is removed or when the component is destroyed.
    return () => {
      socket.close();
    };
  }, [roomId, participantId]);

  const activeLanguage =
    LANGUAGE_OPTIONS.find((option) => option.id === language) ??
    LANGUAGE_OPTIONS[0];

  const fileName = `main.${activeLanguage.extension}`;

  // This function runs when the user clicks "Create Room".
  async function handleCreateRoom() {
    try {
      // Prevent the user from repeatedly creating rooms
      // while the previous request is still running.
      setIsCreatingRoom(true);

      // Call POST /rooms on our backend.
      const room = await createRoom(language);

      // Save the backend-generated room ID in React state.
      setRoomId(room.id);

      //update browser URL without reloading the page. 
      //This gives us a sharable room link such as:
      // http://localhost:5173/rooms/<room-id>
      window.history.pushState(
        {},
        "",
        `/rooms/${room.id}`
      );
    } catch (error) {
      console.error("Could not create room:", error);

      // Simple error handling for now.
      // We can replace this with proper UI later.
      alert("Could not create room. Make sure the backend is running.");
    } finally {
      // This always runs whether the request succeeds or fails.
      setIsCreatingRoom(false);
    }
  }

  //join the currently loaded room as a participant. 
  async function handleJoinRoom() {
    if (!roomId) {
      return;
    }

    // prompt() can later be replaced with proper join form. 
    const name = window.prompt("Enter your display name:");
    if (!name || name.trim().length === 0) {
      return;
    }

    try {
      const participant = await joinRoom(
        roomId,
        name.trim()
      );
      setParticipantId(participant.id);
      setDisplayName(participant.displayName);
    } catch (error) {
      console.error("Could not join room: ", error);
      alert("Could not join this room.");
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">{"</>"}</span>

          <div>
            <h1 className="brand-title">Code Together</h1>

            <p className="brand-subtitle">
              Collaborative coding workspace
            </p>
          </div>
        </div>

        <div className="topbar-actions">
          <LanguageSelector
            language={language}
            onLanguageChange={setLanguage}
          />

          <button
            className="create-room-button"
            type="button"
            onClick={handleCreateRoom}
            disabled={isCreatingRoom}
          >
            {isCreatingRoom ? "Creating..." : "Create Room"}
          </button>

          {roomId && !participantId && (
            <button
              className="create-room-button"
              type="button"
              onClick={handleJoinRoom}
            >
              Join Room
            </button>
          )}

          <div className="connection-status">
            <span className="status-dot" />

            {participantId
              ? `${displayName} · ${socketStatus}`
              : roomId
                ? "Room loaded"
                : "Local session"}
          </div>
        </div>
      </header>

      <main className="workspace">
        <aside className="sidebar">
          <div className="sidebar-title">EXPLORER</div>

          <button
            className="file-item file-item-active"
            type="button"
          >
            <span className="file-badge">
              {activeLanguage.badge}
            </span>

            {fileName}
          </button>
        </aside>

        <section className="editor-panel">
          <div className="editor-tabs">
            <div className="editor-tab editor-tab-active">
              <span className="file-badge">
                {activeLanguage.badge}
              </span>

              {fileName}
            </div>
          </div>

          <div className="editor-container">
            <CodeEditor
              language={language}
              value={code}
              onChange={setCode}
            />
          </div>
        </section>
      </main>

      <footer className="statusbar">
        <span>
          {roomId ? `Room: ${roomId}` : "Local workspace"}
        </span>

        <span>{activeLanguage.label}</span>
      </footer>
    </div>
  );
}

export default App;
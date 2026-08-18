import { useEffect, useState, useRef } from "react";

import {
  createRoom,
  getRoom,
  joinRoom,
  type Participant,
} from "./api/rooms";
import { CodeEditor } from "./components/CodeEditor";
import { CopyRoomLinkButton } from "./components/CopyRoomLinkButton";
import { ParticipantList } from "./components/ParticipantList";
import { PYTHON_EDITOR } from "./config/editor";

import "./App.css";

const DEFAULT_CODE = `def greet(name: str) -> str:
    return f"Hello, {name}!"

print(greet("Code Together"))`;

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:3000";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isParticipant(value: unknown): value is Participant {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.displayName === "string" &&
    typeof value.joinedAt === "number"
  );
}

function isRevision(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

// Read a room ID from a URL shaped like:
//
// /rooms/abc123
//
// If the current URL is not a room URL, return null.
function getRoomIdFromUrl(): string | null {
  const match = window.location.pathname.match(/^\/rooms\/([^/]+)$/);

  return match ? match[1] : null;
}

function App() {
  // The code currently displayed inside Monaco.
  const [code, setCode] = useState(DEFAULT_CODE);

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

  // Presence comes from the server so all collaborators render the
  // same list of currently connected participants.
  const [participants, setParticipants] = useState<Participant[]>([]);

  // Tracks the current WebSocket connection state for the UI.
  const [socketStatus, setSocketStatus] = useState<
    "disconnected" | "connecting" | "connected"
  >("disconnected");

  // A ref lets us keep the WebSocket object between renders
  // without causing a re-render whenever the socket changes.
  const socketRef = useRef<WebSocket | null>(null);

  // The server revision is stored in a ref because changing it should not
  // cause a visual re-render. It is included with every code update.
  const revisionRef = useRef(0);
  const updateInFlightRef = useRef(false);
  const pendingCodeRef = useRef<string | null>(null);

  function sendPendingCodeUpdate(): void {
    const socket = socketRef.current;
    const pendingCode = pendingCodeRef.current;

    if (
      !socket ||
      socket.readyState !== WebSocket.OPEN ||
      updateInFlightRef.current ||
      pendingCode === null
    ) {
      return;
    }

    pendingCodeRef.current = null;
    updateInFlightRef.current = true;

    socket.send(
      JSON.stringify({
        type: "code:update",
        code: pendingCode,
        revision: revisionRef.current,
      })
    );
  }

  // When the application first loads, check whether the URL
  // already contains a room ID.
  //
  // This lets someone open a shared /rooms/:roomId link directly.
  useEffect(() => {
    const roomIdFromUrl = getRoomIdFromUrl();

    // If the URL does not contain a room ID,
    // there is no room to load.
    if (!roomIdFromUrl) {
      return;
    }

    // Pass the already-validated room ID into this function.
    // Because the parameter type is string, TypeScript now knows
    // it cannot be null.
    async function loadRoom(roomId: string) {
      try {
        const room = await getRoom(roomId);

        setRoomId(room.id);
        setCode(room.editorState.code);
        revisionRef.current = room.editorState.revision;
      } catch (error) {
        console.error("Could not load room:", error);

        alert(
          "Could not load this room. It may not exist anymore."
        );
      }
    }

    void loadRoom(roomIdFromUrl);
  }, []);

  // Open a WebSocket connection after this browser
  // has successfully joined a room.
  useEffect(() => {
    // We cannot start a room connection until we know
    // both which room we are in and who this participant is.
    if (!roomId || !participantId) {
      return;
    }

    const socket = new WebSocket(WS_URL);

    // Keep this WebSocket available to other functions
    // inside the component.
    socketRef.current = socket;

    // Runs when the WebSocket connection is successfully established.
    socket.onopen = () => {
      console.log("WebSocket connected");

      // The network connection is open,
      // but we still need the server to accept our room:join.
      socket.send(
        JSON.stringify({
          type: "room:join",
          roomId,
          participantId,
        })
      );
    };

    // Runs whenever the backend sends us a WebSocket message.
    socket.onmessage = (event) => {
      try {
        const parsedMessage: unknown = JSON.parse(event.data);

        if (!isRecord(parsedMessage) || typeof parsedMessage.type !== "string") {
          return;
        }

        const message = parsedMessage;

        console.log(
          "WebSocket message:",
          message
        );

        // The server confirmed that this WebSocket
        // is now attached to the room.
        if (message.type === "room:joined") {
          setSocketStatus("connected");

          if (isRecord(message.editorState)) {
            if (
              typeof message.editorState.code === "string" &&
              isRevision(message.editorState.revision)
            ) {
              setCode(message.editorState.code);
              revisionRef.current = message.editorState.revision;
              updateInFlightRef.current = false;
              pendingCodeRef.current = null;
            }
          }

          return;
        }

        // Another collaborator changed the code.
        if (
          message.type === "code:update" &&
          typeof message.code === "string" &&
          isRevision(message.revision)
        ) {
          if (message.revision < revisionRef.current) {
            return;
          }

          revisionRef.current = message.revision;

          if (message.participantId === participantId) {
            updateInFlightRef.current = false;
            sendPendingCodeUpdate();
          } else {
            setCode(message.code);
          }

          return;
        }

        if (message.type === "room:error") {
          console.error(
            "Room message rejected:",
            typeof message.error === "string" ? message.error : "Unknown error"
          );

          if (
            isRecord(message.editorState) &&
            typeof message.editorState.code === "string" &&
            isRevision(message.editorState.revision)
          ) {
            setCode(message.editorState.code);
            revisionRef.current = message.editorState.revision;
          }

          updateInFlightRef.current = false;
          pendingCodeRef.current = null;
          return;
        }

        if (
          message.type === "presence:update" &&
          Array.isArray(message.participants) &&
          message.participants.every(isParticipant)
        ) {
          setParticipants(message.participants);
        }
      } catch (error) {
        console.error(
          "Could not parse WebSocket message:",
          error
        );
      }
    };

    // Runs when the WebSocket connection closes.
    socket.onclose = () => {
      console.log("WebSocket disconnected");
      setSocketStatus("disconnected");
      setParticipants([]);
      updateInFlightRef.current = false;
      pendingCodeRef.current = null;
    };

    // Runs if the browser encounters a WebSocket-level error.
    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    // React calls this cleanup function when the effect
    // is removed or when the component is destroyed.
    return () => {
      socket.close();

      // Do not leave a reference pointing at
      // a WebSocket that has already been closed.
      socketRef.current = null;
    };
  }, [roomId, participantId]);

  const roomUrl = roomId
    ? new URL(`/rooms/${encodeURIComponent(roomId)}`, window.location.origin)
      .toString()
    : null;

  // This function runs when the user clicks "Create Room".
  async function handleCreateRoom() {
    try {
      // Prevent the user from repeatedly creating rooms
      // while the previous request is still running.
      setIsCreatingRoom(true);

      // Call POST /rooms on our backend.
      const room = await createRoom(code);

      // Save the backend-generated room ID in React state.
      setRoomId(room.id);
      setCode(room.editorState.code);
      revisionRef.current = room.editorState.revision;

      // Update the browser URL without reloading the page.
      // This gives us a shareable room link such as:
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

  // Join the currently loaded room as a participant.
  async function handleJoinRoom() {
    if (!roomId) {
      return;
    }

    // prompt() can later be replaced with a proper join form.
    const name = window.prompt("Enter your display name:");
    if (!name || name.trim().length === 0) {
      return;
    }

    try {
      const participant = await joinRoom(roomId, name.trim());
      setSocketStatus("connecting");
      setParticipantId(participant.id);
      setDisplayName(participant.displayName);
    } catch (error) {
      console.error("Could not join room: ", error);
      alert("Could not join this room.");
    }
  }

  // Runs every time the local user changes the Monaco editor.
  function handleCodeChange(newCode: string) {
    // Update this browser immediately.
    setCode(newCode);

    const socket = socketRef.current;

    // Only send the update after our socket has been
    // successfully attached to the room.
    if (
      socket &&
      socket.readyState === WebSocket.OPEN &&
      socketStatus === "connected"
    ) {
      pendingCodeRef.current = newCode;
      sendPendingCodeUpdate();
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
          {!roomId && (
            <button
              className="topbar-button"
              type="button"
              onClick={handleCreateRoom}
              disabled={isCreatingRoom}
            >
              {isCreatingRoom ? "Creating..." : "Create Room"}
            </button>
          )}

          {roomUrl && <CopyRoomLinkButton roomUrl={roomUrl} />}

          {roomId && !participantId && (
            <button
              className="topbar-button"
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
              {PYTHON_EDITOR.badge}
            </span>

            {PYTHON_EDITOR.fileName}
          </button>

          <ParticipantList participants={participants} />
        </aside>

        <section className="editor-panel">
          <div className="editor-tabs">
            <div className="editor-tab editor-tab-active">
              <span className="file-badge">
                {PYTHON_EDITOR.badge}
              </span>

              {PYTHON_EDITOR.fileName}
            </div>
          </div>

          <div className="editor-container">
            <CodeEditor
              value={code}
              onChange={handleCodeChange}
              readOnly={Boolean(roomId) && socketStatus !== "connected"}
            />
          </div>
        </section>
      </main>

      <footer className="statusbar">
        <span>
          {roomId ? `Room: ${roomId}` : "Local workspace"}
        </span>

        <span>{PYTHON_EDITOR.label}</span>
      </footer>
    </div>
  );
}

export default App;

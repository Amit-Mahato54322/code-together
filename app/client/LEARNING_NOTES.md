# Frontend Learning Notes

## Controlled Monaco Editor

- `App` stores the current code in React `useState`.
- The code is passed to `CodeEditor` through its `value` prop, so Monaco is a controlled editor.
- Monaco calls the `onChange` prop when the local user types.
- The local state updates immediately, and a connected room sends the complete document plus its expected revision in `code:update`.
- A remote `code:update` changes the same React state, so Monaco renders the collaborator's latest document.
- Whole-document updates are easy to trace and appropriate for a small room. PostgreSQL rejects a stale expected revision instead of overwriting newer state.

## Props and Focused Components

- Props are values and callbacks passed from a parent component to a child component.
- `CodeEditor` receives code, read-only state, and an edit callback. It reads the fixed Python mode from the central editor configuration.
- `ParticipantList` receives the current server-provided participant array.
- `App` coordinates shared room behavior, while these components focus on rendering one part of the interface.

## React State

- `useState` is used for values that must update the UI: code, room ID, participant identity, connection status, and presence.
- A room ID identifies the shared workspace. A participant ID identifies this temporary browser session.
- The display name is presentation data, while the participant ID is what the server validates during `room:join`.
- Keeping UI data in state means React automatically renders the current status after an HTTP response or WebSocket message.

## WebSocket Lifecycle

- `useEffect` opens a WebSocket only after HTTP join has returned both a room ID and participant ID.
- `onopen` sends `room:join`; an open network connection is not considered room-connected until `room:joined` arrives.
- `onmessage` parses server JSON and checks important values at runtime before changing UI state.
- The effect cleanup closes its socket. This prevents an old connection from remaining active after the component is removed.
- `onclose` clears presence and changes the connection display to disconnected.
- Refreshing closes the socket, so the current simple application requires the user to join again.

## Why the Socket Uses `useRef`

- The WebSocket object needs to survive React renders so button and editor handlers can send messages through it.
- Changing the socket object itself does not need to redraw the interface.
- `useRef` stores that long-lived mutable object without causing a render.
- Additional refs hold the last accepted revision, whether an update is in flight, and the newest queued code.
- Connection status does affect the interface, so it belongs in `useState` instead.

## Server-Authoritative Room State

- `room:joined` includes the latest server code. Applying it prevents a stale room-loading response from becoming the active editor state.
- Local editor changes use `code:update`; accepted changes come back through the same message type as either a sender acknowledgement or a remote update.
- Only one code update is in flight. If the user keeps typing, the newest complete document waits in `pendingCodeRef` until the acknowledgement advances `revisionRef`.
- A stale-update `room:error` can include canonical `editorState`, allowing the client to resynchronize code and revision.
- The editor is read-only between loading a room and completing its join, avoiding unsynchronized local edits.

## Python-Only Frontend

- `config/editor.ts` is the single source of truth for the Python Monaco mode, `main.py` filename, badge, and label.
- The frontend has no language state or selector and does not send or handle `language:update` messages.
- Room creation explicitly sends the centralized `"python"` value to the existing API.
- The backend keeps its general language type and protocol for compatibility and future extension.
- Additional languages can be restored later by expanding the editor configuration and reintroducing a selector and language state; the server contract does not need to be redesigned.

## Presence Updates

- `presence:update` contains the temporary Participants currently connected to this room.
- The client checks that every item has an ID, display name, and join timestamp before storing it.
- `ParticipantList` uses the participant ID as a stable React list key and shows the display name.
- Join and leave updates come over the existing room WebSocket; no polling or separate presence service is needed.

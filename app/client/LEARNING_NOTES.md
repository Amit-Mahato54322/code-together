# Frontend Learning Notes

## Controlled Monaco Editor

- `App` stores the current code in React `useState`.
- The code is passed to `CodeEditor` through its `value` prop, so Monaco is a controlled editor.
- Monaco calls the `onChange` prop when the local user types.
- The local state updates immediately, and a connected room also sends the complete document in `code:update`.
- A remote `code:update` changes the same React state, so Monaco renders the collaborator's latest document.
- Whole-document updates are easy to trace and appropriate for a room of roughly 3-4 people. Simultaneous conflicting edits are currently last-write-wins.

## Props and Focused Components

- Props are values and callbacks passed from a parent component to a child component.
- `CodeEditor` receives code, language, read-only state, and an edit callback.
- `LanguageSelector` receives the accepted language and a change callback.
- `ParticipantList` receives the current server-provided participant array.
- `App` coordinates shared room behavior, while these components focus on rendering one part of the interface.

## React State

- `useState` is used for values that must update the UI: code, language, room ID, participant identity, connection status, and presence.
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
- Connection status does affect the interface, so it belongs in `useState` instead.

## Server-Authoritative Room State

- `room:joined` includes the latest server code and language. This prevents a stale room-loading response from becoming the active editor state.
- Local editor changes use `code:update`; accepted remote changes come back through the same message type.
- A language selection sends `language:update`, but the UI applies room changes only when the server broadcasts the accepted language.
- The selector and editor are read-only/disabled between loading a room and completing its join, avoiding unsynchronized local edits.

## Presence Updates

- `presence:update` contains the temporary Participants currently connected to this room.
- The client checks that every item has an ID, display name, and join timestamp before storing it.
- `ParticipantList` uses the participant ID as a stable React list key and shows the display name.
- Join and leave updates come over the existing room WebSocket; no polling or separate presence service is needed.

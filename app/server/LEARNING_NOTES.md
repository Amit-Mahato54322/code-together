# Backend Learning Notes

## Room Domain Model

- `Room` represents one collaborative coding session.
- `EditorState` contains code, language, and revision.
- The server will eventually own the canonical editor state.
- `revision` helps detect stale/concurrent updates.

## Participant Domain Model

- A Participant represents someone's presence in a room.
- Participant identity is different from a WebSocket connection.
- A reconnect can create a new socket without creating a new human participant.

## RoomStore

- A store is responsible for storing and retrieving data.
- `Map<string, Room>` gives room ID → Room lookup.
- `private` provides encapsulation.
- `readonly` prevents reassigning the Map reference.
- In-memory state disappears when the server restarts.

## RoomService

/*
Learning Notes - RoomService

1. RoomService contains room-related business logic.
   It decides how rooms are created and retrieved.

2. RoomStore is responsible only for storing rooms.
   RoomService uses RoomStore instead of directly managing a Map.

3. The RoomStore is passed into RoomService through the constructor.
   This is dependency injection:
   RoomService depends on storage, but does not create the storage itself.

4. randomUUID() generates a unique ID for each room.

5. A new room starts with:
   - empty code
   - selected/default language
   - revision 0
   - no participants
   - current creation timestamp

6. createRoom() follows this flow:
   create Room -> save Room -> return Room

7. getRoom() may return undefined because the requested room
   might not exist.

Architecture:
future HTTP/WebSocket handler
        -> RoomService
        -> RoomStore
        -> in-memory Map
*/



## ParticipantStore

- ParticipantStore keeps participant data in server memory.
- It uses `Map<string, Participant>` for ID -> participant lookup.
- `save()` adds or replaces a participant.
- `get()` returns `Participant | undefined` because an ID may not exist.
- `delete()` removes a participant from memory.
- RoomStore and ParticipantStore are separate because rooms and participants are separate domain concepts.
- We are intentionally not creating a generic Store abstraction yet because the two stores may need different behavior later.




## Joining a Room

- `joinRoom(roomId, displayName)` is business logic inside RoomService.
- The service first checks whether the room exists.
- If the room does not exist, it returns `undefined`.
- If the room exists:
  1. Create a Participant.
  2. Save the Participant in ParticipantStore.
  3. Add the participant ID to the Room.
  4. Save the updated Room.
  5. Return the Participant.
- RoomService does not know anything about HTTP status codes yet.
- For this small project, directly mutating the in-memory Room object is acceptable and keeps the code simple.



## Node + Express Server Foundation

- The frontend and backend are separate applications and have separate package.json files.
- Express is the HTTP framework used by the backend.
- `src/index.ts` is the backend entry point.
- `tsx` runs TypeScript directly during development and can restart the server when files change.
- `tsconfig.json` controls how TypeScript is checked and compiled.
- `src/` contains TypeScript source code.
- `dist/` will contain compiled JavaScript.
- `app.use(express.json())` is middleware that parses JSON request bodies.
- A route consists of an HTTP method and path, such as `GET /health`.
- `response.json()` sends JSON back to the client.
- `app.listen(3000)` starts the backend on port 3000.
- The frontend and backend run as separate processes:
  - frontend: localhost:5173
  - backend: localhost:3000



## Backend Build

- `npm run dev` runs TypeScript directly with tsx for development.
- `npm run build` uses the TypeScript compiler (`tsc`) to compile all backend source files.
- Compiled JavaScript goes into `dist/`.
- `npm start` runs the compiled JavaScript from `dist/`.
- A backend can run in development while another TypeScript file still contains compile errors, so production build validation is an important checkpoint.


## POST /rooms

- `POST /rooms` creates a new collaborative room.
- The HTTP route calls `RoomService` instead of creating rooms directly.
- `index.ts` is where the app is assembled:
  - create stores
  - create services
  - register routes
  - start server
- `express.json()` parses incoming JSON bodies.
- HTTP data must be validated at runtime because TypeScript only checks source code.
- `unknown` is useful for untrusted values.
- `isProgrammingLanguage()` is a type guard that checks whether a value is one of the supported languages.
- `201 Created` is returned when room creation succeeds.
- `400 Bad Request` is returned for an unsupported language.

## GET /rooms/:roomId

- `:roomId` is a dynamic route parameter.
- Express exposes route parameters through `request.params`.
- `RoomService.getRoom()` returns either a Room or undefined.
- The route converts:
  - existing Room -> 200 OK
  - missing Room -> 404 Not Found
- The service layer does not know about HTTP status codes.


## POST /rooms/:roomId/join

- app/client/src/api/rooms.ts

- This endpoint lets a participant join an existing room.
- `roomId` comes from `request.params`.
- `displayName` comes from `request.body`.
- External request data must be validated at runtime.
- `trim()` removes unnecessary whitespace from user input.
- The route calls `RoomService.joinRoom()` instead of directly modifying stores.
- Responses:
  - 201 -> participant created
  - 400 -> invalid display name
  - 404 -> room does not exist
- After joining, the Participant is stored separately and its ID is added to the Room.



## Frontend to Backend Communication

- Frontend runs on localhost:5173 and backend runs on localhost:3000.
- Because they use different ports, the browser treats them as different origins.
- CORS allows the backend to explicitly permit requests from the frontend.
- React uses the browser `fetch()` API to make HTTP requests.
- `async` functions return Promises.
- `await` waits for asynchronous operations such as network requests.
- `JSON.stringify()` converts JavaScript objects into JSON before sending them.
- Express `express.json()` parses incoming JSON back into request.body.
- `fetch()` does not automatically throw for HTTP errors like 400 or 404, so `response.ok` should be checked.


## Creating a Room from React

- Clicking Create Room runs an async React event handler.
- The handler calls `createRoom(language)` from `api/rooms.ts`.
- `createRoom()` sends `POST /rooms` to the Express backend.
- The backend generates the real room UUID and returns the Room.
- React stores the returned ID using `roomId` state.
- `string | null` represents whether a room has been created yet.
- `isCreatingRoom` disables the button while the request is running.
- `try/catch/finally` handles success, errors, and cleanup.
- This is the first complete frontend -> backend -> frontend round trip.

## Shareable Room URL

- After creating a room, the frontend receives a backend-generated room ID.
- `window.history.pushState()` changes the browser URL without refreshing the page.
- A created room now gets a URL like `/rooms/<roomId>`.
- This URL will later be shared with another user.
- We are not using React Router yet because the routing needs are still simple.


## Loading a Shared Room

- A room URL looks like `/rooms/<roomId>`.
- `window.location.pathname` lets the frontend inspect the current URL.
- `getRoomIdFromUrl()` extracts the room ID from the path.
- `useEffect(..., [])` runs once when App first loads.
- If a room ID exists in the URL, React calls `GET /rooms/:roomId`.
- The returned room updates:
  - roomId
  - editor code
  - programming language
- This allows someone to open a shared room link directly.
- Network requests are side effects, so they are performed inside `useEffect`.


## Joining a Shared Room

- A browser first loads a room using GET /rooms/:roomId.
- Joining is a separate action using POST /rooms/:roomId/join.
- The backend creates a Participant and returns its ID.
- React stores the participant ID for the current browser session.
- Room ID identifies the collaboration room.
- Participant ID identifies one person/session inside that room.
- This identity will later be used for WebSocket presence and code updates.



## WebSocket Foundation

- HTTP usually follows request -> response -> connection finishes.
- WebSockets create a persistent two-way connection between browser and server.
- `ws` provides WebSocket support for our Node backend.
- We use `createServer(app)` so Express HTTP routes and WebSockets can share port 3000.
- `WebSocketServer` listens for WebSocket connections.
- The `connection` event runs when a browser connects.
- `socket.send()` sends a message to that browser.
- The `close` event runs when the browser disconnects.
- WebSocket messages are commonly serialized using JSON.
- WebSockets begin with an HTTP upgrade handshake.


## React WebSocket Connection

- React opens the WebSocket only after the browser has joined a room.
- The WebSocket effect depends on `roomId` and `participantId`.
- `new WebSocket("ws://localhost:3000")` starts the persistent connection.
- `onopen` means the connection is ready.
- `onmessage` receives messages from the backend.
- `onclose` runs when the connection ends.
- `useEffect` cleanup closes the socket so stale connections are not left open.
- WebSocket connection state is stored in React so the UI can show connecting/connected/disconnected.
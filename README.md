# Code Together

Code Together is a browser-based collaborative code editor. A user can write code locally, create a shareable room, join that room under a display name, and collaborate with other connected participants in real time.

The current application is intentionally Python-only: Monaco always uses Python mode, rooms created by this client are marked as Python, and no language selector is shown. Joined participants can run the latest synchronized room code in a short-lived E2B cloud sandbox, and every participant in that room receives the same execution state and output.

Room persistence is complete: PostgreSQL is the source of truth for room documents. A room's URL, latest code, language, revision, and timestamps survive a complete backend restart. Live participants and WebSocket connections intentionally do not survive because they represent active network sessions rather than durable room data.

## Current capabilities

- Monaco-based Python editor with a `main.py` workspace
- Room creation with a shareable `/rooms/:roomId` URL
- One-click copying of the full room URL
- Room loading through the HTTP API
- Temporary participant identities scoped to a room session
- Real-time source-code synchronization over WebSockets
- Live participant presence and disconnect updates
- Server-authoritative editor state with monotonically increasing revisions
- PostgreSQL room persistence through Supabase, including restart recovery
- Remote Python execution in isolated E2B sandboxes
- Room-wide synchronized running, success, error, and timeout states
- One execution at a time per room with bounded source and output sizes
- Runtime validation for HTTP requests and WebSocket messages
- Configurable client API/WebSocket URLs and server origin/port

## Technology stack

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Web client | React, TypeScript, Vite | Workspace UI, local editor state, room controls, and network clients |
| Editor | Monaco Editor through `@monaco-editor/react` | Python editing experience and syntax highlighting |
| HTTP API | Express | Health checks, room creation/loading, and participant creation |
| Real-time transport | `ws` WebSocket server | Room attachment, editor updates, presence, and execution broadcasts |
| Application runtime | Node.js | Hosts Express and WebSockets on one HTTP server |
| Persistent storage | Supabase PostgreSQL through `pg` | Stores room code, language, revision, and timestamps across backend restarts |
| Ephemeral storage | In-memory `Map` instances | Stores participant presence and live WebSocket ownership for the current process |
| Remote execution | E2B Code Interpreter | Runs Python outside the Node.js process in a short-lived cloud sandbox |

## Repository layout

```text
code-together/
├── app/
│   ├── client/
│   │   ├── src/
│   │   │   ├── api/rooms.ts              # HTTP room client and shared response shapes
│   │   │   ├── components/
│   │   │   │   ├── CodeEditor.tsx        # Monaco adapter
│   │   │   │   ├── CopyRoomLinkButton.tsx # Share-link interaction and feedback
│   │   │   │   ├── OutputPanel.tsx        # Execution status and whitespace-preserving output
│   │   │   │   └── ParticipantList.tsx   # Presence UI
│   │   │   ├── config/editor.ts          # Central Python editor configuration
│   │   │   ├── services/clipboard.ts      # Browser clipboard adapter
│   │   │   ├── App.tsx                   # Client state and orchestration
│   │   │   └── App.css                   # Workspace styling
│   │   └── package.json
│   └── server/
│       ├── src/
│       │   ├── domain/                    # Room and participant types
│       │   ├── config/                     # PostgreSQL pool and E2B key validation
│       │   ├── execution/                  # Executor contract, E2B adapter, mock, and limits
│       │   ├── repositories/              # Room contract, row mapper, and PostgreSQL adapter
│       │   ├── services/roomService.ts    # Room business operations
│       │   ├── store/                     # Ephemeral presence and in-memory test adapter
│       │   └── index.ts                   # HTTP routes and WebSocket protocol
│       ├── package.json
│       └── tsconfig.json
├── supabase/migrations/                   # Version-controlled database schema
├── .gitignore
└── README.md
```

## Architecture

The platform uses one browser client and one Node.js server. The server exposes two communication paths on the same port:

1. **HTTP is the control plane.** It creates rooms, retrieves room state, and issues participant identities.
2. **WebSockets are the collaboration plane.** They attach an issued participant to a live room and carry code and presence events used by the current frontend.

```mermaid
flowchart LR
    Browser[React client]
    UI[Workspace UI]
    Monaco[Monaco editor]
    HTTP[Express HTTP API]
    WS[WebSocket server]
    Service[RoomService]
    Repository[RoomRepository]
    Rooms[(Supabase PostgreSQL)]
    Executor[CodeExecutor]
    E2B[E2B Python sandbox]
    Participants[(ParticipantStore)]
    Connections[(Room connection maps)]

    Browser --> UI
    UI <--> Monaco
    Browser -- create/load/join --> HTTP
    Browser <-- room and participant data --> HTTP
    Browser <-- live JSON messages --> WS
    Browser -- live JSON messages --> WS
    HTTP --> Service
    WS --> Service
    Service --> Repository
    Repository --> Rooms
    WS --> Executor
    Executor --> E2B
    Service --> Participants
    WS --> Connections
```

### Client architecture

`App.tsx` is currently the client-side orchestration boundary. It owns:

- the current source code;
- the loaded room ID;
- the temporary participant ID and display name;
- the participant presence list;
- the WebSocket lifecycle and connection status;
- room creation, room loading, and join actions.

The smaller UI components are intentionally presentation-focused:

- `CodeEditor` adapts Monaco's `onChange` callback and read-only setting.
- `CopyRoomLinkButton` owns clipboard interaction status and user feedback.
- `ParticipantList` renders the server-provided presence list.
- `api/rooms.ts` isolates HTTP calls from the UI.

Python editor metadata lives in `config/editor.ts`. Both Monaco configuration and room creation depend on that single immutable value, preventing scattered language literals without introducing a language-selection abstraction the UI does not need.

The client performs runtime checks on incoming WebSocket messages before applying them. These checks prevent malformed data from being treated as trusted application state, although they are not a substitute for authentication or a shared schema package.

### Server architecture

The server is divided into six responsibilities:

- **Transport:** Express routes and the WebSocket event handler parse external input and return protocol-level responses.
- **Validation:** Route and socket helpers validate UUIDs, supported languages, display names, and code sizes.
- **Business logic:** `RoomService` creates rooms and participants and updates room state.
- **Persistent storage:** `PostgresRoomRepository` owns parameterized SQL and row mapping.
- **Presence storage:** `ParticipantStore` owns temporary participant-to-room membership.
- **Remote execution:** `E2BPythonExecutor` creates, uses, normalizes, and closes E2B sandboxes behind the `CodeExecutor` interface.

Express and the WebSocket server share a single Node HTTP server. This keeps deployment simple and allows HTTP and WebSocket traffic to use the same port, while retaining distinct protocols and handlers.

### Why E2B

[E2B Code Interpreter](https://e2b.dev/docs) provides short-lived, isolated cloud sandboxes through a small TypeScript SDK. It keeps untrusted Python away from the host filesystem and the main Node.js process while returning structured stdout, stderr, and Python error information. A fresh sandbox per run is easier to reason about than persistent execution sessions and prevents one room's runtime state from leaking into another.

### Why Supabase PostgreSQL

Supabase provides a managed PostgreSQL database while allowing the backend to use the standard `pg` driver and ordinary SQL. This project does not use the Supabase browser SDK for room persistence. Keeping database access behind the Node server preserves the existing HTTP/WebSocket validation boundary and avoids sending database credentials to the frontend.

The persistence dependency path is deliberately small:

```text
HTTP routes and WebSocket handlers
                ↓
            RoomService
                ↓
          RoomRepository
                ↓
    PostgresRoomRepository
                ↓
       Supabase PostgreSQL
```

`database.ts` configures one shared `pg.Pool`. `PostgresRoomRepository` owns SQL and maps snake_case rows through `mapRoomRow`. `RoomService` contains application rules and depends only on the `RoomRepository` interface. `index.ts` is the composition root that selects the PostgreSQL implementation.

Row Level Security remains enabled and no broad anonymous policy is created. The configured direct PostgreSQL role has sufficient server-side privileges to access the table. Browser users cannot query `public.rooms` directly through this application, and `DATABASE_URL` is never sent to React.

### Persisted database schema

The version-controlled migration is [`supabase/migrations/20260818000000_create_rooms_table.sql`](supabase/migrations/20260818000000_create_rooms_table.sql). It records the same schema used by the Supabase project:

```sql
create table if not exists public.rooms (
  id uuid primary key,
  code text not null default '',
  language varchar(32) not null default 'python',
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rooms enable row level security;
```

The React application does not use the Supabase browser client to access this table. The Node.js backend connects through `DATABASE_URL`, and all SQL is isolated inside `PostgresRoomRepository`. Queries use PostgreSQL parameters such as `$1` instead of inserting user-provided code into SQL strings.

WebSocket objects cannot be stored meaningfully in PostgreSQL: they are live network handles tied to one process and one connection lifetime. Only room document state is durable. Participant records, socket ownership, and connection sets remain in memory and are rebuilt as users join after a restart.

### Server-side state

The server combines one durable collection with four process-local collections:

| Collection | Key | Value | Purpose |
| --- | --- | --- | --- |
| `public.rooms` | Room UUID | Code, language, revision, timestamps | Durable canonical editor state |
| `ParticipantStore` | Participant UUID | Participant and room ID | Temporary participant profile and membership |
| `roomConnections` | Room UUID | Set of WebSocket connections | Live sockets currently attached to each room |
| `socketParticipants` | WebSocket connection | Room and participant IDs | Ownership of each authenticated room connection |
| `runningRoomIds` | Room UUID | Set membership | Prevents simultaneous execution in one room |

Restarting the server removes participants and connections, but PostgreSQL preserves every room and its latest editor revision. A recovered room correctly begins with zero connected participants.

## Domain model

### Room

```ts
interface Room {
  id: string;
  editorState: {
    code: string;
    language: "typescript" | "javascript" | "python";
    revision: number;
  };
  participantIds: string[];
  createdAt: number;
  updatedAt: number;
}
```

`editorState` is the server's canonical representation of a room's document. `revision` starts at `0` and increments for every accepted code or language update. The backend retains its general language field for compatibility and possible future expansion, while the current frontend always presents the document as Python.

### Participant

```ts
interface Participant {
  id: string;
  displayName: string;
  joinedAt: number;
}
```

Participant IDs are temporary UUIDs. There are no user accounts, passwords, cookies, or durable sessions in the current architecture.

### Execution result

```ts
interface ExecutionResult {
  status: "success" | "error" | "timeout";
  stdout: string;
  stderr: string;
  errorName: string | null;
  traceback: string | null;
  executionTimeMs: number;
  requestedBy: string;
  startedAt: string;
  completedAt: string;
}
```

Execution results are normalized application data, not E2B SDK objects. They are broadcast through WebSockets and kept only in frontend memory; no execution-history table is created.

## End-to-end data flow

### 1. Local editing and room creation

Before a room exists, Monaco edits only local React state. Language changes are also local.

When the user selects **Create Room**:

```mermaid
sequenceDiagram
    participant U as User
    participant C as React client
    participant H as Express API
    participant S as RoomService
    participant R as PostgresRoomRepository
    participant DB as PostgreSQL

    U->>C: Click Create Room
    C->>H: POST /rooms { language: "python", code }
    H->>H: Validate language and code size
    H->>S: createRoom(language, code)
    S->>R: create(room at revision 0)
    R->>DB: INSERT parameterized room row
    DB-->>R: Stored row
    R-->>S: Mapped Room
    S-->>H: Room
    H-->>C: 201 Created + Room
    C->>C: Save room state
    C->>C: pushState('/rooms/:roomId')
```

The current editor contents are included in room creation. Creating a room does not automatically create or connect a participant; the user must still join the room.

### 2. Opening a shared room URL

When the application loads a URL matching `/rooms/:roomId`:

1. The client extracts the room ID from `window.location.pathname`.
2. It requests `GET /rooms/:roomId`.
3. The server validates the UUID and asks `PostgresRoomRepository` to query PostgreSQL.
4. The client replaces its local code with the returned canonical state.
5. The room editor remains read-only until the user joins and the WebSocket attachment succeeds.

Production hosting must route unknown client paths such as `/rooms/:roomId` back to the Vite application's `index.html`; otherwise a direct browser refresh can return a hosting-layer 404 before React loads.

### 3. Joining and attaching a WebSocket

Joining uses both transports. HTTP first creates the participant identity; WebSocket then proves that identity belongs to the requested room and attaches the live connection.

```mermaid
sequenceDiagram
    participant U as User
    participant C as React client
    participant H as Express API
    participant S as RoomService
    participant W as WebSocket server
    participant DB as PostgreSQL
    participant P as ParticipantStore

    U->>C: Enter display name
    C->>H: POST /rooms/:roomId/join
    H->>H: Validate UUID and display name
    H->>S: joinRoom(roomId, displayName)
    S->>DB: Confirm persistent room exists
    S->>P: Save temporary participant membership
    H-->>C: 201 Created + Participant
    C->>W: Open WebSocket
    W-->>C: connection:ready
    C->>W: room:join { roomId, participantId }
    W->>S: Verify room and participant relationship
    W->>W: Register socket ownership
    W-->>C: room:joined { roomId, editorState }
    W-->>C: presence:update { participants }
```

The `room:joined` message includes the current editor state. This second synchronization point prevents the joining browser from keeping stale state if another collaborator edited the room between the initial HTTP load and the WebSocket attachment.

Only one active WebSocket may use a participant ID at a time, and one WebSocket may join only one room.

### 4. Source-code synchronization

Code editing is optimistic for the sender:

1. Monaco reports a new full-document string.
2. The sender immediately updates local React state.
3. If its socket is open and attached, it queues `code:update` with the full source string and expected revision.
4. The server validates the value and its UTF-8 byte size.
5. `RoomService` asks the repository to update only if PostgreSQL still has the expected revision.
6. PostgreSQL persists code and the next revision and advances `updated_at` atomically.
7. Only after persistence succeeds does the server broadcast the accepted code and revision.
8. The sender treats its copy as an acknowledgement and sends any newer queued edit; other clients update Monaco.

```mermaid
sequenceDiagram
    participant A as Client A
    participant W as WebSocket server
    participant S as RoomService
    participant R as PostgresRoomRepository
    participant DB as PostgreSQL
    participant B as Client B

    A->>A: Apply edit locally
    A->>W: code:update { code, revision }
    W->>W: Validate membership, size, revision
    W->>S: updateCode(roomId, code, expectedRevision)
    S->>R: updateEditorState(...)
    R->>DB: UPDATE ... WHERE revision = expected
    DB-->>R: Persisted row or no row
    R-->>S: Updated Room or null
    S-->>W: Persisted Room
    W-->>A: code:update acknowledgement
    W-->>B: code:update { code, revision }
    B->>B: Replace local editor value
```

The sender receives the accepted update as an acknowledgement. The client allows only one update in flight and keeps the newest local document queued while it waits.

### 5. Python-only frontend policy

The frontend does not maintain language state, render a language selector, send `language:update`, or apply incoming language changes. `config/editor.ts` fixes Monaco to Python mode and supplies the `PY`, `main.py`, and `Python` labels. Room creation sends the same centralized `"python"` value explicitly.

The backend intentionally retains its broader `ProgrammingLanguage` type, language validation, room field, and `language:update` protocol. This keeps existing server contracts compatible and makes future language reintroduction possible without a backend rewrite. An older room with different language metadata still loads in the current client, but its code is displayed in Python mode.

### 6. Presence and disconnects

Presence is based on active WebSocket attachments rather than every participant record created over HTTP.

When a socket joins or disconnects, the server:

1. gathers participant IDs belonging to currently attached sockets;
2. resolves those IDs through `ParticipantStore`;
3. broadcasts `presence:update` to the room;
4. on disconnect, removes the socket, participant reference, and participant record;
5. removes an empty room connection set when the final socket leaves.

Rooms themselves are not deleted when empty. They remain in PostgreSQL across backend restarts; room expiration is outside the current milestone.

If the HTTP join succeeds but the WebSocket never attaches, that participant record is not displayed in presence. It currently remains in memory because disconnect cleanup only runs for an attached socket.

### 7. Remote Python execution

This feature is called Python execution rather than a compiler because Python source is run by a Python interpreter inside E2B. The Node.js backend never evaluates or starts a local Python process.

1. A joined participant clicks **Run** in `App.tsx`.
2. `handleRunCode` sends `execution:run` with room and participant IDs, but no source code.
3. The backend verifies that the socket owns those IDs and that the participant still belongs to the room.
4. `RoomService.getRoom()` loads the authoritative code from PostgreSQL.
5. `runningRoomIds` rejects a second run in the same room; no queue or second sandbox is created.
6. The backend broadcasts `execution:started`, so every Run button becomes disabled.
7. `E2BPythonExecutor` creates a fresh E2B sandbox and calls `runCode` in Python mode.
8. Stdout, stderr, Python errors, and timeouts are converted into one `ExecutionResult`.
9. The sandbox is killed and the room lock is removed in `finally` blocks.
10. The backend broadcasts `execution:result`, and every `OutputPanel` renders the same whitespace-preserving output.

```mermaid
sequenceDiagram
    participant A as Client A
    participant W as WebSocket server
    participant S as RoomService
    participant DB as PostgreSQL
    participant E as CodeExecutor
    participant B as Client B

    A->>W: execution:run { roomId, participantId }
    W->>W: Validate socket ownership and room lock
    W->>S: getRoom(roomId)
    S->>DB: SELECT authoritative room
    DB-->>S: Latest code and revision
    W-->>A: execution:started
    W-->>B: execution:started
    W->>E: execute(latestCode)
    E->>E: Create sandbox, run Python, normalize, kill
    E-->>W: ExecutionOutcome
    W-->>A: execution:result
    W-->>B: execution:result
```

The client disables Run while its latest edit awaits a PostgreSQL acknowledgement. The server also processes messages from each socket sequentially. Together these rules ensure a Run request cannot overtake that participant's preceding code update.

## HTTP API

The default API base URL is `http://localhost:3000`.

| Method | Path | Request body | Success | Common errors |
| --- | --- | --- | --- | --- |
| `GET` | `/health` | None | `200 { "status": "ok" }` | — |
| `POST` | `/rooms` | `{ "language"?: string, "code"?: string }` | `201 Room` | `400` unsupported language or invalid/oversized code |
| `GET` | `/rooms/:roomId` | None | `200 Room` | `400` invalid UUID, `404` room missing |
| `POST` | `/rooms/:roomId/join` | `{ "displayName": string }` | `201 Participant` | `400` invalid UUID/name, `404` room missing |

### Example: create a room

```bash
curl -X POST http://localhost:3000/rooms \
  -H 'Content-Type: application/json' \
  -d '{"language":"python","code":"answer = 42"}'
```

### Example: join a room

```bash
curl -X POST http://localhost:3000/rooms/ROOM_UUID/join \
  -H 'Content-Type: application/json' \
  -d '{"displayName":"Ada"}'
```

## WebSocket protocol

The default WebSocket URL is `ws://localhost:3000`. Every message is a JSON object with a string `type` field.

### Client-to-server messages

| Type | Payload | Requirement |
| --- | --- | --- |
| `room:join` | `{ roomId, participantId }` | IDs must be valid, related UUIDs issued through HTTP |
| `code:update` | `{ code, revision? }` | Socket must have joined; code must be at most 20 KiB; current clients send the expected revision |
| `execution:run` | `{ roomId, participantId }` | Socket must own both IDs; source code is deliberately omitted |
| `language:update` | `{ language, revision? }` | Backend compatibility capability; the Python-only frontend does not send it |

### Server-to-client messages

| Type | Payload | Meaning |
| --- | --- | --- |
| `connection:ready` | No additional fields | Transport connection is open; room is not joined yet |
| `room:joined` | `{ roomId, editorState }` | Room attachment succeeded and canonical state is supplied |
| `code:update` | `{ code, revision, participantId }` | Persisted editor update or sender acknowledgement |
| `execution:started` | `{ roomId, requestedBy, startedAt }` | One room execution was accepted and all Run buttons should disable |
| `execution:result` | `{ roomId, result }` | Normalized success, Python error, timeout, or safe infrastructure failure |
| `execution:rejected` | `{ roomId, error }` | This request could not start, commonly because the room is already running |
| `language:update` | `{ language, revision }` | Backend compatibility event; the Python-only frontend ignores it |
| `presence:update` | `{ participants }` | Complete list of currently connected participants |
| `room:error` | `{ error, editorState? }` | The server rejected a message; stale updates include canonical state for resynchronization |

## Consistency and conflict behavior

The current synchronization model sends the entire document and protects each write with a database revision comparison:

- PostgreSQL is authoritative; a successful broadcast always corresponds to a committed row.
- Each accepted code or language update increments one shared room revision.
- WebSockets preserve message order per connection.
- The client sends its expected revision and queues one in-flight update.
- Run remains disabled until this client's latest code revision is acknowledged.
- WebSocket messages from one connection are processed sequentially, including asynchronous database work.
- A room-level lock allows one sandbox at a time and is always released in `finally`.
- A stale revision is rejected and cannot overwrite the newer database state.
- There is no operational transformation, CRDT, text patching, cursor sharing, or selection sharing.

This model is deliberately simple and suitable for the current MVP. Concurrent edits to different parts of a document can overwrite one another because each message contains the entire document.

## Validation and operational limits

| Limit | Current value |
| --- | --- |
| Frontend editor language | Python |
| Backend language metadata | TypeScript, JavaScript, Python retained for compatibility |
| Source code | 20 KiB UTF-8 per room/update |
| Execution timeout | 10 seconds |
| Combined stdout, stderr, and traceback | 50,000 characters, followed by `[Output truncated]` when exceeded |
| Concurrent execution | One active run per room and backend process |
| Express JSON body | 32 KiB |
| WebSocket payload | 64 KiB |
| Display name | 1–40 trimmed characters |
| Room and participant IDs | UUID format |
| Allowed browser origin | One configured `CLIENT_ORIGIN` |

## Local development

### Prerequisites

- Node.js and npm
- A Supabase project with the `public.rooms` migration applied
- `DATABASE_URL` in `app/server/.env`
- An E2B API key in `app/server/.env`
- Two terminal sessions

### Configure backend services

1. Open the Supabase SQL Editor and run the contents of `supabase/migrations/20260818000000_create_rooms_table.sql`. If the table already exists, the migration is safe to keep as the source-controlled record of that schema.
2. Copy the server environment template:

   ```bash
   cd app/server
   cp .env.example .env
   ```

3. Put the Supabase PostgreSQL connection string in `app/server/.env`:

   ```dotenv
   DATABASE_URL=postgresql://YOUR_DATABASE_USER:YOUR_DATABASE_PASSWORD@YOUR_DATABASE_HOST:5432/postgres
   E2B_API_KEY=e2b_YOUR_API_KEY
   PORT=3000
   CLIENT_ORIGIN=http://localhost:5173
   ```

Do not commit `.env`, expose either secret to React, or rename either secret with a `VITE_` prefix. The backend creates one shared database pool and creates a fresh short-lived E2B sandbox only for an accepted run.

### Install dependencies

```bash
cd app/server
npm install

cd ../client
npm install
```

### Start the server

```bash
cd app/server
npm run dev
```

The server listens on `http://localhost:3000` by default.

### Start the client

```bash
cd app/client
npm run dev
```

Vite serves the client at `http://localhost:5173` by default.

### Try a collaboration session

1. Open `http://localhost:5173`.
2. Edit the starter source if desired.
3. Create a Python room.
4. Join with a display name.
5. Use **Copy Room Link** and open the copied URL in another browser window.
6. Join as a second participant and edit from either window.

## Configuration

### Client build-time variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:3000` | Base URL for Express requests |
| `VITE_WS_URL` | `ws://localhost:3000` | WebSocket endpoint |

Example:

```bash
VITE_API_URL=https://api.example.com \
VITE_WS_URL=wss://api.example.com \
npm run build
```

### Server runtime variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Required | Supabase PostgreSQL connection string used only by the backend |
| `E2B_API_KEY` | Required for Run | E2B server credential; validated when execution is requested |
| `PORT` | `3000` | Shared HTTP and WebSocket port |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Browser origin accepted by CORS |

Example:

```bash
DATABASE_URL=postgresql://... E2B_API_KEY=e2b_... PORT=8080 CLIENT_ORIGIN=https://app.example.com npm start
```

For a production HTTPS client, use `https://` for `VITE_API_URL` and `wss://` for `VITE_WS_URL` to avoid mixed-content browser failures.

`DATABASE_URL` and `E2B_API_KEY` must never use a `VITE_` prefix or be exposed to the React client. Copy `app/server/.env.example` to `.env` for local development; `.env` is ignored by Git.

### Test backend restart recovery

1. Start the backend and frontend.
2. Create and join a room.
3. Edit Python code and confirm it appears in a second joined tab.
4. Record the `/rooms/:roomId` URL.
5. Stop the backend completely and restart it.
6. Reload the recorded URL and confirm the code is restored.
7. Join again, because participant presence is intentionally ephemeral.
8. Edit again and confirm WebSocket synchronization continues.

The stored row can be inspected with:

```sql
select id, code, language, revision, created_at, updated_at
from public.rooms
order by updated_at desc;
```

### Test synchronized Python execution

1. Add `E2B_API_KEY` to `app/server/.env`, then start the backend and frontend.
2. Create a room, join it in two browser tabs, and confirm code synchronization is settled.
3. Run `print("Hello from Code Together")` followed by `print(6 * 7)` and confirm both tabs show the same two output lines.
4. Run `print("Hello"` and confirm both tabs show a readable `SyntaxError` and Run becomes enabled again.
5. Run `value = 10 / 0` and confirm both tabs show `ZeroDivisionError`.
6. Run `while True: pass` and confirm both tabs show a timeout after approximately 10 seconds, then run valid code again.
7. Print 100,000 lines and confirm output ends with `[Output truncated]` while the backend remains responsive.
8. Click Run nearly simultaneously in both tabs and confirm only one run starts while the other request is rejected.

Temporarily setting `E2B_API_KEY=` is a safe configuration test. The backend should log `Missing required environment variable: E2B_API_KEY`, clients should receive only `Unable to run the code right now.`, and a second Run should prove the room was unlocked.

## Build and verification

```bash
cd app/client
npm run lint
npm run build

cd ../server
npm run build
npm test
npm start
```

The client currently has no automated test command. The backend uses Node's built-in test runner; `npm test` builds TypeScript and runs focused room persistence, mock executor, E2B result mapping, configuration validation, output limiting, parameterization, and stale-revision tests without an additional test dependency.

The automated repository test uses a controlled pool substitute and does not require a live Supabase connection. The full restart-recovery check remains an integration test and requires the configured database plus the manual steps above.

### Expected persistence behavior

- Creating a room inserts exactly one `public.rooms` row at revision `0`.
- Loading a valid room URL reads its canonical state from PostgreSQL; an unknown room preserves the API's `404` response.
- An accepted WebSocket edit updates `code`, increments `revision`, and advances `updated_at` before it is broadcast.
- A stale revision cannot overwrite newer code because the repository update includes the expected previous revision in its `where` clause.
- A database failure is logged by the backend and produces a safe client error; the server does not broadcast an update that failed to persist.
- Quotes, apostrophes, newlines, Unicode, backslashes, and SQL-looking source text are stored as ordinary code because queries are parameterized.

## Current limitations

- Participants and live connections disappear whenever the server restarts; rooms persist.
- Room state is shared through PostgreSQL, but presence still assumes one backend process and is not horizontally coordinated.
- There is no authentication, authorization, room password, or ownership model.
- Anyone with a valid room URL can request a participant identity and join.
- There is no rate limiting or abuse protection.
- Reconnection is not automatic, and participant identity is not persisted across reloads.
- Full-document revision checks reject simultaneous stale edits rather than merging them; there is no CRDT or operational transformation.
- The UI uses browser prompts and alerts for join and error flows.
- The client and server duplicate protocol/domain types rather than importing a shared schema.
- Rooms are not expired or garbage-collected.
- Execution results are not persisted; a newly joined or reloaded client does not recover earlier output.
- Room locks are process-local, so a horizontally scaled deployment would require coordinated locking before multiple backend instances could execute the same room safely.
- There is no cancellation, interactive stdin, package installation UI, file upload, streaming output, or execution history.
- E2B startup and network latency are included in `executionTimeMs`; it is elapsed request time rather than Python CPU time.
- The frontend and executor support Python only.

## Execution security decisions

- Python never runs through Node.js `exec`, `eval`, `spawn`, or a local interpreter.
- Each accepted request creates a new E2B Code Interpreter sandbox and kills it in `finally`.
- Sandbox internet access is disabled for this feature.
- The backend loads code from PostgreSQL; the execution request cannot inject a different source string.
- Source is limited to 20 KiB and combined textual output is limited to 50,000 characters.
- Code execution is limited to 10 seconds.
- Only a socket attached to the matching room and participant may request execution.
- Provider failures are logged on the server, while clients receive a generic message without credentials or provider response objects.
- `E2B_API_KEY` exists only in the backend `.env` file and is never sent to React.

## Suggested next architecture improvements

The platform would next benefit from:

- automated unit tests for `RoomService` and validation helpers;
- HTTP and WebSocket integration tests;
- a shared package for domain types and runtime schemas;
- explicit room expiration and deletion policy;
- reconnect tokens or durable participant sessions;
- structured error payloads with stable error codes;
- patch-based or CRDT synchronization for conflict-safe editing;
- observability for connection counts, room counts, message failures, and latency;
- per-participant execution rate limiting before a public deployment;
- a deployment configuration with TLS termination and WebSocket upgrade support.

## Where SOLID principles are applied

- **Single Responsibility Principle:** `config/database.ts` configures PostgreSQL; `config/e2b.ts` validates the E2B credential; `PostgresRoomRepository` owns SQL; `RoomService` owns room rules; the WebSocket handler coordinates execution; `E2BPythonExecutor.execute` owns the sandbox lifecycle and provider mapping; `OutputPanel` only renders execution state; and `ParticipantStore` owns presence.
- **Open/Closed Principle:** `RoomService` accepts any `RoomRepository`, and the execution workflow accepts any `CodeExecutor`. Replacing E2B requires one new executor implementation and one composition-root change rather than a WebSocket rewrite.
- **Liskov Substitution Principle:** `RoomStore` and `PostgresRoomRepository` obey the same repository contract. `MockPythonExecutor` and `E2BPythonExecutor` both return the same provider-independent `ExecutionOutcome`, so callers do not branch on the implementation.
- **Interface Segregation Principle:** `RoomRepository` contains only current room operations, while `CodeExecutor` contains only `execute(code)`. It does not expose shells, files, package installation, or other unused E2B capabilities.
- **Dependency Inversion Principle:** `RoomService` depends on `RoomRepository`, and the WebSocket workflow depends on `CodeExecutor`, not `pg.Pool` or E2B response types. `src/index.ts` is the composition root that selects `PostgresRoomRepository` and `E2BPythonExecutor`.

## Design summary

Code Together treats PostgreSQL as the source of truth for room code and React as a responsive projection of synchronized server state. HTTP establishes resources and temporary identities; WebSockets attach live sessions, distribute persisted edits, and synchronize execution state. E2B runs Python outside the collaboration server behind one small executor interface. The design stays interview-friendly because each request follows one visible path without queues, factories, extra databases, or frontend state libraries.

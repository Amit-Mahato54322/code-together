# Code Together

Code Together is a browser-based collaborative code editor. A user can write code locally, create a shareable room, join that room under a display name, and collaborate with other connected participants in real time.

The current frontend is intentionally Python-only: Monaco always uses Python mode, rooms created by this client are marked as Python, and no language selector is shown. The platform synchronizes source code and participant presence, but it does **not** compile or execute code yet.

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
- Runtime validation for HTTP requests and WebSocket messages
- Configurable client API/WebSocket URLs and server origin/port

## Technology stack

| Layer | Technology | Responsibility |
| --- | --- | --- |
| Web client | React, TypeScript, Vite | Workspace UI, local editor state, room controls, and network clients |
| Editor | Monaco Editor through `@monaco-editor/react` | Python editing experience and syntax highlighting |
| HTTP API | Express | Health checks, room creation/loading, and participant creation |
| Real-time transport | `ws` WebSocket server | Room attachment, editor updates, and presence |
| Application runtime | Node.js | Hosts Express and WebSockets on one HTTP server |
| Persistent storage | Supabase PostgreSQL through `pg` | Stores room code, language, revision, and timestamps across backend restarts |
| Ephemeral storage | In-memory `Map` instances | Stores participant presence and live WebSocket ownership for the current process |

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
│   │   │   │   └── ParticipantList.tsx   # Presence UI
│   │   │   ├── config/editor.ts          # Central Python editor configuration
│   │   │   ├── services/clipboard.ts      # Browser clipboard adapter
│   │   │   ├── App.tsx                   # Client state and orchestration
│   │   │   └── App.css                   # Workspace styling
│   │   └── package.json
│   └── server/
│       ├── src/
│       │   ├── domain/                    # Room and participant types
│       │   ├── config/database.ts         # Shared PostgreSQL connection pool
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

The server is divided into five responsibilities:

- **Transport:** Express routes and the WebSocket event handler parse external input and return protocol-level responses.
- **Validation:** Route and socket helpers validate UUIDs, supported languages, display names, and code sizes.
- **Business logic:** `RoomService` creates rooms and participants and updates room state.
- **Persistent storage:** `PostgresRoomRepository` owns parameterized SQL and row mapping.
- **Presence storage:** `ParticipantStore` owns temporary participant-to-room membership.

Express and the WebSocket server share a single Node HTTP server. This keeps deployment simple and allows HTTP and WebSocket traffic to use the same port, while retaining distinct protocols and handlers.

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

The server combines one durable collection with three process-local collections:

| Collection | Key | Value | Purpose |
| --- | --- | --- | --- |
| `public.rooms` | Room UUID | Code, language, revision, timestamps | Durable canonical editor state |
| `ParticipantStore` | Participant UUID | Participant and room ID | Temporary participant profile and membership |
| `roomConnections` | Room UUID | Set of WebSocket connections | Live sockets currently attached to each room |
| `socketParticipants` | WebSocket connection | Room and participant IDs | Ownership of each authenticated room connection |

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
| `language:update` | `{ language, revision? }` | Backend compatibility capability; the Python-only frontend does not send it |

### Server-to-client messages

| Type | Payload | Meaning |
| --- | --- | --- |
| `connection:ready` | No additional fields | Transport connection is open; room is not joined yet |
| `room:joined` | `{ roomId, editorState }` | Room attachment succeeded and canonical state is supplied |
| `code:update` | `{ code, revision, participantId }` | Persisted editor update or sender acknowledgement |
| `language:update` | `{ language, revision }` | Backend compatibility event; the Python-only frontend ignores it |
| `presence:update` | `{ participants }` | Complete list of currently connected participants |
| `room:error` | `{ error, editorState? }` | The server rejected a message; stale updates include canonical state for resynchronization |

## Consistency and conflict behavior

The current synchronization model sends the entire document and protects each write with a database revision comparison:

- PostgreSQL is authoritative; a successful broadcast always corresponds to a committed row.
- Each accepted code or language update increments one shared room revision.
- WebSockets preserve message order per connection.
- The client sends its expected revision and queues one in-flight update.
- A stale revision is rejected and cannot overwrite the newer database state.
- There is no operational transformation, CRDT, text patching, cursor sharing, or selection sharing.

This model is deliberately simple and suitable for the current MVP. Concurrent edits to different parts of a document can overwrite one another because each message contains the entire document.

## Validation and operational limits

| Limit | Current value |
| --- | --- |
| Frontend editor language | Python |
| Backend language metadata | TypeScript, JavaScript, Python retained for compatibility |
| Source code | 20 KiB UTF-8 per room/update |
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
- Two terminal sessions

### Configure PostgreSQL

1. Open the Supabase SQL Editor and run the contents of `supabase/migrations/20260818000000_create_rooms_table.sql`. If the table already exists, the migration is safe to keep as the source-controlled record of that schema.
2. Copy the server environment template:

   ```bash
   cd app/server
   cp .env.example .env
   ```

3. Put the Supabase PostgreSQL connection string in `app/server/.env`:

   ```dotenv
   DATABASE_URL=postgresql://YOUR_DATABASE_USER:YOUR_DATABASE_PASSWORD@YOUR_DATABASE_HOST:5432/postgres
   PORT=3000
   CLIENT_ORIGIN=http://localhost:5173
   ```

Do not commit `.env`, expose `DATABASE_URL` to React, or rename it with a `VITE_` prefix. The backend creates one shared connection pool and keeps it open for the server lifetime.

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
| `PORT` | `3000` | Shared HTTP and WebSocket port |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Browser origin accepted by CORS |

Example:

```bash
DATABASE_URL=postgresql://... PORT=8080 CLIENT_ORIGIN=https://app.example.com npm start
```

For a production HTTPS client, use `https://` for `VITE_API_URL` and `wss://` for `VITE_WS_URL` to avoid mixed-content browser failures.

`DATABASE_URL` must never use a `VITE_` prefix or be exposed to the React client. Copy `app/server/.env.example` to `.env` for local development; `.env` is ignored by Git.

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

The client currently has no automated test command. The backend uses Node's built-in test runner; `npm test` builds TypeScript and runs focused mapper, repository, service, presence, parameterization, and stale-revision tests without an additional test dependency.

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
- The frontend supports Python editing only; code is synchronized but not compiled or executed.

## Future compiler and execution architecture

Compilation and code execution should be added as a separate subsystem rather than running untrusted user programs inside the collaboration API process.

A safe high-level design is:

```mermaid
flowchart LR
    Client[React client]
    API[Collaboration API]
    Queue[(Execution queue)]
    Worker[Isolated execution worker]
    Sandbox[Ephemeral sandbox]
    Results[(Short-lived result store)]

    Client -- run request --> API
    API -- validated job --> Queue
    Queue --> Worker
    Worker --> Sandbox
    Sandbox -- stdout/stderr/status --> Worker
    Worker --> Results
    API -- result or status stream --> Client
```

Recommended compiler milestones:

1. Define an execution request/response contract with language, source, stdin, status, stdout, stderr, exit code, and timing.
2. Start with one language and a local development-only execution adapter.
3. Move execution into an isolated worker with strict CPU, memory, process, filesystem, output, and wall-clock limits.
4. Add a queue so execution cannot block HTTP or WebSocket collaboration traffic.
5. Stream status and output back through a dedicated protocol rather than mixing execution state into editor revisions.
6. Add cancellation, per-user/per-room rate limits, audit logs, and retention limits.
7. Add compiler/runtime image versioning so results remain reproducible.
8. Expand the language registry so editor metadata and execution capability are related but remain distinct.

Before accepting public execution traffic, the platform will need sandboxing that prevents network access, host filesystem access, process escape, fork bombs, excessive output, and resource exhaustion. A timeout alone is not a sufficient security boundary.

## Suggested next architecture improvements

Before or alongside compiler work, the platform would benefit from:

- automated unit tests for `RoomService` and validation helpers;
- HTTP and WebSocket integration tests;
- a shared package for domain types and runtime schemas;
- explicit room expiration and deletion policy;
- reconnect tokens or durable participant sessions;
- structured error payloads with stable error codes;
- patch-based or CRDT synchronization for conflict-safe editing;
- observability for connection counts, room counts, message failures, and latency;
- a deployment configuration with TLS termination and WebSocket upgrade support.

## Where SOLID principles are applied

- **Single Responsibility Principle:** `config/database.ts` configures the shared PostgreSQL pool; `PostgresRoomRepository` owns SQL and row mapping; `RoomService` owns room rules; the Express and WebSocket handlers translate transport messages; and `ParticipantStore` owns process-local presence.
- **Open/Closed Principle:** `RoomService` accepts any implementation of `RoomRepository`. Adding another storage adapter does not require rewriting room business logic.
- **Liskov Substitution Principle:** `RoomStore` and `PostgresRoomRepository` implement the same asynchronous repository behavior, so service callers do not branch on the storage technology.
- **Interface Segregation Principle:** `RoomRepository` includes only the operations the application uses: create a room, find one room, and update its editor state.
- **Dependency Inversion Principle:** `RoomService` imports the `RoomRepository` contract rather than `pg`, `Pool`, or Supabase-specific code. The concrete PostgreSQL adapter is selected in `src/index.ts`, the server composition root.

## Design summary

Code Together treats PostgreSQL as the source of truth for room state and React as a responsive projection of that state. HTTP establishes resources and temporary identities; WebSockets attach live sessions and distribute only successfully persisted changes. This separation keeps the MVP understandable while leaving clear boundaries for stronger collaboration algorithms, authentication, expiration, and a future isolated compiler service.

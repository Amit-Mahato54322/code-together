# Backend Learning Notes

## Why Room Persistence Was Added

The first Code Together backend stored rooms in a JavaScript `Map`. That made the real-time behavior easy to learn, but every room, document, and revision disappeared when the Node process restarted. PostgreSQL is now the authoritative source of truth, so a shared room URL restores the latest accepted document after a complete backend restart.

Supabase was selected because it provides managed PostgreSQL while still supporting the standard `pg` driver and normal parameterized SQL. The React client does not use Supabase credentials or query the rooms table directly.

## Persistent and Ephemeral State

PostgreSQL persists:

- room UUID;
- source code;
- language metadata;
- editor revision;
- creation timestamp; and
- last-update timestamp.

Backend memory retains:

- temporary participants and their room membership;
- live WebSocket objects;
- room-to-socket sets;
- socket-to-participant mappings; and
- connection lifecycle state.

A WebSocket is a live operating-system/network resource, not application data that can be reconstructed from a database row. After restart, a room has its document but correctly has zero connected participants.

## Repository Architecture

```text
Express and WebSocket handlers
              ↓
          RoomService
              ↓
        RoomRepository
              ↓
  PostgresRoomRepository
              ↓
    Supabase PostgreSQL
```

Relevant files:

- `src/config/database.ts` creates the shared `pg.Pool` and validates `DATABASE_URL`.
- `src/repositories/roomRepository.ts` defines the application-facing persistence contract.
- `src/repositories/postgresRoomMapper.ts` converts database rows to domain rooms.
- `src/repositories/postgresRoomRepository.ts` contains parameterized SQL.
- `src/store/roomStore.ts` is an in-memory implementation useful for focused service tests.
- `src/services/roomService.ts` contains room and revision rules.
- `src/store/participantStore.ts` owns ephemeral participant membership.
- `src/index.ts` handles transport and constructs the concrete dependencies.

`RoomService` never imports `pg`, a PostgreSQL pool, or the concrete PostgreSQL repository.

## Room Row Mapping

PostgreSQL uses flat snake_case columns:

```text
id, code, language, revision, created_at, updated_at
```

The domain uses a nested camelCase shape:

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

`mapRoomRow` performs this conversion in one place. PostgreSQL `timestamptz` values arrive from `pg` as `Date` objects and are converted to epoch milliseconds to preserve the existing HTTP contract. Database language strings are narrowed before becoming domain values. Participant IDs are reconstructed from live `ParticipantStore` state rather than database rows.

## Room Creation Flow

1. `POST /rooms` validates language and code size.
2. `RoomService.createRoom` generates the UUID, revision `0`, and timestamps.
3. `RoomRepository.create` receives the domain room.
4. `PostgresRoomRepository` inserts parameter values into `public.rooms`.
5. PostgreSQL returns the stored row.
6. The mapper returns a domain `Room`.
7. Express returns the existing `201` response.

If insertion fails, Express logs the internal error and returns `{ "error": "Could not create room" }` with status `500`. It does not claim success.

## Room Loading and Restart Recovery

1. React extracts the UUID from `/rooms/:roomId`.
2. It requests `GET /rooms/:roomId`.
3. `RoomService.getRoom` calls `RoomRepository.findById`.
4. PostgreSQL returns the durable row or no row.
5. The mapper restores code, language, revision, and timestamps.
6. React restores Monaco from the returned editor state.

The HTTP `404` behavior remains unchanged for a valid UUID that has no row. A restart destroys sockets and participants but cannot destroy the PostgreSQL row, which is why the URL continues to work.

## Joining and Presence

`RoomService.joinRoom` first confirms through `RoomRepository` that the durable room exists. It then creates a temporary participant in `ParticipantStore`. The participant-to-room relationship is not written to the room row.

The WebSocket `room:join` handler validates that both the persistent room and temporary participant relationship exist before registering the live socket. Disconnect cleanup removes the participant and socket mappings but does not alter the PostgreSQL room.

## Code Update and Revision Consistency

The current client sends the complete document and its expected revision. It keeps at most one update in flight and queues the newest local document while waiting for acknowledgement.

For an accepted update:

1. The WebSocket handler validates membership, code size, and revision syntax.
2. `RoomService` loads the authoritative room.
3. It constructs exactly `expectedRevision + 1`.
4. `PostgresRoomRepository` executes a parameterized update containing:

```sql
where id = $4
  and revision = $5
```

5. PostgreSQL changes code, language, revision, and `updated_at` only if the stored revision still matches.
6. The server broadcasts only the row returned by that successful update.

If the revision is stale, the update returns no row. Nothing is broadcast as a success, and the sender receives `room:error` with the latest canonical `editorState`. This prevents two stale updates from both overwriting the same revision.

## Parameterized SQL and Special Source Code

Source code is always passed in the query parameter array, never concatenated into SQL. Quotes, apostrophes, Unicode, newlines, backslashes, and SQL-looking strings remain document content rather than executable SQL.

## Error Boundaries

- Repository methods throw infrastructure errors.
- `RoomService` preserves not-found and stale-update results without exposing database types.
- Express handlers log internal errors and return safe `500` JSON.
- The WebSocket listener attaches `.catch()` to its asynchronous message function, preventing unhandled promise rejections.
- Database failures never produce a successful broadcast.
- The shared pool logs unexpected idle-client errors and closes on `SIGINT` or `SIGTERM`.

## Environment and RLS

Required backend environment variable:

```text
DATABASE_URL=postgresql://...
```

Optional variables are `PORT` and `CLIENT_ORIGIN`. `DATABASE_URL` belongs only in `app/server/.env`, which is ignored by Git. It must never use a `VITE_` prefix.

RLS remains enabled on `public.rooms`, and no anonymous `using (true)` policy is added. The backend connects directly with the PostgreSQL role encoded in `DATABASE_URL`; the configured role has sufficient server-side table access. The browser has no direct database route or credential.

## Testing Restart Recovery

1. Start backend and frontend.
2. Create and join a room.
3. Enter Python code.
4. Open and join the same URL in another tab.
5. Confirm edits synchronize.
6. Record the URL and stop the backend completely.
7. Restart the backend and reload the URL.
8. Confirm code and revision were restored.
9. Join again and confirm new edits synchronize.

Inspect the database with:

```sql
select id, code, language, revision, created_at, updated_at
from public.rooms
order by updated_at desc;
```

## Where SOLID Principles Were Applied

### Single Responsibility Principle

- `src/config/database.ts` configures and observes one connection pool.
- `PostgresRoomRepository` contains room SQL and delegates row conversion.
- `mapRoomRow` performs database-to-domain mapping.
- `RoomService` coordinates room rules and revision transitions.
- Express handlers translate HTTP requests and responses.
- `handleSocketMessage` translates WebSocket messages.
- `ParticipantStore`, `roomConnections`, and `socketParticipants` own live presence state.

### Open/Closed Principle

`RoomService` accepts `RoomRepository`. Another implementation can be added without rewriting service rules. The production composition uses `PostgresRoomRepository`; focused tests can use `RoomStore`.

### Liskov Substitution Principle

Both repository implementations return promises, return `null` for missing or stale rows, require the next revision to equal the expected revision plus one, and return domain `Room` values. Callers do not check which implementation they received.

### Interface Segregation Principle

`RoomRepository` includes only `create`, `findById`, and `updateEditorState`. Participant, socket, execution, analytics, search, and pagination operations are intentionally excluded.

### Dependency Inversion Principle

`RoomService` imports the `RoomRepository` interface rather than `pg`, `Pool`, Supabase, or `PostgresRoomRepository`. `src/index.ts` selects the concrete repository at the composition root.

## Current Limitations

- Presence is process-local and not coordinated across multiple backend instances.
- Participants must join again after reload or restart.
- Whole-document synchronization is simpler than operational transformation or CRDT collaboration and can reject simultaneous edits.
- There is no authentication, authorization, ownership, expiration, or rate limiting.
- The frontend is Python-only.
- Automated backend test infrastructure has not yet been added; current verification uses build checks and focused integration smoke tests.

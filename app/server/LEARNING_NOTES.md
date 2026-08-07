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
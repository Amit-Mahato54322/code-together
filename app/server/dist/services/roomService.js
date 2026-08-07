import { randomUUID } from "node:crypto";
export class RoomService {
    roomStore;
    participantStore;
    constructor(roomStore, participantStore) {
        this.roomStore = roomStore;
        this.participantStore = participantStore;
    }
    createRoom(language = "typescript") {
        const room = {
            id: randomUUID(),
            editorState: {
                code: "",
                language,
                revision: 0,
            },
            participantIds: [],
            createdAt: Date.now(),
        };
        // Save the new room in memory before returning it.
        this.roomStore.save(room);
        return room;
    }
    getRoom(roomId) {
        return this.roomStore.get(roomId);
    }
    joinRoom(roomId, displayName) {
        // First, check whether the room actually exists.
        const room = this.roomStore.get(roomId);
        if (!room) {
            return undefined;
        }
        // Create a new participant for this room session.
        const participant = {
            id: randomUUID(),
            displayName,
            joinedAt: Date.now(),
        };
        // Store the participant separately.
        this.participantStore.save(participant);
        // Add the participant's ID to the room.
        room.participantIds.push(participant.id);
        // Save the updated room back into the RoomStore.
        this.roomStore.save(room);
        return participant;
    }
}

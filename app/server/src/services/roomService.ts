import { randomUUID } from "node:crypto";

import type{
    ProgrammingLanguage,
    Room,
} from "../domain/room.js"

import type { Participant } from "../domain/participant.js";

import { RoomStore } from "../store/roomStore.js";
import { ParticipantStore } from "../store/participantStore.js";

export class RoomService {
  constructor(
    private readonly roomStore: RoomStore,
    private readonly participantStore: ParticipantStore
  ) {}

  createRoom(
    language: ProgrammingLanguage = "typescript",
    code = ""
  ): Room {
    const room: Room = {
      id: randomUUID(),

      editorState: {
        code,
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

  getRoom(roomId: string): Room | undefined {
    return this.roomStore.get(roomId);
  }

  getParticipants(roomId: string): Participant[] {
    const room = this.roomStore.get(roomId);

    if (!room) {
      return [];
    }

    return room.participantIds
      .map((participantId) => this.participantStore.get(participantId))
      .filter((participant): participant is Participant => participant !== undefined);
  }

  joinRoom(
    roomId: string,
    displayName: string
  ): Participant | undefined {
    // First, check whether the room actually exists.
    const room = this.roomStore.get(roomId);

    if (!room) {
      return undefined;
    }

    // Create a new participant for this room session.
    const participant: Participant = {
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

  leaveRoom(roomId: string, participantId: string): boolean {
    const room = this.roomStore.get(roomId);

    if (!room || !room.participantIds.includes(participantId)) {
      return false;
    }

    room.participantIds = room.participantIds.filter(
      (currentParticipantId) => currentParticipantId !== participantId
    );
    this.roomStore.save(room);
    this.participantStore.delete(participantId);

    return true;
  }

  updateCode(roomId: string, code: string): Room | undefined {
    const room = this.roomStore.get(roomId);

    if (!room) {
      return undefined;
    }

    room.editorState.code = code;
    room.editorState.revision += 1;
    this.roomStore.save(room);

    return room;
  }

  updateLanguage(
    roomId: string,
    language: ProgrammingLanguage
  ): Room | undefined {
    const room = this.roomStore.get(roomId);

    if (!room) {
      return undefined;
    }

    room.editorState.language = language;
    room.editorState.revision += 1;
    this.roomStore.save(room);

    return room;
  }
}

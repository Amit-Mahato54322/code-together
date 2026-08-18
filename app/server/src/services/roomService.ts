import { randomUUID } from "node:crypto";

import type { Participant } from "../domain/participant.js";
import type {
  ProgrammingLanguage,
  Room,
} from "../domain/room.js";
import type { RoomRepository } from "../repositories/roomRepository.js";
import { ParticipantStore } from "../store/participantStore.js";

export class RoomService {
  constructor(
    private readonly roomRepository: RoomRepository,
    private readonly participantStore: ParticipantStore,
  ) {}

  async createRoom(
    language: ProgrammingLanguage = "typescript",
    code = "",
  ): Promise<Room> {
    const now = Date.now();
    const room: Room = {
      id: randomUUID(),
      editorState: {
        code,
        language,
        revision: 0,
      },
      participantIds: [],
      createdAt: now,
      updatedAt: now,
    };

    const createdRoom = await this.roomRepository.create(room);

    return this.withActiveParticipants(createdRoom);
  }

  async getRoom(roomId: string): Promise<Room | null> {
    const room = await this.roomRepository.findById(roomId);

    return room ? this.withActiveParticipants(room) : null;
  }

  getParticipants(roomId: string): Participant[] {
    return this.participantStore.getByRoomId(roomId);
  }

  getParticipantForRoom(
    roomId: string,
    participantId: string,
  ): Participant | null {
    if (!this.participantStore.belongsToRoom(participantId, roomId)) {
      return null;
    }

    return this.participantStore.get(participantId) ?? null;
  }

  async joinRoom(
    roomId: string,
    displayName: string,
  ): Promise<Participant | null> {
    const room = await this.roomRepository.findById(roomId);

    if (!room) {
      return null;
    }

    const participant: Participant = {
      id: randomUUID(),
      displayName,
      joinedAt: Date.now(),
    };

    this.participantStore.save(roomId, participant);

    return participant;
  }

  leaveRoom(roomId: string, participantId: string): boolean {
    if (!this.participantStore.belongsToRoom(participantId, roomId)) {
      return false;
    }

    return this.participantStore.delete(participantId);
  }

  async updateCode(
    roomId: string,
    code: string,
    expectedRevision?: number,
  ): Promise<Room | null> {
    const room = await this.roomRepository.findById(roomId);

    if (!room) {
      return null;
    }

    const revisionToReplace = expectedRevision ?? room.editorState.revision;

    if (room.editorState.revision !== revisionToReplace) {
      return null;
    }

    const updatedRoom = await this.roomRepository.updateEditorState(
      roomId,
      {
        ...room.editorState,
        code,
        revision: revisionToReplace + 1,
      },
      revisionToReplace,
    );

    return updatedRoom ? this.withActiveParticipants(updatedRoom) : null;
  }

  async updateLanguage(
    roomId: string,
    language: ProgrammingLanguage,
    expectedRevision?: number,
  ): Promise<Room | null> {
    const room = await this.roomRepository.findById(roomId);

    if (!room) {
      return null;
    }

    const revisionToReplace = expectedRevision ?? room.editorState.revision;

    if (room.editorState.revision !== revisionToReplace) {
      return null;
    }

    const updatedRoom = await this.roomRepository.updateEditorState(
      roomId,
      {
        ...room.editorState,
        language,
        revision: revisionToReplace + 1,
      },
      revisionToReplace,
    );

    return updatedRoom ? this.withActiveParticipants(updatedRoom) : null;
  }

  private withActiveParticipants(room: Room): Room {
    return {
      ...room,
      participantIds: this.participantStore
        .getByRoomId(room.id)
        .map((participant) => participant.id),
    };
  }
}

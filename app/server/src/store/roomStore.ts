import type { EditorState, Room } from "../domain/room.js";
import type { RoomRepository } from "../repositories/roomRepository.js";

/**
 * In-memory RoomRepository implementation for focused service tests.
 * The production server uses PostgresRoomRepository.
 */
export class RoomStore implements RoomRepository {
  private readonly rooms = new Map<string, Room>();

  async create(room: Room): Promise<Room> {
    this.rooms.set(room.id, room);

    return room;
  }

  async findById(roomId: string): Promise<Room | null> {
    return this.rooms.get(roomId) ?? null;
  }

  async updateEditorState(
    roomId: string,
    editorState: EditorState,
    expectedRevision: number,
  ): Promise<Room | null> {
    if (editorState.revision !== expectedRevision + 1) {
      throw new Error(
        "The new editor revision must immediately follow the expected revision",
      );
    }

    const room = this.rooms.get(roomId);

    if (!room || room.editorState.revision !== expectedRevision) {
      return null;
    }

    const updatedRoom: Room = {
      ...room,
      editorState: {
        ...editorState,
      },
      updatedAt: Date.now(),
    };

    this.rooms.set(roomId, updatedRoom);

    return updatedRoom;
  }
}

import type { Pool } from "pg";

import type { EditorState, Room } from "../domain/room.js";
import type { RoomRepository } from "./roomRepository.js";
import { mapRoomRow, type RoomRow } from "./postgresRoomMapper.js";

export class PostgresRoomRepository implements RoomRepository {
  constructor(private readonly databasePool: Pool) {}

  async create(room: Room): Promise<Room> {
    const result = await this.databasePool.query<RoomRow>(
      `
        insert into public.rooms (
          id,
          code,
          language,
          revision,
          created_at,
          updated_at
        )
        values ($1, $2, $3, $4, $5, $6)
        returning
          id,
          code,
          language,
          revision,
          created_at,
          updated_at
      `,
      [
        room.id,
        room.editorState.code,
        room.editorState.language,
        room.editorState.revision,
        new Date(room.createdAt),
        new Date(room.updatedAt),
      ],
    );

    const createdRow = result.rows[0];

    if (!createdRow) {
      throw new Error("PostgreSQL did not return the created room");
    }

    return mapRoomRow(createdRow);
  }

  async findById(roomId: string): Promise<Room | null> {
    const result = await this.databasePool.query<RoomRow>(
      `
        select
          id,
          code,
          language,
          revision,
          created_at,
          updated_at
        from public.rooms
        where id = $1
      `,
      [roomId],
    );

    const roomRow = result.rows[0];

    return roomRow ? mapRoomRow(roomRow) : null;
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

    const result = await this.databasePool.query<RoomRow>(
      `
        update public.rooms
        set
          code = $1,
          language = $2,
          revision = $3,
          updated_at = now()
        where id = $4
          and revision = $5
        returning
          id,
          code,
          language,
          revision,
          created_at,
          updated_at
      `,
      [
        editorState.code,
        editorState.language,
        editorState.revision,
        roomId,
        expectedRevision,
      ],
    );

    const updatedRow = result.rows[0];

    return updatedRow ? mapRoomRow(updatedRow) : null;
  }
}

import type { EditorState, Room } from "../domain/room.js";

/**
 * Defines the persistent room operations required by the application.
 *
 * RoomService depends on this contract instead of depending on a particular
 * database. Implementations may store rooms in memory or in PostgreSQL, but
 * they must expose the same asynchronous behavior to their callers.
 */
export interface RoomRepository {
  create(room: Room): Promise<Room>;

  findById(roomId: string): Promise<Room | null>;

  /**
   * Replaces the editor state only when the stored revision matches
   * expectedRevision. The new editor state must use expectedRevision + 1.
   * Returns null when the room is missing or the stored revision is stale.
   */
  updateEditorState(
    roomId: string,
    editorState: EditorState,
    expectedRevision: number,
  ): Promise<Room | null>;
}

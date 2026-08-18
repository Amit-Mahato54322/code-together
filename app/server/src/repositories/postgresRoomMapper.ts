import type {
  ProgrammingLanguage,
  Room,
} from "../domain/room.js";

export interface RoomRow {
  id: string;
  code: string;
  language: string;
  revision: number;
  created_at: Date;
  updated_at: Date;
}

function isProgrammingLanguage(
  language: string,
): language is ProgrammingLanguage {
  return (
    language === "typescript" ||
    language === "javascript" ||
    language === "python"
  );
}

function timestampToMilliseconds(
  timestamp: Date,
  columnName: "created_at" | "updated_at",
): number {
  const milliseconds = timestamp.getTime();

  if (!Number.isFinite(milliseconds)) {
    throw new Error(`Invalid ${columnName} value returned for room`);
  }

  return milliseconds;
}

export function mapRoomRow(row: RoomRow): Room {
  if (!isProgrammingLanguage(row.language)) {
    throw new Error(
      `Unsupported room language returned from database: ${row.language}`,
    );
  }

  return {
    id: row.id,
    editorState: {
      code: row.code,
      language: row.language,
      revision: row.revision,
    },
    participantIds: [],
    createdAt: timestampToMilliseconds(row.created_at, "created_at"),
    updatedAt: timestampToMilliseconds(row.updated_at, "updated_at"),
  };
}

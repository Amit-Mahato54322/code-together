import type { ProgrammingLanguage } from "../config/languages";

// This is the shape of a Room returned by our backend.
// Later we may move shared client/server types into one shared package,
// but keeping this local is simpler for now.
export interface Room {
  id: string;

  editorState: {
    code: string;
    language: ProgrammingLanguage;
    revision: number;
  };

  participantIds: string[];
  createdAt: number;
}

const API_URL = "http://localhost:3000";

// Ask the backend to create a new collaborative room.
export async function createRoom(
  language: ProgrammingLanguage
): Promise<Room> {
  const response = await fetch(`${API_URL}/rooms`, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      language,
    }),
  });

  // A non-2xx HTTP response is still considered a successful
  // fetch() at the network level, so we check response.ok ourselves.
  if (!response.ok) {
    throw new Error("Failed to create room");
  }

  const room: Room = await response.json();

  return room;
}


// Ask the backend for an existing room by ID.
export async function getRoom(roomId: string): Promise<Room> {
  const response = await fetch(`${API_URL}/rooms/${roomId}`);

  if (!response.ok) {
    throw new Error("Failed to load room");
  }

  const room: Room = await response.json();

  return room;
}
import type { Room } from "../domain/room";

// ## store ##:
// separate store to store the rooms using a hashmap

//-> this file is responsible for keeping and retrieving application data. The goal is to avoid sprinkling storage logic everywhere. 

// encapsulation: I don't want the rooms to be modified by any external functions, we want it to be specifically done through:
// save, get, has, delete, get
export class RoomStore {
  private readonly rooms = new Map<string, Room>(); // cannot later assign this.rooms = new Map(); but can still modify map itself. 

  save(room: Room): void {
    this.rooms.set(room.id, room);
  }

  get(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  has(roomId: string): boolean {
    return this.rooms.has(roomId);
  }

  delete(roomId: string): boolean {
    return this.rooms.delete(roomId);
  }

  get size(): number {
    return this.rooms.size;
  }
}
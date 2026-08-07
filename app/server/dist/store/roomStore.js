// ## store ##:
// separate store to store the rooms using a hashmap
//-> this file is responsible for keeping and retrieving application data. The goal is to avoid sprinkling storage logic everywhere. 
// encapsulation: I don't want the rooms to be modified by any external functions, we want it to be specifically done through:
// save, get, has, delete, get
export class RoomStore {
    rooms = new Map(); // cannot later assign this.rooms = new Map(); but can still modify map itself. 
    save(room) {
        this.rooms.set(room.id, room);
    }
    get(roomId) {
        return this.rooms.get(roomId);
    }
    has(roomId) {
        return this.rooms.has(roomId);
    }
    delete(roomId) {
        return this.rooms.delete(roomId);
    }
    get size() {
        return this.rooms.size;
    }
}

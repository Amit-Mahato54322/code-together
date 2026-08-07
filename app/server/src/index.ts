import express from "express"

import type { ProgrammingLanguage } from "./domain/room.js";
import { ParticipantStore } from "./store/participantStore.js";
import { RoomStore } from "./store/roomStore.js";
import { RoomService } from "./services/roomService.js";
import { PassThrough } from "node:stream";

//create express application
const app = express();

// define a port where backend listens for HTTP requests. 

const PORT = 3000;

// create our in-memory stores.
const roomStore = new RoomStore();
const participantStore = new ParticipantStore();

// give the store to roomservice
// RoomService contains the actual room business logic.
const roomService = new RoomService(
    roomStore,
    participantStore
);



// Middleware that allows Express to understand JSON request bodies. 
// we will need need it when clients send data to the server.

app.use(express.json());


const SUPPORTED_LANGUAGES: ProgrammingLanguage[] = [
    "typescript",
    "javascript",
    "python",
];

//helper function to check data at runtime.
// data coming from HTTP request exists at runtime,
// so must be validated manually.
function isProgrammingLanguage(value: unknown): value is ProgrammingLanguage {
    return (
        typeof value === "string" && SUPPORTED_LANGUAGES.includes(value as ProgrammingLanguage)
    )

}

// health-check endpoint. 
// GET/health lets us verify that the server is running.

app.get("/health", (_request, response) => (  //_ means it's not being used, intentionally 
    response.json({
        status: "ok",
    })
));


// create a new collaborative room.
app.post("/room",(request, response)=>{
    const language = request.body.language;

    //if client sent a language, make sure it is supported. 
    if(
        language !== undefined && !isProgrammingLanguage(language)
    ){
        response.status(400).json({
            error: "Unsupported programming language",
        })
        return
    }

    // if no language was provided, RoomService defaults
    // the new too to Typescript.
    const room = roomService.createRoom(language);

    //201 means a new resource was successfully created. 
    response.status(201).json(room);
})

// Get an existing room by its unique room ID.
app.get("/room/:roomId", (request, response)=>{
    //Route parameters come from the URL
    //e.g., GET/rooms/abc123
    // request.params.roomID === "abc123"

    const roomId = request.params.roomId;
    const room = roomService.getRoom(roomId)

    // if RoomService cannot find the room, 
    // return HTTP 404 Not Found.
    if(!room){
        response.status(404).json({
            error: "Room not found"
        })
        return;
    }

    response.status(200).json(room);

})

//Join an existing room as a participant.
app.post("/room/:roomId/join", (request, response)=>{
    const roomId = request.params.roomId;
    const displayName = request.body.displayName;

    //Basic runtime validation:
    //the client must send a non-empty display name. 
    if(
        typeof displayName!== "string" || displayName.trim().length === 0
    ){
        response.status(400).json({
            error: "Display name is required"
        });

        return;
    }
    const participant = roomService.joinRoom(
        roomId,
        displayName.trim()
    );

    // joinRoom() returns undefined when the room does not exist. 
    if (!participant){
        response.status(404).json({
            error: "Room not found",
        });
        return;
    }
    response.status(201).json(participant)
})

//start listening for HTTP requests. 
app.listen(PORT, ()=>{
    console.log(
        `Code together server running on http://localhost:${PORT}`
    )
});

// start the http server and begin listening for requests. 
app.listen(PORT, () => {
    console.log(`Code Together server running on http://localhost:${PORT}`)
});
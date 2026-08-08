import express from "express"
import cors from "cors";
import { createServer } from "node:http";
import NodeWebsocket, { WebSocketServer } from "ws";

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


// Allow our react development server to make requests to this backend from the browser. 
app.use(cors({
    origin: "http://localhost:5173",
}));

//parse incoming JSON request bodies
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
app.post("/rooms", (request, response) => {
    const language = request.body.language;

    //if client sent a language, make sure it is supported. 
    if (
        language !== undefined && !isProgrammingLanguage(language)
    ) {
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
app.get("/rooms/:roomId", (request, response) => {
    //Route parameters come from the URL
    //e.g., GET/rooms/abc123
    // request.params.roomID === "abc123"

    const roomId = request.params.roomId;
    const room = roomService.getRoom(roomId)

    // if RoomService cannot find the room, 
    // return HTTP 404 Not Found.
    if (!room) {
        response.status(404).json({
            error: "Room not found"
        })
        return;
    }

    response.status(200).json(room);

})

//Join an existing room as a participant.
app.post("/rooms/:roomId/join", (request, response) => {
    const roomId = request.params.roomId;
    const displayName = request.body.displayName;

    //Basic runtime validation:
    //the client must send a non-empty display name. 
    if (
        typeof displayName !== "string" || displayName.trim().length === 0
    ) {
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
    if (!participant) {
        response.status(404).json({
            error: "Room not found",
        });
        return;
    }
    response.status(201).json(participant)
})

//        port 3000
//            │
//      Node HTTP server
//       /           \
//      /             \
//     ▼               ▼
// Express         WebSocket
// routes           server



// Express defines how HTTP requests are handled, 
// but we create the actual Node HTTP server ourselves
//  so that HTTP and WebSocket traffic can use the same port 

const httpServer = createServer(app);

// attach a websocket server to the existing HTTP server
const webSocketServer = new WebSocketServer({
    server: httpServer,
});


// Each room ID points to the websocket connections that are currently connected to that room.
//Example:
// roomConnections.get("room-123")
// -> Set of browser Websocket connections
const roomConnections = new Map<string, Set<NodeWebsocket>>();

// This event runs whenever a browser establishes
// a new WebSocket connection with our backend. 

webSocketServer.on("connection", (socket) => {
    console.log("WebSocket client connected");

    // Keep track of which room this specific socket joined.
    // It starts as null because a new WebSocket connection
    // has not identified its room yet.
    let joinedRoomId: string | null = null;

    socket.send(
        JSON.stringify({
            type: "connection:ready",
        })
    );

    // Runs whenever this browser sends a WebSocket message.
    socket.on("message", (rawMessage) => {
        try {
            // WebSocket messages arrive as raw data.
            // Convert the message into a string and then parse the JSON.
            const message = JSON.parse(rawMessage.toString());

            // --------------------------------------------------
            // 1. ROOM JOIN MESSAGE
            // --------------------------------------------------
            if (message.type === "room:join") {
                const roomId = message.roomId;
                const participantId = message.participantId;

                // WebSocket messages come from outside our application,
                // so we must validate the values at runtime.
                if (
                    typeof roomId !== "string" ||
                    typeof participantId !== "string"
                ) {
                    socket.send(
                        JSON.stringify({
                            type: "room:error",
                            error: "Invalid room join message",
                        })
                    );

                    return;
                }

                const room = roomStore.get(roomId);

                // The room must exist and the participant must
                // already belong to that room.
                if (
                    !room ||
                    !room.participantIds.includes(participantId)
                ) {
                    socket.send(
                        JSON.stringify({
                            type: "room:error",
                            error: "Room or participant not found",
                        })
                    );

                    return;
                }

                const existingConnections =
                    roomConnections.get(roomId);

                if (existingConnections) {
                    // Other users are already connected to this room.
                    existingConnections.add(socket);
                } else {
                    // This is the first WebSocket connection
                    // currently connected to this room.
                    const newConnections =
                        new Set<NodeWebsocket>();

                    newConnections.add(socket);

                    roomConnections.set(
                        roomId,
                        newConnections
                    );
                }

                // Remember which room this particular socket joined.
                joinedRoomId = roomId;

                console.log(
                    `Participant ${participantId} connected to room ${roomId}`
                );

                socket.send(
                    JSON.stringify({
                        type: "room:joined",
                        roomId,
                    })
                );

                return;
            }

            // --------------------------------------------------
            // 2. CODE UPDATE MESSAGE
            // --------------------------------------------------
            if (message.type === "code:update") {
                // A socket must join a room before it can send
                // code updates to that room.
                if (!joinedRoomId) {
                    socket.send(
                        JSON.stringify({
                            type: "room:error",
                            error: "Join a room before editing code",
                        })
                    );

                    return;
                }

                const newCode = message.code;

                if (typeof newCode !== "string") {
                    socket.send(
                        JSON.stringify({
                            type: "room:error",
                            error: "Invalid code update",
                        })
                    );

                    return;
                }

                const room = roomStore.get(joinedRoomId);

                if (!room) {
                    return;
                }

                // The server becomes the canonical source of
                // the latest code for this room.
                room.editorState.code = newCode;

                // Increase the revision every time the server
                // accepts a code update.
                room.editorState.revision += 1;

                roomStore.save(room);

                const connections =
                    roomConnections.get(joinedRoomId);

                if (!connections) {
                    return;
                }

                // Create one message that can be sent
                // to the other collaborators.
                const outgoingMessage = JSON.stringify({
                    type: "code:update",
                    code: room.editorState.code,
                    revision: room.editorState.revision,
                });

                // Broadcast the update to everyone in the room
                // EXCEPT the person who originally sent it.
                for (const connection of connections) {
                    if (
                        connection !== socket &&
                        connection.readyState === NodeWebsocket.OPEN
                    ) {
                        connection.send(outgoingMessage);
                    }
                }

                return;
            }
        } catch (error) {
            console.error(
                "Invalid WebSocket message:",
                error
            );

            socket.send(
                JSON.stringify({
                    type: "room:error",
                    error: "Invalid WebSocket message",
                })
            );
        }
    });

    socket.on("close", () => {
        console.log("WebSocket client disconnected");

        // If this socket had joined a room,
        // remove it from that room's connection Set.
        if (joinedRoomId) {
            const connections =
                roomConnections.get(joinedRoomId);

            connections?.delete(socket);

            // If nobody is connected to this room anymore,
            // remove the empty Set from the Map.
            if (connections?.size === 0) {
                roomConnections.delete(joinedRoomId);
            }
        }
    });
});

// start one server that handles both:
// -normal HTTP requests
// -Websocket connections
httpServer.listen(PORT, () => {
    console.log(

        `Code together server running on http://localhost:${PORT}`
    );
});


import express from "express"
import cors from "cors";
import { createServer } from "node:http";
import NodeWebsocket, { WebSocketServer, type RawData } from "ws";

import { databasePool } from "./config/database.js";
import { getE2BApiKey } from "./config/e2b.js";
import type {
    ExecutionOutcome,
    ExecutionRejectedMessage,
    ExecutionResult,
    ExecutionResultMessage,
    ExecutionStartedMessage,
} from "./domain/execution.js";
import type { ProgrammingLanguage } from "./domain/room.js";
import type { CodeExecutor } from "./execution/codeExecutor.js";
import { E2BPythonExecutor } from "./execution/e2bPythonExecutor.js";
import { MAX_SOURCE_CODE_BYTES } from "./execution/executionLimits.js";
import { PostgresRoomRepository } from "./repositories/postgresRoomRepository.js";
import { ParticipantStore } from "./store/participantStore.js";
import { RoomService } from "./services/roomService.js";

//create express application
const app = express();

// define a port where backend listens for HTTP requests.

const PORT = Number(process.env.PORT ?? 3000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";
const MAX_DISPLAY_NAME_LENGTH = 40;

// PostgreSQL owns persistent room state. ParticipantStore owns only temporary
// presence data for sockets connected to this backend process.
const roomRepository = new PostgresRoomRepository(databasePool);
const participantStore = new ParticipantStore();

// RoomService contains room business logic and depends on the repository
// contract rather than PostgreSQL directly.
const roomService = new RoomService(
    roomRepository,
    participantStore
);

// The concrete remote provider is selected only in this composition root.
// WebSocket orchestration depends on the small CodeExecutor contract.
const codeExecutor: CodeExecutor = new E2BPythonExecutor(getE2BApiKey);



// Middleware that allows Express to understand JSON request bodies.
// we will need need it when clients send data to the server.


// Allow our react development server to make requests to this backend from the browser.
app.use(cors({
    origin: CLIENT_ORIGIN,
}));

//parse incoming JSON request bodies
app.use(express.json({ limit: "32kb" }));


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

function isUuid(value: unknown): value is string {
    return (
        typeof value === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    );
}

function isCodeWithinLimit(value: string): boolean {
    return Buffer.byteLength(value, "utf8") <= MAX_SOURCE_CODE_BYTES;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRevision(value: unknown): value is number {
    return (
        typeof value === "number" &&
        Number.isSafeInteger(value) &&
        value >= 0
    );
}

function logServerError(message: string, error: unknown): void {
    if (error instanceof Error) {
        console.error(message, error);
        return;
    }

    console.error(message, String(error));
}

// health-check endpoint.
// GET/health lets us verify that the server is running.

app.get("/health", (_request, response) => (  //_ means it's not being used, intentionally
    response.json({
        status: "ok",
    })
));


// create a new collaborative room.
app.post("/rooms", async (request, response) => {
    const body = isRecord(request.body) ? request.body : {};
    const language = body.language;
    const code = body.code ?? "";

    //if client sent a language, make sure it is supported.
    if (
        language !== undefined && !isProgrammingLanguage(language)
    ) {
        response.status(400).json({
            error: "Unsupported programming language",
        })
        return
    }

    if (typeof code !== "string" || !isCodeWithinLimit(code)) {
        response.status(400).json({
            error: "Code must be a string no larger than 20 KB",
        });
        return;
    }

    try {
        // If no language was provided, RoomService uses its default.
        const room = await roomService.createRoom(language, code);

        // 201 means a new resource was successfully created.
        response.status(201).json(room);
    } catch (error: unknown) {
        logServerError("Could not create room:", error);
        response.status(500).json({
            error: "Could not create room",
        });
    }
})

// Get an existing room by its unique room ID.
app.get("/rooms/:roomId", async (request, response) => {
    //Route parameters come from the URL
    //e.g., GET/rooms/abc123
    // request.params.roomID === "abc123"

    const roomId = request.params.roomId;

    if (!isUuid(roomId)) {
        response.status(400).json({ error: "Invalid room ID" });
        return;
    }

    try {
        const room = await roomService.getRoom(roomId);

        // If RoomService cannot find the room,
        // return HTTP 404 Not Found.
        if (!room) {
            response.status(404).json({
                error: "Room not found"
            })
            return;
        }

        response.status(200).json(room);
    } catch (error: unknown) {
        logServerError("Could not load room:", error);
        response.status(500).json({
            error: "Could not load room",
        });
    }

})

//Join an existing room as a participant.
app.post("/rooms/:roomId/join", async (request, response) => {
    const roomId = request.params.roomId;
    const body = isRecord(request.body) ? request.body : {};
    const displayName = body.displayName;

    if (!isUuid(roomId)) {
        response.status(400).json({ error: "Invalid room ID" });
        return;
    }

    //Basic runtime validation:
    //the client must send a non-empty display name.
    if (
        typeof displayName !== "string" ||
        displayName.trim().length === 0 ||
        displayName.trim().length > MAX_DISPLAY_NAME_LENGTH
    ) {
        response.status(400).json({
            error: "Display name must be between 1 and 40 characters"
        });

        return;
    }
    try {
        const participant = await roomService.joinRoom(
            roomId,
            displayName.trim()
        );

        // joinRoom() returns null when the room does not exist.
        if (!participant) {
            response.status(404).json({
                error: "Room not found",
            });
            return;
        }

        response.status(201).json(participant)
    } catch (error: unknown) {
        logServerError("Could not join room:", error);
        response.status(500).json({
            error: "Could not join room",
        });
    }
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
    maxPayload: 64 * 1024,
});


// Each room ID points to the websocket connections that are currently connected to that room.
//Example:
// roomConnections.get("room-123")
// -> Set of browser Websocket connections
const roomConnections = new Map<string, Set<NodeWebsocket>>();

// The socket itself is a network connection; this Map records which
// temporary participant owns it after the server accepts room:join.
const socketParticipants = new Map<
    NodeWebsocket,
    { roomId: string; participantId: string }
>();

// Execution coordination is intentionally process-local. A room can run one
// program at a time, and every entry is removed in a finally block.
const runningRoomIds = new Set<string>();

function sendSocketMessage(socket: NodeWebsocket, message: object): void {
    if (socket.readyState === NodeWebsocket.OPEN) {
        socket.send(JSON.stringify(message));
    }
}

function sendExecutionRejection(
    socket: NodeWebsocket,
    roomId: string,
    error: string
): void {
    const message: ExecutionRejectedMessage = {
        type: "execution:rejected",
        roomId,
        error,
    };

    sendSocketMessage(socket, message);
}

function broadcastToRoom(
    roomId: string,
    message: object,
    excludedSocket?: NodeWebsocket
): void {
    const connections = roomConnections.get(roomId);

    if (!connections) {
        return;
    }

    for (const connection of connections) {
        if (connection !== excludedSocket) {
            sendSocketMessage(connection, message);
        }
    }
}

function broadcastPresence(roomId: string): void {
    const connections = roomConnections.get(roomId);
    const connectedParticipantIds = new Set<string>();

    for (const connection of connections ?? []) {
        const joinedSocket = socketParticipants.get(connection);

        if (joinedSocket) {
            connectedParticipantIds.add(joinedSocket.participantId);
        }
    }

    const participants = roomService
        .getParticipants(roomId)
        .filter((participant) => connectedParticipantIds.has(participant.id));

    broadcastToRoom(roomId, {
        type: "presence:update",
        participants,
    });
}

// This event runs whenever a browser establishes
// a new WebSocket connection with our backend.

webSocketServer.on("connection", (socket) => {
    console.log("WebSocket client connected");

    // Keep track of which room this specific socket joined.
    // It starts as null because a new WebSocket connection
    // has not identified its room yet.
    let joinedRoomId: string | null = null;
    let joinedParticipantId: string | null = null;
    let messageQueue: Promise<void> = Promise.resolve();

    sendSocketMessage(socket, { type: "connection:ready" });

    async function handleSocketMessage(rawMessage: RawData): Promise<void> {
        let parsedMessage: unknown;

        try {
            // WebSocket messages arrive as raw data.
            // Convert the message into a string and then parse the JSON.
            parsedMessage = JSON.parse(rawMessage.toString());
        } catch (error: unknown) {
            logServerError("Invalid WebSocket JSON:", error);
            sendSocketMessage(socket, {
                type: "room:error",
                error: "Invalid WebSocket message",
            });
            return;
        }

        if (
            !isRecord(parsedMessage) ||
            typeof parsedMessage.type !== "string"
        ) {
            sendSocketMessage(socket, {
                type: "room:error",
                error: "WebSocket message must include a string type",
            });
            return;
        }

        const message = parsedMessage;

            // --------------------------------------------------
            // 1. ROOM JOIN MESSAGE
            // --------------------------------------------------
            if (message.type === "room:join") {
                const roomId = message.roomId;
                const participantId = message.participantId;

                if (joinedRoomId) {
                    sendSocketMessage(socket, {
                        type: "room:error",
                        error: "This connection already joined a room",
                    });
                    return;
                }

                // WebSocket messages come from outside our application,
                // so we must validate the values at runtime.
                if (
                    !isUuid(roomId) ||
                    !isUuid(participantId)
                ) {
                    sendSocketMessage(socket, {
                        type: "room:error",
                        error: "Invalid room join message",
                    });

                    return;
                }

                const room = await roomService.getRoom(roomId);
                const participant = roomService.getParticipantForRoom(
                    roomId,
                    participantId
                );

                // The room must exist and the participant must
                // already belong to that room.
                if (
                    !room ||
                    !participant
                ) {
                    sendSocketMessage(socket, {
                        type: "room:error",
                        error: "Room or participant not found",
                    });

                    return;
                }

                const existingConnections =
                    roomConnections.get(roomId);

                const participantAlreadyConnected = [...(existingConnections ?? [])]
                    .some((connection) =>
                        socketParticipants.get(connection)?.participantId === participantId
                    );

                if (participantAlreadyConnected) {
                    sendSocketMessage(socket, {
                        type: "room:error",
                        error: "Participant is already connected",
                    });
                    return;
                }

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
                joinedParticipantId = participantId;
                socketParticipants.set(socket, { roomId, participantId });

                console.log(
                    `Participant ${participantId} connected to room ${roomId}`
                );

                sendSocketMessage(socket, {
                    type: "room:joined",
                    roomId,
                    editorState: room.editorState,
                });

                broadcastPresence(roomId);

                return;
            }

            // --------------------------------------------------
            // 2. CODE UPDATE MESSAGE
            // --------------------------------------------------
            if (message.type === "code:update") {
                // A socket must join a room before it can send
                // code updates to that room.
                if (!joinedRoomId || !joinedParticipantId) {
                    sendSocketMessage(socket, {
                        type: "room:error",
                        error: "Join a room before editing code",
                    });

                    return;
                }

                const newCode = message.code;
                const expectedRevision = message.revision;

                if (
                    typeof newCode !== "string" ||
                    !isCodeWithinLimit(newCode)
                ) {
                    sendSocketMessage(socket, {
                        type: "room:error",
                        error: "Code must be a string no larger than 20 KB",
                    });

                    return;
                }

                if (
                    expectedRevision !== undefined &&
                    !isRevision(expectedRevision)
                ) {
                    sendSocketMessage(socket, {
                        type: "room:error",
                        error: "Code update revision must be a non-negative integer",
                    });
                    return;
                }

                const room = await roomService.updateCode(
                    joinedRoomId,
                    newCode,
                    expectedRevision
                );

                if (!room) {
                    const currentRoom = await roomService.getRoom(joinedRoomId);

                    sendSocketMessage(socket, {
                        type: "room:error",
                        error: currentRoom
                            ? "Editor state is out of date"
                            : "Room not found",
                        ...(currentRoom
                            ? { editorState: currentRoom.editorState }
                            : {}),
                    });
                    return;
                }

                broadcastToRoom(joinedRoomId, {
                    type: "code:update",
                    code: room.editorState.code,
                    revision: room.editorState.revision,
                    participantId: joinedParticipantId,
                });

                return;
            }

            // --------------------------------------------------
            // 3. PYTHON EXECUTION MESSAGE
            // --------------------------------------------------
            if (message.type === "execution:run") {
                const roomId = message.roomId;
                const participantId = message.participantId;

                if (!isUuid(roomId) || !isUuid(participantId)) {
                    sendSocketMessage(socket, {
                        type: "room:error",
                        error: "Invalid execution request",
                    });
                    return;
                }

                if (
                    joinedRoomId !== roomId ||
                    joinedParticipantId !== participantId
                ) {
                    sendExecutionRejection(
                        socket,
                        roomId,
                        "Join this room before running code"
                    );
                    return;
                }

                const participant = roomService.getParticipantForRoom(
                    roomId,
                    participantId
                );

                if (!participant) {
                    sendExecutionRejection(
                        socket,
                        roomId,
                        "Participant is not connected to this room"
                    );
                    return;
                }

                if (runningRoomIds.has(roomId)) {
                    sendExecutionRejection(
                        socket,
                        roomId,
                        "This room is already running code"
                    );
                    return;
                }

                // Add the lock before the database lookup. Two requests that
                // arrive together cannot both pass this point.
                runningRoomIds.add(roomId);

                try {
                    const room = await roomService.getRoom(roomId);

                    if (!room) {
                        sendExecutionRejection(socket, roomId, "Room not found");
                        return;
                    }

                    if (room.editorState.language !== "python") {
                        sendExecutionRejection(
                            socket,
                            roomId,
                            "Only Python rooms can be executed"
                        );
                        return;
                    }

                    if (!isCodeWithinLimit(room.editorState.code)) {
                        sendExecutionRejection(
                            socket,
                            roomId,
                            "Python code must be no larger than 20 KB"
                        );
                        return;
                    }

                    const startedAt = new Date().toISOString();
                    const executionStartedAtMs = Date.now();
                    const startedMessage: ExecutionStartedMessage = {
                        type: "execution:started",
                        roomId,
                        requestedBy: participantId,
                        startedAt,
                    };

                    broadcastToRoom(roomId, startedMessage);

                    let outcome: ExecutionOutcome;

                    try {
                        outcome = await codeExecutor.execute(
                            room.editorState.code
                        );
                    } catch (error: unknown) {
                        logServerError("Python execution provider failed:", error);
                        outcome = {
                            status: "error",
                            stdout: "",
                            stderr: "Unable to run the code right now.",
                            errorName: "ExecutionServiceError",
                            traceback: null,
                            executionTimeMs: Date.now() - executionStartedAtMs,
                        };
                    }

                    const result: ExecutionResult = {
                        ...outcome,
                        requestedBy: participantId,
                        startedAt,
                        completedAt: new Date().toISOString(),
                    };
                    const resultMessage: ExecutionResultMessage = {
                        type: "execution:result",
                        roomId,
                        result,
                    };

                    broadcastToRoom(roomId, resultMessage);
                } finally {
                    runningRoomIds.delete(roomId);
                }

                return;
            }

            // --------------------------------------------------
            // 4. LANGUAGE UPDATE MESSAGE
            // --------------------------------------------------
            if (message.type === "language:update") {
                if (!joinedRoomId) {
                    sendSocketMessage(socket, {
                        type: "room:error",
                        error: "Join a room before changing language",
                    });
                    return;
                }

                if (!isProgrammingLanguage(message.language)) {
                    sendSocketMessage(socket, {
                        type: "room:error",
                        error: "Unsupported programming language",
                    });
                    return;
                }

                const expectedRevision = message.revision;

                if (
                    expectedRevision !== undefined &&
                    !isRevision(expectedRevision)
                ) {
                    sendSocketMessage(socket, {
                        type: "room:error",
                        error: "Language update revision must be a non-negative integer",
                    });
                    return;
                }

                const room = await roomService.updateLanguage(
                    joinedRoomId,
                    message.language,
                    expectedRevision
                );

                if (!room) {
                    const currentRoom = await roomService.getRoom(joinedRoomId);

                    sendSocketMessage(socket, {
                        type: "room:error",
                        error: currentRoom
                            ? "Editor state is out of date"
                            : "Room not found",
                        ...(currentRoom
                            ? { editorState: currentRoom.editorState }
                            : {}),
                    });
                    return;
                }

                // Include the sender so every browser applies the same
                // language only after the server accepts it.
                broadcastToRoom(joinedRoomId, {
                    type: "language:update",
                    language: room.editorState.language,
                    revision: room.editorState.revision,
                });

                return;
            }

            sendSocketMessage(socket, {
                type: "room:error",
                error: "Unsupported WebSocket message type",
            });
    }

    // EventEmitter does not await asynchronous listeners. A per-socket promise
    // chain both preserves message order and prevents unhandled rejections.
    socket.on("message", (rawMessage) => {
        messageQueue = messageQueue
            .then(() => handleSocketMessage(rawMessage))
            .catch((error: unknown) => {
                logServerError("Could not process WebSocket message:", error);
                sendSocketMessage(socket, {
                    type: "room:error",
                    error: "Could not process room message",
                });
            });
    });

    socket.on("close", () => {
        console.log("WebSocket client disconnected");

        // If this socket had joined a room,
        // remove it from that room's connection Set.
        if (joinedRoomId && joinedParticipantId) {
            const connections =
                roomConnections.get(joinedRoomId);

            connections?.delete(socket);
            socketParticipants.delete(socket);
            roomService.leaveRoom(joinedRoomId, joinedParticipantId);

            // If nobody is connected to this room anymore,
            // remove the empty Set from the Map.
            if (connections?.size === 0) {
                roomConnections.delete(joinedRoomId);
            }

            broadcastPresence(joinedRoomId);
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

let isShuttingDown = false;

async function shutdown(signal: "SIGINT" | "SIGTERM"): Promise<void> {
    if (isShuttingDown) {
        return;
    }

    isShuttingDown = true;
    console.log(`Received ${signal}; closing PostgreSQL pool`);

    try {
        await databasePool.end();
        process.exit(0);
    } catch (error: unknown) {
        logServerError("Could not close PostgreSQL pool:", error);
        process.exit(1);
    }
}

process.once("SIGINT", () => {
    void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
});

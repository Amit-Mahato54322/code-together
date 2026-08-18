export type ExecutionResultStatus = "success" | "error" | "timeout";

/**
 * Provider-independent result returned by a CodeExecutor.
 * E2B-specific response objects must be converted into this shape.
 */
export interface ExecutionOutcome {
  status: ExecutionResultStatus;
  stdout: string;
  stderr: string;
  errorName: string | null;
  traceback: string | null;
  executionTimeMs: number;
}

/**
 * Shared result broadcast to every participant in one room.
 */
export interface ExecutionResult extends ExecutionOutcome {
  requestedBy: string;
  startedAt: string;
  completedAt: string;
}

export interface ExecutionRunMessage {
  type: "execution:run";
  roomId: string;
  participantId: string;
}

export interface ExecutionStartedMessage {
  type: "execution:started";
  roomId: string;
  requestedBy: string;
  startedAt: string;
}

export interface ExecutionResultMessage {
  type: "execution:result";
  roomId: string;
  result: ExecutionResult;
}

export interface ExecutionRejectedMessage {
  type: "execution:rejected";
  roomId: string;
  error: string;
}

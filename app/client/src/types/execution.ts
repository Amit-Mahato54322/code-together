export type ExecutionResultStatus = "success" | "error" | "timeout";

export type ExecutionStatus = "idle" | "running" | ExecutionResultStatus;

export interface ExecutionResult {
  status: ExecutionResultStatus;
  stdout: string;
  stderr: string;
  errorName: string | null;
  traceback: string | null;
  executionTimeMs: number;
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

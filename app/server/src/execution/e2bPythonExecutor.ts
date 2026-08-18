import { performance } from "node:perf_hooks";

import {
  Sandbox,
  TimeoutError,
  type Execution,
} from "@e2b/code-interpreter";

import type { ExecutionOutcome } from "../domain/execution.js";
import type { CodeExecutor } from "./codeExecutor.js";
import {
  EXECUTION_TIMEOUT_MS,
  limitExecutionOutput,
} from "./executionLimits.js";

const CLEANUP_TIMEOUT_MS = 5_000;
const REQUEST_TIMEOUT_BUFFER_MS = 5_000;

export class E2BPythonExecutor implements CodeExecutor {
  constructor(
    private readonly apiKeyProvider: () => string,
    private readonly timeoutMs = EXECUTION_TIMEOUT_MS,
  ) {}

  async execute(code: string): Promise<ExecutionOutcome> {
    const startedAt = performance.now();
    let sandbox: Sandbox | null = null;

    try {
      const apiKey = this.apiKeyProvider();

      sandbox = await Sandbox.create({
        apiKey,
        timeoutMs: this.timeoutMs + REQUEST_TIMEOUT_BUFFER_MS,
        requestTimeoutMs: this.timeoutMs + REQUEST_TIMEOUT_BUFFER_MS,
        allowInternetAccess: false,
      });

      const execution = await sandbox.runCode(code, {
        language: "python",
        timeoutMs: this.timeoutMs,
        requestTimeoutMs: this.timeoutMs + REQUEST_TIMEOUT_BUFFER_MS,
      });

      return mapE2BExecution(
        execution,
        Math.round(performance.now() - startedAt),
      );
    } catch (error: unknown) {
      if (isTimeoutError(error)) {
        return {
          status: "timeout",
          stdout: "",
          stderr: `Execution timed out after ${this.timeoutMs / 1_000} seconds.`,
          errorName: "TimeoutError",
          traceback: null,
          executionTimeMs: Math.round(performance.now() - startedAt),
        };
      }

      throw error;
    } finally {
      if (sandbox) {
        try {
          await sandbox.kill({ requestTimeoutMs: CLEANUP_TIMEOUT_MS });
        } catch (cleanupError: unknown) {
          logCleanupError(cleanupError);
        }
      }
    }
  }
}

export function mapE2BExecution(
  execution: Pick<Execution, "logs" | "error">,
  executionTimeMs: number,
): ExecutionOutcome {
  const output = limitExecutionOutput(
    execution.logs.stdout.join(""),
    execution.logs.stderr.join(""),
    execution.error
      ? execution.error.traceback ||
          `${execution.error.name}: ${execution.error.value}`
      : null,
  );

  if (execution.error) {
    return {
      status: "error",
      ...output,
      errorName: execution.error.name,
      executionTimeMs,
    };
  }

  return {
    status: "success",
    ...output,
    errorName: null,
    executionTimeMs,
  };
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof TimeoutError ||
    (error instanceof Error && error.name === "TimeoutError")
  );
}

function logCleanupError(error: unknown): void {
  if (error instanceof Error) {
    console.error("Could not close E2B sandbox:", error);
    return;
  }

  console.error("Could not close E2B sandbox:", String(error));
}

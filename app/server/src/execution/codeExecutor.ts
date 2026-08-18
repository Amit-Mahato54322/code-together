import type { ExecutionOutcome } from "../domain/execution.js";

/**
 * Application-owned contract for running Python code.
 * Callers never depend on E2B-specific response types.
 */
export interface CodeExecutor {
  execute(code: string): Promise<ExecutionOutcome>;
}

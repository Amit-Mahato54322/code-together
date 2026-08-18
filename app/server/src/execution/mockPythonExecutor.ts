import { performance } from "node:perf_hooks";

import type { ExecutionOutcome } from "../domain/execution.js";
import type { CodeExecutor } from "./codeExecutor.js";

export class MockPythonExecutor implements CodeExecutor {
  constructor(private readonly delayMs = 300) {}

  async execute(_code: string): Promise<ExecutionOutcome> {
    const startedAt = performance.now();

    await new Promise<void>((resolve) => {
      setTimeout(resolve, this.delayMs);
    });

    return {
      status: "success",
      stdout: "Python execution pipeline connected.\n",
      stderr: "",
      errorName: null,
      traceback: null,
      executionTimeMs: Math.round(performance.now() - startedAt),
    };
  }
}

import assert from "node:assert/strict";
import test from "node:test";

import { MockPythonExecutor } from "../dist/execution/mockPythonExecutor.js";
import { mapE2BExecution } from "../dist/execution/e2bPythonExecutor.js";
import {
  MAX_OUTPUT_LENGTH,
  limitExecutionOutput,
} from "../dist/execution/executionLimits.js";

test("MockPythonExecutor returns the provider-independent execution shape", async () => {
  const executor = new MockPythonExecutor(0);

  const result = await executor.execute("print('ignored by the mock')");

  assert.equal(result.status, "success");
  assert.equal(result.stdout, "Python execution pipeline connected.\n");
  assert.equal(result.stderr, "");
  assert.equal(result.errorName, null);
  assert.equal(result.traceback, null);
  assert.ok(result.executionTimeMs >= 0);
});

test("limitExecutionOutput shares one output budget across all fields", () => {
  const result = limitExecutionOutput(
    "a".repeat(30_000),
    "b".repeat(30_000),
    "traceback",
  );
  const totalLength =
    result.stdout.length +
    result.stderr.length +
    (result.traceback?.length ?? 0);

  assert.equal(totalLength, MAX_OUTPUT_LENGTH);
  assert.match(result.stderr, /\[Output truncated\]$/);
  assert.equal(result.traceback, "");
});

test("mapE2BExecution normalizes Python errors without provider types", () => {
  const result = mapE2BExecution(
    {
      logs: {
        stdout: ["before error\n"],
        stderr: [],
      },
      error: {
        name: "ZeroDivisionError",
        value: "division by zero",
        traceback: "Traceback... ZeroDivisionError: division by zero",
      },
    },
    42,
  );

  assert.deepEqual(result, {
    status: "error",
    stdout: "before error\n",
    stderr: "",
    errorName: "ZeroDivisionError",
    traceback: "Traceback... ZeroDivisionError: division by zero",
    executionTimeMs: 42,
  });
});

test("E2BPythonExecutor validates a missing API key before creating a sandbox", async () => {
  const { E2BPythonExecutor } = await import(
    "../dist/execution/e2bPythonExecutor.js"
  );
  const executor = new E2BPythonExecutor(() => {
    throw new Error("Missing required environment variable: E2B_API_KEY");
  });

  await assert.rejects(
    executor.execute("print('never reaches E2B')"),
    /Missing required environment variable: E2B_API_KEY/,
  );
});

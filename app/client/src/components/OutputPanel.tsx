import type {
  ExecutionResult,
  ExecutionStatus,
} from "../types/execution";

interface OutputPanelProps {
  status: ExecutionStatus;
  result: ExecutionResult | null;
  notice: string | null;
}

function formatExecutionOutput(result: ExecutionResult | null): string {
  if (!result) {
    return "Run the current Python file to see its output.";
  }

  const outputParts = [result.stdout, result.stderr, result.traceback]
    .filter((part): part is string => Boolean(part));

  if (outputParts.length === 0) {
    return result.status === "success"
      ? "Execution completed with no output."
      : result.errorName ?? "Execution failed.";
  }

  return outputParts.join("\n");
}

export function OutputPanel({
  status,
  result,
  notice,
}: OutputPanelProps) {
  const output = status === "running"
    ? "Running..."
    : formatExecutionOutput(result);

  return (
    <section className="output-panel" aria-live="polite">
      <div className="output-header">
        <span>OUTPUT</span>
        <span className={`execution-status execution-status-${status}`}>
          {status}
        </span>
      </div>

      {notice && <p className="execution-notice">{notice}</p>}

      <pre className="execution-output">{output}</pre>
    </section>
  );
}

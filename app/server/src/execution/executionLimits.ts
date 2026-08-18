export const MAX_SOURCE_CODE_BYTES = 20 * 1024;
export const MAX_OUTPUT_LENGTH = 50_000;
export const EXECUTION_TIMEOUT_MS = 10_000;

export const OUTPUT_TRUNCATION_SUFFIX = "\n[Output truncated]";

export interface LimitedExecutionOutput {
  stdout: string;
  stderr: string;
  traceback: string | null;
}

/**
 * Shares one output budget across all text sent to the browser. This prevents
 * stdout, stderr, and a traceback from each consuming the full limit.
 */
export function limitExecutionOutput(
  stdout: string,
  stderr: string,
  traceback: string | null,
): LimitedExecutionOutput {
  const inputParts = [stdout, stderr, traceback ?? ""];
  const limitedParts = ["", "", ""];
  let remainingCharacters = MAX_OUTPUT_LENGTH;
  let wasTruncated = false;

  for (let index = 0; index < inputParts.length; index += 1) {
    const part = inputParts[index] ?? "";

    if (part.length <= remainingCharacters) {
      limitedParts[index] = part;
      remainingCharacters -= part.length;
      continue;
    }

    limitedParts[index] = part.slice(0, remainingCharacters);
    remainingCharacters = 0;
    wasTruncated = true;
  }

  if (wasTruncated) {
    let lastOutputIndex = -1;

    for (let index = limitedParts.length - 1; index >= 0; index -= 1) {
      if ((limitedParts[index] ?? "").length > 0) {
        lastOutputIndex = index;
        break;
      }
    }

    const suffixIndex = lastOutputIndex >= 0 ? lastOutputIndex : 0;
    const currentPart = limitedParts[suffixIndex] ?? "";

    limitedParts[suffixIndex] =
      currentPart.slice(
        0,
        Math.max(0, currentPart.length - OUTPUT_TRUNCATION_SUFFIX.length),
      ) + OUTPUT_TRUNCATION_SUFFIX;
  }

  return {
    stdout: limitedParts[0] ?? "",
    stderr: limitedParts[1] ?? "",
    traceback: traceback === null ? null : (limitedParts[2] ?? ""),
  };
}

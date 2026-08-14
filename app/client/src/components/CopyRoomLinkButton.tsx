import { useEffect, useState } from "react";

import {
  browserClipboardWriter,
  type ClipboardWriter,
} from "../services/clipboard";

type CopyStatus = "idle" | "copying" | "copied" | "error";

interface CopyRoomLinkButtonProps {
  roomUrl: string;
  clipboardWriter?: ClipboardWriter;
}

const RESET_DELAY_MS = 2_000;

const BUTTON_LABELS: Record<CopyStatus, string> = {
  idle: "Copy Room Link",
  copying: "Copying...",
  copied: "Copied!",
  error: "Copy Failed",
};

export function CopyRoomLinkButton({
  roomUrl,
  clipboardWriter = browserClipboardWriter,
}: CopyRoomLinkButtonProps) {
  const [status, setStatus] = useState<CopyStatus>("idle");

  useEffect(() => {
    if (status !== "copied" && status !== "error") {
      return;
    }

    const timeoutId = window.setTimeout(
      () => setStatus("idle"),
      RESET_DELAY_MS
    );

    return () => window.clearTimeout(timeoutId);
  }, [status]);

  async function copyRoomLink() {
    setStatus("copying");

    try {
      await clipboardWriter.writeText(roomUrl);
      setStatus("copied");
    } catch (error) {
      console.error("Could not copy room link:", error);
      setStatus("error");
    }
  }

  return (
    <button
      className="topbar-button copy-room-link-button"
      type="button"
      onClick={() => void copyRoomLink()}
      disabled={status === "copying"}
      title={roomUrl}
    >
      <span aria-live="polite">{BUTTON_LABELS[status]}</span>
    </button>
  );
}

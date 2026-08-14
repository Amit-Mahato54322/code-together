export interface ClipboardWriter {
  writeText(value: string): Promise<void>;
}

class BrowserClipboardWriter implements ClipboardWriter {
  async writeText(value: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return;
      } catch {
        // Some browsers expose the API but reject writes based on
        // permissions or document state. Use the local fallback below.
      }
    }

    this.writeTextWithSelection(value);
  }

  private writeTextWithSelection(value: string): void {
    const textArea = document.createElement("textarea");

    textArea.value = value;
    textArea.readOnly = true;
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";

    document.body.appendChild(textArea);
    textArea.select();

    try {
      if (!document.execCommand("copy")) {
        throw new Error("The browser rejected the clipboard request.");
      }
    } finally {
      textArea.remove();
    }
  }
}

export const browserClipboardWriter: ClipboardWriter =
  new BrowserClipboardWriter();

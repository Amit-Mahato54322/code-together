import { Editor } from "@monaco-editor/react";

import { PYTHON_EDITOR } from "../config/editor";

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export function CodeEditor({
  value,
  onChange,
  readOnly = false,
}: CodeEditorProps) {
  return (
    <Editor
      height="100%"
      language={PYTHON_EDITOR.language}
      value={value}
      theme="vs-dark"
      onChange={(newValue) => onChange(newValue ?? "")}
      options={{
        fontSize: 15,
        minimap: {
          enabled: false,
        },
        automaticLayout: true,
        wordWrap: "on",
        tabSize: 4,
        readOnly,
      }}
    />
  );
}

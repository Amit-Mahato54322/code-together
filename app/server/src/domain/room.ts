export type ProgrammingLanguage = "typescript" | "javascript" | "python";

export interface EditorState {
  code: string;
  language: ProgrammingLanguage;
  revision: number;
}

export interface Room {
  id: string;
  editorState: EditorState;
  participantIds: string[];
  createdAt: number;
  updatedAt: number;
}

// create the language configuration module

export type ProgrammingLanguage =
|"typescript"
|"javascript"
|"python";


export interface LanguageOption {
    id: ProgrammingLanguage;
    label: string;
    extension: string;
    badge: string;
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  {
    id: "typescript",
    label: "TypeScript",
    extension: "ts",
    badge: "TS"
  },

  {
    id: "javascript",
    label: "JavaScript",
    extension: "js",
    badge: "JS",
  },
  {
    id: "python",
    label: "Python",
    extension: "py",
    badge: "py",
  }
];

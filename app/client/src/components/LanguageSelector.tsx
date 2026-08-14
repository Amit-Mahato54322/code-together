import {
  LANGUAGE_OPTIONS,
  type ProgrammingLanguage,
} from "../config/languages";

interface LanguageSelectorProps {
  language: ProgrammingLanguage;
  onLanguageChange: (language: ProgrammingLanguage) => void;
  disabled?: boolean;
}

export function LanguageSelector({
  language,
  onLanguageChange,
  disabled = false,
}: LanguageSelectorProps) {
  return (
    <label className="language-control">
      <span>Language</span>

      <select
        className="language-select"
        value={language}
        disabled={disabled}
        onChange={(event) =>
          onLanguageChange(
            event.target.value as ProgrammingLanguage
          )
        }
      >
        {LANGUAGE_OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

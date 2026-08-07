import { useState } from "react";
import { CodeEditor } from "./components/CodeEditor";
import { LanguageSelector } from "./components/LanguageSelector";

import{
  LANGUAGE_OPTIONS, 
  type ProgrammingLanguage,

} from "./config/languages";
import "./App.css";



const DEFAULT_CODE = `function greet(name: string) {
  return "Hello, " + name + "!";
}

console.log(greet("Code Together"));`;

function App() {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [language, setLanguage] = useState<ProgrammingLanguage>("typescript");

  const activeLanguage = LANGUAGE_OPTIONS.find((option) => option.id === language) ?? LANGUAGE_OPTIONS[0];


  const fileName = `main.${activeLanguage.extension}`;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">{"</>"}</span>

          <div>
            <h1 className="brand-title">Code Together</h1>
            <p className="brand-subtitle">Collaborative coding workspace</p>
          </div>
        </div>

        <div className="topbar-actions">
          <LanguageSelector
          language={language}
          onLanguageChange={setLanguage}
          />
        </div>

        <div className="connection-status">
          <span className="status-dot" />
          Local session
        </div>
      </header>

      <main className="workspace">
        <aside className="sidebar">
          <div className="sidebar-title">EXPLORER</div>

          <button className="file-item file-item-active" type="button">
            <span className="file-badge">{activeLanguage.badge}</span>
            {fileName}
          </button>
        </aside>

        <section className="editor-panel">
          <div className="editor-tabs">
            <div className="editor-tab editor-tab-active">
              <span className="file-badge">{activeLanguage.badge}</span>
              {fileName}
            </div>
          </div>

          <div className="editor-container">
            <CodeEditor
              language = {language}
              value={code}
              onChange={setCode}
            />

          </div>
        </section>
      </main>

      <footer className="statusbar">
        <span>Local workspace</span>
        <span>{activeLanguage.label}</span>
      </footer>
    </div>
  );
}

export default App;
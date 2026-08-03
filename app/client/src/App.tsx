import { useState } from "react";
import { CodeEditor } from "./components/CodeEditor";

const DEFAULT_CODE = `function greet(name: string) {
  return "Hello, " + name + "!";
}

console.log(greet("Code Together"));`;


function App(){
  const[code, setCode] = useState(DEFAULT_CODE);

  return(<>
  <main style={{height: "100vh"}}>
    <CodeEditor
    language = "javascript"
    value = {code}
    onChange={setCode}
    />
  </main>
  </>)
}

export default App;

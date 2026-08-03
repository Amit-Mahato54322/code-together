import { Editor } from "@monaco-editor/react";

interface CodeEditorProps{
    language: string;
    value: string;
    onChange: (value: string)=> void;
}

export function CodeEditor(props:CodeEditorProps){
    return(
        <Editor
        height = "100%"
        language = {props.language}
        value = {props.value}
        theme="vs-dark"
        onChange={(newValue)=>props.onChange(newValue??"")}
        options={
            {
                fontSize:15,
                minimap:{
                    enabled:false,
                },
                automaticLayout:true,
                wordWrap:"on",
                tabSize:2,
            }
        }
        
        />
    )
}


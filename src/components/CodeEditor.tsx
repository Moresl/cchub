import { useCallback } from "react";
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-json";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-yaml";

interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: "json" | "markdown" | "yaml";
  readOnly?: boolean;
  minHeight?: number;
  maxHeight?: number;
  placeholder?: string;
}

export default function CodeEditor({
  value,
  onChange,
  language = "json",
  readOnly = false,
  minHeight = 120,
  maxHeight,
  placeholder,
}: CodeEditorProps) {
  const highlight = useCallback(
    (code: string) => {
      const grammar = Prism.languages[language];
      if (!grammar) return code;
      return Prism.highlight(code, grammar, language);
    },
    [language]
  );

  return (
    <div
      className="code-editor-wrapper"
      style={{
        borderRadius: 6,
        border: "1px solid var(--border-default)",
        background: "var(--bg-input)",
        overflow: "auto",
        maxHeight: maxHeight,
      }}
    >
      <Editor
        value={value}
        onValueChange={onChange || (() => {})}
        highlight={highlight}
        disabled={readOnly}
        placeholder={placeholder}
        padding={14}
        style={{
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
          fontSize: 12.5,
          lineHeight: 1.7,
          minHeight,
          tabSize: 2,
          color: "var(--text-secondary)",
          caretColor: "var(--text-primary)",
          outline: "none",
        }}
        textareaClassName="code-editor-textarea"
      />
    </div>
  );
}

import { useRef, useEffect } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { json } from "@codemirror/lang-json";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { linter, type Diagnostic } from "@codemirror/lint";
import { ViewUpdate } from "@codemirror/view";

interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language?: "json" | "markdown" | "yaml" | "toml" | "text";
  readOnly?: boolean;
  minHeight?: number;
  maxHeight?: number;
  placeholder?: string;
}

const jsonLinter = linter((view) => {
  const diagnostics: Diagnostic[] = [];
  const text = view.state.doc.toString();
  if (!text.trim()) return diagnostics;
  try {
    JSON.parse(text);
  } catch (e: any) {
    const match = e.message?.match(/position (\d+)/);
    const pos = match ? Math.min(parseInt(match[1]), text.length) : 0;
    diagnostics.push({ from: pos, to: Math.min(pos + 1, text.length), severity: "error", message: e.message || "Invalid JSON" });
  }
  return diagnostics;
});

const cmTheme = EditorView.theme({
  "&": {
    fontSize: "12.5px",
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
  },
  ".cm-content": {
    padding: "12px 0",
    caretColor: "var(--text-primary)",
  },
  ".cm-gutters": {
    background: "var(--bg-elevated)",
    borderRight: "1px solid var(--border-subtle)",
    color: "var(--text-muted)",
    fontSize: "11px",
  },
  ".cm-activeLine": {
    background: "rgba(255,255,255,0.03)",
  },
  ".cm-activeLineGutter": {
    background: "rgba(255,255,255,0.05)",
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "#ffffff",
    borderLeftWidth: "2px",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    background: "rgba(255,255,255,0.1) !important",
  },
  ".cm-tooltip": {
    background: "var(--bg-card)",
    border: "1px solid var(--border-default)",
    borderRadius: "6px",
  },
  ".cm-tooltip-lint": {
    padding: "4px 8px",
    fontSize: "12px",
  },
});

function getLangExtension(language: string) {
  switch (language) {
    case "json": return [json(), jsonLinter];
    case "yaml":
    case "toml":
    case "markdown":
      return [javascript()];
    case "text":
      return [];
    default:
      return [];
  }
}

export default function CodeEditor({
  value,
  onChange,
  language = "json",
  readOnly = false,
  minHeight = 120,
  maxHeight,
}: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;

    const extensions = [
      basicSetup,
      ...getLangExtension(language),
      oneDark,
      cmTheme,
      EditorView.lineWrapping,
    ];

    if (readOnly) {
      extensions.push(EditorState.readOnly.of(true));
    }

    if (!readOnly) {
      extensions.push(
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) {
            onChangeRef.current?.(update.state.doc.toString());
          }
        })
      );
    }

    const state = EditorState.create({ doc: value, extensions });
    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => { view.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, readOnly]);

  // Sync external value changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentValue = view.state.doc.toString();
    if (currentValue !== value) {
      view.dispatch({
        changes: { from: 0, to: currentValue.length, insert: value },
      });
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="code-editor-wrapper"
      style={{
        borderRadius: 6,
        border: "1px solid var(--border-default)",
        background: "var(--bg-input)",
        overflow: "auto",
        minHeight,
        maxHeight,
      }}
    />
  );
}

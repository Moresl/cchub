import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, FileText, Save, RotateCcw, Plus, X, Check } from "lucide-react";
import { t } from "../lib/i18n";
import CodeEditor from "../components/CodeEditor";

interface ClaudeMdFile {
  path: string;
  project_name: string;
  size_bytes: number;
  modified_at: string | null;
  content_preview: string;
}

interface ClaudeMdTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
}

export default function ClaudeMd() {
  const [files, setFiles] = useState<ClaudeMdFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ClaudeMdFile | null>(null);
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [templates, setTemplates] = useState<ClaudeMdTemplate[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newDirPath, setNewDirPath] = useState("");
  const i = t();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [f, tmpl] = await Promise.all([
        invoke<ClaudeMdFile[]>("scan_claude_md"),
        invoke<ClaudeMdTemplate[]>("get_claude_md_templates"),
      ]);
      setFiles(f);
      setTemplates(tmpl);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function selectFile(file: ClaudeMdFile) {
    setSelected(file);
    setLoadingContent(true);
    setShowCreate(false);
    try {
      const c = await invoke<string>("read_claude_md_content", { path: file.path });
      setContent(c);
      setOriginalContent(c);
    } catch (e) {
      console.error(e);
      setContent("Failed to load file");
      setOriginalContent("");
    }
    finally { setLoadingContent(false); }
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    try {
      await invoke("write_claude_md_content", { path: selected.path, content });
      setOriginalContent(content);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { console.error(e); alert("Failed to save"); }
    finally { setSaving(false); }
  }

  function handleRevert() {
    setContent(originalContent);
  }

  async function handleCreate(template: ClaudeMdTemplate) {
    if (!newDirPath.trim()) return;
    try {
      const path = await invoke<string>("create_new_claude_md", {
        dirPath: newDirPath.trim(),
        content: template.content,
      });
      setShowCreate(false);
      setNewDirPath("");
      await load();
      // Select the newly created file
      const newFile: ClaudeMdFile = {
        path,
        project_name: newDirPath.split(/[/\\]/).pop() || newDirPath,
        size_bytes: template.content.length,
        modified_at: new Date().toISOString().slice(0, 16).replace("T", " "),
        content_preview: template.content.slice(0, 200),
      };
      selectFile(newFile);
    } catch (e: any) {
      alert(e?.toString() || "Failed to create file");
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  const hasChanges = content !== originalContent;
  const locale = localStorage.getItem("cchub-locale") || "zh";

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {locale === "zh" ? "正在扫描 CLAUDE.md 文件..." : "Scanning CLAUDE.md files..."}
        </span>
      </div>
    );
  }

  return (
    <div className="animate-in" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="page-header">
        <div>
          <h2 className="page-title">{i.claudeMd.title}</h2>
          <p className="page-subtitle">{i.claudeMd.subtitle.replace("{count}", String(files.length))}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => { setShowCreate(true); setSelected(null); }}>
            <Plus size={14} />{i.claudeMd.newFile}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={load}>
            <RefreshCw size={14} />{i.common.refresh}
          </button>
        </div>
      </div>

      {files.length === 0 && !showCreate ? (
        <div className="card empty-state" style={{ flex: 1 }}>
          <div className="empty-icon"><FileText size={28} style={{ color: "var(--text-muted)" }} /></div>
          <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-secondary)" }}>{i.claudeMd.noFiles}</p>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8, maxWidth: 320 }}>{i.claudeMd.noFilesTip}</p>
          <button className="btn btn-primary btn-sm" style={{ marginTop: 16 }} onClick={() => setShowCreate(true)}>
            <Plus size={14} />{i.claudeMd.newFile}
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 24, flex: 1, minHeight: 0 }}>
          {/* File List */}
          <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }} className="stagger">
            {files.map((file) => (
              <div
                key={file.path}
                className={`card card-interactive ${selected?.path === file.path ? "selected" : ""}`}
                style={{ padding: "16px 20px" }}
                onClick={() => selectFile(file)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div className="icon-box" style={{ background: "var(--bg-elevated)", width: 36, height: 36, borderRadius: 6 }}>
                    <FileText size={16} style={{ color: "var(--text-secondary)" }} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {file.project_name}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {file.path}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{formatSize(file.size_bytes)}</div>
                    {file.modified_at && (
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{file.modified_at}</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Editor Panel */}
          <div style={{ overflowY: "auto" }}>
            {showCreate ? (
              <div className="section-card" style={{ position: "sticky", top: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700 }}>{i.claudeMd.newFile}</h3>
                  <button className="btn btn-ghost btn-icon-sm" onClick={() => setShowCreate(false)}><X size={16} /></button>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <span className="field-label">{i.claudeMd.createIn}</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      className="input"
                      style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}
                      placeholder={locale === "zh" ? "输入项目目录路径" : "Enter project directory path"}
                      value={newDirPath}
                      onChange={(e) => setNewDirPath(e.target.value)}
                    />
                  </div>
                </div>

                <span className="field-label">{i.claudeMd.selectTemplate}</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {templates.map((tmpl) => (
                    <div
                      key={tmpl.id}
                      className="card card-interactive"
                      style={{ padding: "14px 18px" }}
                      onClick={() => handleCreate(tmpl)}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{tmpl.name}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{tmpl.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : selected ? (
              <div className="section-card" style={{ position: "sticky", top: 0 }}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <FileText size={18} style={{ color: "var(--text-secondary)" }} />
                    <h3 style={{ fontSize: 16, fontWeight: 700 }}>{selected.project_name}</h3>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {hasChanges && (
                      <button className="btn btn-secondary btn-sm" onClick={handleRevert}>
                        <RotateCcw size={14} />{i.claudeMd.revert}
                      </button>
                    )}
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleSave}
                      disabled={!hasChanges || saving}
                    >
                      {saved ? <Check size={14} /> : <Save size={14} />}
                      {saved ? (i.claudeMd.saved) : i.common.save}
                    </button>
                    <button className="btn btn-ghost btn-icon-sm" onClick={() => setSelected(null)}>
                      <X size={16} />
                    </button>
                  </div>
                </div>

                {/* File info */}
                <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                  <span className="badge badge-accent">{formatSize(selected.size_bytes)}</span>
                  {selected.modified_at && (
                    <span className="badge badge-muted">{selected.modified_at}</span>
                  )}
                  {hasChanges && (
                    <span className="badge badge-warning">{locale === "zh" ? "未保存" : "Unsaved"}</span>
                  )}
                </div>

                {/* Path */}
                <div style={{ marginBottom: 16 }}>
                  <span className="field-label">{locale === "zh" ? "文件路径" : "File Path"}</span>
                  <div className="code-block" style={{ fontSize: 11 }}>{selected.path}</div>
                </div>

                {/* Editor */}
                {loadingContent ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 40, justifyContent: "center" }}>
                    <div className="spinner" style={{ width: 18, height: 18 }} />
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading...</span>
                  </div>
                ) : (
                  <div>
                    <span className="field-label">{i.claudeMd.content}</span>
                    <CodeEditor
                      value={content}
                      onChange={setContent}
                      language="markdown"
                      minHeight={400}
                      maxHeight={600}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 220 }}>
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{i.claudeMd.selectFile}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ChevronDown,
  ChevronRight,
  Code2,
  File,
  FileCode2,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  Globe,
  Monitor,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Terminal,
} from "lucide-react";
import { getLocale, t } from "../lib/i18n";
import type { FolderNode } from "../types/skills";
import { showToast } from "../components/Toast";
import CodeEditor from "../components/CodeEditor";
import ConfirmDialog from "../components/ConfirmDialog";

const MarkdownEditor = lazy(() => import("../components/MarkdownEditor"));

interface ConfigRoot {
  id: string;
  name: string;
  path: string;
  exists: boolean;
}

type EditorLanguage = "json" | "markdown" | "yaml" | "toml" | "text";
type PendingAction =
  | { type: "openFile"; path: string }
  | { type: "switchRoot"; rootId: string }
  | null;

const ROOT_ICONS: Record<string, typeof Terminal> = {
  claude: Terminal,
  codex: Code2,
  gemini: Sparkles,
  opencode: Globe,
  openclaw: Monitor,
};

function detectLanguage(path: string): EditorLanguage {
  const lower = path.toLowerCase();
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".toml")) return "toml";
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "yaml";
  if (lower.endsWith(".md") || lower.endsWith(".mdx") || lower.endsWith(".markdown")) return "markdown";
  return "text";
}

function fileIcon(path: string) {
  const language = detectLanguage(path);
  switch (language) {
    case "json":
      return FileJson;
    case "toml":
    case "yaml":
      return FileCode2;
    case "markdown":
      return FileText;
    default:
      return File;
  }
}

export default function ConfigFiles() {
  const i = t();
  const locale = getLocale();
  const zh = locale === "zh";
  const [roots, setRoots] = useState<ConfigRoot[]>([]);
  const [activeRoot, setActiveRoot] = useState("");
  const [tree, setTree] = useState<FolderNode | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingTree, setLoadingTree] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const hasChanges = content !== originalContent;
  const activeRootMeta = useMemo(() => roots.find((root) => root.id === activeRoot) || null, [roots, activeRoot]);
  const activeLanguage = activeFile ? detectLanguage(activeFile) : "text";

  useEffect(() => {
    loadRoots();
  }, []);

  useEffect(() => {
    if (activeRoot) {
      loadTree(activeRoot);
    }
  }, [activeRoot]);

  async function loadRoots() {
    setLoading(true);
    try {
      const result = await invoke<ConfigRoot[]>("get_config_roots");
      setRoots(result);
      const currentRoot = result.find((root) => root.id === activeRoot && root.exists);
      const firstExisting = result.find((root) => root.exists);
      setActiveRoot(currentRoot?.id || firstExisting?.id || "");
    } catch (error) {
      console.error(error);
      showToast("error", String(error));
    } finally {
      setLoading(false);
    }
  }

  async function loadTree(rootId: string) {
    setLoadingTree(true);
    setTree(null);
    setActiveFile(null);
    setContent("");
    setOriginalContent("");
    try {
      const nextTree = await invoke<FolderNode>("get_config_file_tree", { rootId });
      setTree(nextTree);
      setExpanded({ [nextTree.path]: true });
    } catch (error) {
      console.error(error);
      showToast("error", String(error));
    } finally {
      setLoadingTree(false);
    }
  }

  async function openFile(path: string) {
    setLoadingFile(true);
    setActiveFile(path);
    try {
      const nextContent = await invoke<string>("read_config_file_content", { path });
      setContent(nextContent);
      setOriginalContent(nextContent);
    } catch (error) {
      console.error(error);
      showToast("error", String(error));
      setContent("");
      setOriginalContent("");
    } finally {
      setLoadingFile(false);
    }
  }

  async function saveFile() {
    if (!activeFile) return;
    setSaving(true);
    try {
      await invoke("write_config_file_content", { path: activeFile, content });
      setOriginalContent(content);
      showToast("success", zh ? "已保存" : "Saved");
    } catch (error) {
      console.error(error);
      showToast("error", String(error));
    } finally {
      setSaving(false);
    }
  }

  function toggleExpand(path: string) {
    setExpanded((current) => ({ ...current, [path]: !current[path] }));
  }

  function requestOpenFile(path: string) {
    if (hasChanges) {
      setPendingAction({ type: "openFile", path });
      return;
    }
    void openFile(path);
  }

  function requestSwitchRoot(rootId: string) {
    if (hasChanges) {
      setPendingAction({ type: "switchRoot", rootId });
      return;
    }
    setActiveRoot(rootId);
  }

  function handleConfirmPendingAction() {
    const action = pendingAction;
    setPendingAction(null);
    if (!action) return;
    if (action.type === "openFile") {
      void openFile(action.path);
      return;
    }
    setActiveRoot(action.rootId);
  }

  function renderTree(node: FolderNode, depth = 0) {
    const isExpanded = expanded[node.path] ?? depth < 1;
    const isSelected = activeFile === node.path;

    if (node.is_dir) {
      return (
        <div key={node.path}>
          <button
            className="btn btn-ghost"
            onClick={() => toggleExpand(node.path)}
            style={{
              width: "100%",
              justifyContent: "flex-start",
              padding: "6px 8px",
              paddingLeft: 8 + depth * 14,
              borderRadius: 6,
              color: "var(--text-secondary)",
              gap: 8,
            }}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.name}</span>
          </button>
          {isExpanded && node.children.map((child) => renderTree(child, depth + 1))}
        </div>
      );
    }

    const Icon = fileIcon(node.path);
    return (
      <button
        key={node.path}
        className="btn btn-ghost"
        onClick={() => requestOpenFile(node.path)}
        style={{
          width: "100%",
          justifyContent: "flex-start",
          padding: "6px 8px",
          paddingLeft: 36 + depth * 14,
          borderRadius: 6,
          gap: 8,
          color: isSelected ? "var(--text-primary)" : "var(--text-secondary)",
          background: isSelected ? "var(--bg-card-hover)" : "transparent",
          border: isSelected ? "1px solid var(--border-default)" : "1px solid transparent",
        }}
        title={node.path}
      >
        <Icon size={14} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.name}</span>
      </button>
    );
  }

  if (loading) {
    return (
      <div className="loading-center">
        <div className="spinner" />
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{i.configFiles.loading}</span>
      </div>
    );
  }

  return (
    <div className="animate-in" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="page-header">
        <div>
          <h2 className="page-title">{i.configFiles.title}</h2>
          <p className="page-subtitle">{i.configFiles.subtitle}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={loadRoots}>
            <RefreshCw size={14} />
            {i.common.refresh}
          </button>
          <button className="btn btn-primary btn-sm" onClick={saveFile} disabled={!activeFile || !hasChanges || saving}>
            <Save size={14} />
            {i.common.save}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {roots.map((root) => {
          const Icon = ROOT_ICONS[root.id] || FolderOpen;
          return (
            <button
              key={root.id}
              className={`btn btn-sm ${activeRoot === root.id ? "btn-primary" : "btn-secondary"}`}
              disabled={!root.exists}
              onClick={() => requestSwitchRoot(root.id)}
              style={{ opacity: root.exists ? 1 : 0.45 }}
              title={root.path}
            >
              <Icon size={14} />
              {root.name}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "320px minmax(0, 1fr)", gap: 16 }}>
        <div className="card" style={{ minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-default)" }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{i.configFiles.folders}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
              {activeRootMeta?.path || i.common.na}
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 10 }}>
            {loadingTree ? (
              <div className="loading-center" style={{ height: "100%" }}>
                <div className="spinner" />
              </div>
            ) : tree ? (
              renderTree(tree)
            ) : (
              <div className="empty-state" style={{ minHeight: 260 }}>
                <div className="empty-icon">
                  <FolderOpen size={28} style={{ color: "var(--text-muted)" }} />
                </div>
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>{i.configFiles.noRoot}</p>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8, maxWidth: 240 }}>{i.configFiles.noRootTip}</p>
              </div>
            )}
          </div>
        </div>

        <div className="card" style={{ minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-default)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {activeFile ? activeFile.split(/[/\\]/).pop() : i.configFiles.selectFile}
                </span>
                {hasChanges && <span className="badge badge-warning">{i.configFiles.unsaved}</span>}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {activeFile || i.configFiles.selectTip}
              </div>
            </div>
            {activeFile && (
              <button className="btn btn-secondary btn-sm" onClick={() => setContent(originalContent)} disabled={!hasChanges}>
                <RotateCcw size={14} />
                {i.configFiles.revert}
              </button>
            )}
          </div>

          <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 16 }}>
            {!activeFile ? (
              <div className="empty-state" style={{ minHeight: "100%" }}>
                <div className="empty-icon">
                  <FileText size={28} style={{ color: "var(--text-muted)" }} />
                </div>
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>{i.configFiles.selectFile}</p>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8, maxWidth: 260 }}>{i.configFiles.selectTip}</p>
              </div>
            ) : loadingFile ? (
              <div className="loading-center" style={{ height: "100%" }}>
                <div className="spinner" />
              </div>
            ) : activeLanguage === "markdown" ? (
              <Suspense fallback={<div className="loading-center" style={{ height: "100%" }}><div className="spinner" /></div>}>
                <MarkdownEditor value={content} onChange={setContent} minHeight={520} />
              </Suspense>
            ) : (
              <CodeEditor value={content} onChange={setContent} language={activeLanguage} minHeight={520} />
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!pendingAction}
        title={zh ? "未保存的修改" : "Unsaved Changes"}
        message={zh ? "当前文件有未保存修改，继续操作会丢失这些更改。" : "The current file has unsaved changes. Continuing will discard them."}
        confirmText={zh ? "继续" : "Continue"}
        cancelText={i.common.cancel}
        variant="info"
        onConfirm={handleConfirmPendingAction}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}

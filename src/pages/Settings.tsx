import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Globe, FolderOpen, Info, Palette, Sun, Moon, Download, RefreshCw, CheckCircle, AlertCircle, Copy, Check, Upload, Archive, Wifi } from "lucide-react";
import { t, getLocale, setLocale, type Locale } from "../lib/i18n";
import { showToast } from "../components/Toast";
import { getTheme, setTheme, type Theme } from "../lib/theme";

interface AppUpdateState {
  update_available: boolean;
  latest_version: string | null;
  body: string | null;
  not_configured: boolean;
}

interface CustomPath { tool_id: string; config_dir: string | null; mcp_config_path: string | null; skills_dir: string | null; }
interface DetectedTool { id: string; name: string; config_path: string; skills_dir: string; mcp_config_path: string; installed: boolean; install_command: string; install_url: string; }

export default function Settings() {
  const [locale, setLoc] = useState<Locale>(getLocale());
  const [theme, setThm] = useState<Theme>(getTheme());
  const [autoScan, setAutoScan] = useState(true);
  const [checkUpdates, setCheckUpdates] = useState(true);
  const [appUpdate, setAppUpdate] = useState<AppUpdateState | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateObj, setUpdateObj] = useState<any>(null);
  const [tools, setTools] = useState<DetectedTool[]>([]);
  const [customPaths, setCustomPaths] = useState<CustomPath[]>([]);
  const [pathSaved, setPathSaved] = useState<string | null>(null);
  const [proxyUrl, setProxyUrl] = useState("");
  const [proxySaved, setProxySaved] = useState(false);
  const i = t();
  const loc = getLocale();

  useEffect(() => { loadToolsAndPaths(); loadProxy(); }, []);

  async function loadProxy() {
    try {
      const proxy = await invoke<string>("get_proxy");
      setProxyUrl(proxy);
    } catch { /* ignore */ }
  }

  async function loadToolsAndPaths() {
    try {
      const [t, p] = await Promise.all([
        invoke<DetectedTool[]>("detect_tools"),
        invoke<CustomPath[]>("get_custom_paths"),
      ]);
      setTools(t);
      setCustomPaths(p);
    } catch (e) { console.error(e); }
  }

  function handleLocaleChange(newLocale: Locale) {
    setLocale(newLocale);
    setLoc(newLocale);
    window.location.reload();
  }

  function handleThemeChange(newTheme: Theme) {
    setTheme(newTheme);
    setThm(newTheme);
  }

  async function handleCheckUpdate() {
    setCheckingUpdate(true);
    setUpdateError(null);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        setAppUpdate({
          update_available: true,
          latest_version: update.version,
          body: update.body ?? null,
          not_configured: false,
        });
        setUpdateObj(update);
      } else {
        setAppUpdate({
          update_available: false,
          latest_version: null,
          body: null,
          not_configured: false,
        });
        setUpdateObj(null);
      }
    } catch (e) {
      const msg = String(e);
      if (msg.includes("not configured") || msg.includes("pubkey")) {
        setAppUpdate({
          update_available: false,
          latest_version: null,
          body: null,
          not_configured: true,
        });
      } else {
        setUpdateError(msg);
      }
    } finally {
      setCheckingUpdate(false);
    }
  }

  async function handleInstallUpdate() {
    if (!updateObj) return;
    setInstalling(true);
    setUpdateError(null);
    try {
      await updateObj.downloadAndInstall();
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      setUpdateError(String(e));
    } finally {
      setInstalling(false);
    }
  }

  return (
    <div className="animate-in" style={{ maxWidth: 800 }}>
      <div className="page-header">
        <div>
          <h2 className="page-title">{i.settings.title}</h2>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Appearance */}
        <div className="section-card">
          <div className="section-card-title">
            <Palette size={17} style={{ color: "var(--text-secondary)" }} />
            {i.settings.appearance}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Theme */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>{i.settings.theme}</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {([["dark", i.settings.dark, Moon], ["light", i.settings.light, Sun]] as [Theme, string, typeof Moon][]).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    className={`btn btn-sm ${theme === key ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => handleThemeChange(key)}
                    style={{ gap: 6 }}
                  >
                    <Icon size={14} />{label}
                  </button>
                ))}
              </div>
            </div>

            <div className="divider" />

            {/* Language */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Globe size={16} style={{ color: "var(--text-secondary)" }} />
                <p style={{ fontSize: 14, fontWeight: 500 }}>{i.settings.language}</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {([["zh", "中文"], ["en", "English"]] as [Locale, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    className={`btn btn-sm ${locale === key ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => handleLocaleChange(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* General */}
        <div className="section-card">
          <div className="section-card-title">{i.settings.general}</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>{i.settings.autoScan}</p>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>{i.settings.autoScanDesc}</p>
              </div>
              <button className={`toggle ${autoScan ? "on" : "off"}`} onClick={() => setAutoScan(!autoScan)}>
                <div className="toggle-knob" />
              </button>
            </div>

            <div className="divider" />

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>{i.settings.checkUpdates}</p>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>{i.settings.checkUpdatesDesc}</p>
              </div>
              <button className={`toggle ${checkUpdates ? "on" : "off"}`} onClick={() => setCheckUpdates(!checkUpdates)}>
                <div className="toggle-knob" />
              </button>
            </div>
          </div>
        </div>

        {/* Tool Paths */}
        <div className="section-card">
          <div className="section-card-title">
            <FolderOpen size={17} style={{ color: "var(--text-secondary)" }} />
            {loc === "zh" ? "工具路径配置" : "Tool Path Configuration"}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {tools.map((tool) => {
              const custom = customPaths.find(p => p.tool_id === tool.id);
              return (
                <div key={tool.id} style={{ padding: "12px 16px", borderRadius: 8, background: "var(--bg-input)", opacity: tool.installed ? 1 : 0.6 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{tool.name}</span>
                      <span className={`badge ${tool.installed ? "badge-success" : "badge-muted"}`} style={{ fontSize: 10 }}>
                        {tool.installed ? (loc === "zh" ? "已安装" : "Installed") : (loc === "zh" ? "未安装" : "Not installed")}
                      </span>
                    </div>
                    {pathSaved === tool.id && <Check size={14} style={{ color: "var(--success)" }} />}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", width: 80, flexShrink: 0 }}>MCP</span>
                      <input
                        className="input"
                        style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", padding: "4px 8px", height: 28, flex: 1 }}
                        defaultValue={custom?.mcp_config_path || tool.mcp_config_path}
                        onBlur={async (e) => {
                          const val = e.target.value.trim();
                          if (val && val !== tool.mcp_config_path) {
                            await invoke("save_custom_path", { toolId: tool.id, configDir: custom?.config_dir || null, mcpConfigPath: val, skillsDir: custom?.skills_dir || null });
                            setPathSaved(tool.id); setTimeout(() => setPathSaved(null), 2000);
                            loadToolsAndPaths();
                          }
                        }}
                      />
                      <button className="btn btn-ghost btn-icon-sm" title={loc === "zh" ? "选择文件" : "Pick file"}
                        onClick={async () => {
                          const picked = await invoke<string | null>("pick_file");
                          if (picked) {
                            await invoke("save_custom_path", { toolId: tool.id, configDir: custom?.config_dir || null, mcpConfigPath: picked, skillsDir: custom?.skills_dir || null });
                            setPathSaved(tool.id); setTimeout(() => setPathSaved(null), 2000);
                            loadToolsAndPaths();
                          }
                        }}>
                        <FolderOpen size={12} />
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", width: 80, flexShrink: 0 }}>Skills</span>
                      <input
                        className="input"
                        style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", padding: "4px 8px", height: 28, flex: 1 }}
                        defaultValue={custom?.skills_dir || tool.skills_dir}
                        onBlur={async (e) => {
                          const val = e.target.value.trim();
                          if (val && val !== tool.skills_dir) {
                            await invoke("save_custom_path", { toolId: tool.id, configDir: custom?.config_dir || null, mcpConfigPath: custom?.mcp_config_path || null, skillsDir: val });
                            setPathSaved(tool.id); setTimeout(() => setPathSaved(null), 2000);
                            loadToolsAndPaths();
                          }
                        }}
                      />
                      <button className="btn btn-ghost btn-icon-sm" title={loc === "zh" ? "选择文件夹" : "Pick folder"}
                        onClick={async () => {
                          const picked = await invoke<string | null>("pick_folder");
                          if (picked) {
                            await invoke("save_custom_path", { toolId: tool.id, configDir: custom?.config_dir || null, mcpConfigPath: custom?.mcp_config_path || null, skillsDir: picked });
                            setPathSaved(tool.id); setTimeout(() => setPathSaved(null), 2000);
                            loadToolsAndPaths();
                          }
                        }}>
                        <FolderOpen size={12} />
                      </button>
                    </div>
                  </div>
                  {!tool.installed && tool.install_command && (
                    <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                      <code style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>{tool.install_command}</code>
                      <button className="btn btn-ghost btn-icon-sm" onClick={() => navigator.clipboard.writeText(tool.install_command)} title="Copy">
                        <Copy size={11} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* App Update */}
        <div className="section-card">
          <div className="section-card-title">
            <Download size={17} style={{ color: "var(--text-secondary)" }} />
            {i.settings.appUpdate}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>{i.settings.currentVersion}</p>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>{i.app.version}</p>
              </div>
              <button
                className="btn btn-sm btn-secondary"
                onClick={handleCheckUpdate}
                disabled={checkingUpdate}
                style={{ gap: 6 }}
              >
                <RefreshCw size={14} className={checkingUpdate ? "spin" : ""} />
                {checkingUpdate ? i.settings.checking : i.settings.checkForUpdate}
              </button>
            </div>

            {appUpdate && (
              <>
                <div className="divider" />
                {appUpdate.update_available ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <AlertCircle size={16} style={{ color: "var(--warning)" }} />
                      <span style={{ fontSize: 14, fontWeight: 500, color: "var(--warning)" }}>
                        {i.settings.updateAvailable}: v{appUpdate.latest_version}
                      </span>
                    </div>
                    {appUpdate.body && (
                      <p style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>{appUpdate.body}</p>
                    )}
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={handleInstallUpdate}
                      disabled={installing}
                      style={{ alignSelf: "flex-start", gap: 6 }}
                    >
                      <Download size={14} />
                      {installing ? i.settings.downloading : i.settings.installUpdate}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <CheckCircle size={16} style={{ color: "var(--success)" }} />
                    <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                      {appUpdate.not_configured
                        ? i.settings.updateNotConfigured
                        : i.settings.noUpdate}
                    </span>
                  </div>
                )}
              </>
            )}

            {updateError && (
              <>
                <div className="divider" />
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <AlertCircle size={16} style={{ color: "var(--error)" }} />
                  <span style={{ fontSize: 13, color: "var(--error)" }}>{i.settings.updateFailed}: {updateError}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Network Proxy */}
        <div className="section-card">
          <div className="section-card-title">
            <Wifi size={17} style={{ color: "var(--text-secondary)" }} />
            {loc === "zh" ? "网络代理" : "Network Proxy"}
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
            {loc === "zh"
              ? "设置 HTTP/HTTPS 代理地址，用于访问 GitHub 等外部服务。留空则使用系统默认网络。"
              : "Set HTTP/HTTPS proxy for accessing GitHub and external services. Leave empty for system default."}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="input"
              style={{ flex: 1, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}
              placeholder="http://127.0.0.1:7890"
              value={proxyUrl}
              onChange={(e) => setProxyUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (async () => {
                try {
                  await invoke("set_proxy", { proxyUrl });
                  setProxySaved(true);
                  setTimeout(() => setProxySaved(false), 2000);
                  showToast("success", loc === "zh" ? "代理已保存" : "Proxy saved");
                } catch (e) { showToast("error", String(e)); }
              })()}
            />
            <button className="btn btn-primary btn-sm" style={{ gap: 5 }}
              onClick={async () => {
                try {
                  await invoke("set_proxy", { proxyUrl });
                  setProxySaved(true);
                  setTimeout(() => setProxySaved(false), 2000);
                  showToast("success", loc === "zh" ? (proxyUrl.trim() ? "代理已设置" : "代理已清除") : (proxyUrl.trim() ? "Proxy set" : "Proxy cleared"));
                } catch (e) { showToast("error", String(e)); }
              }}>
              {proxySaved ? <Check size={13} style={{ color: "var(--success)" }} /> : <Check size={13} />}
              {loc === "zh" ? "保存" : "Save"}
            </button>
          </div>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
            {loc === "zh"
              ? "提示：也可以在 VPN 软件中开启 TUN 模式让所有流量走代理，无需在此设置。"
              : "Tip: You can also enable TUN mode in your VPN client to proxy all traffic without setting this."}
          </p>
        </div>

        {/* Backup & Restore */}
        <div className="section-card">
          <div className="section-card-title">
            <Archive size={17} style={{ color: "var(--text-secondary)" }} />
            {loc === "zh" ? "备份与恢复" : "Backup & Restore"}
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
            {loc === "zh"
              ? "导出所有工具配置和技能文件为一个备份文件，换电脑时一键导入恢复。"
              : "Export all tool configs and skills to a single backup file. Import to restore on any machine."}
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            <button className="btn btn-primary btn-sm" style={{ gap: 6 }}
              onClick={async () => {
                try {
                  const path = await invoke<string>("save_backup_to_file");
                  showToast("success", loc === "zh" ? `备份已保存到: ${path}` : `Backup saved to: ${path}`);
                } catch (e) {
                  if (String(e) !== "Cancelled") showToast("error", String(e));
                }
              }}>
              <Download size={14} />{loc === "zh" ? "导出备份" : "Export Backup"}
            </button>
            <button className="btn btn-secondary btn-sm" style={{ gap: 6 }}
              onClick={async () => {
                try {
                  const msg = await invoke<string>("import_backup_from_file");
                  showToast("success", msg);
                  loadToolsAndPaths();
                } catch (e) {
                  if (String(e) !== "Cancelled") showToast("error", String(e));
                }
              }}>
              <Upload size={14} />{loc === "zh" ? "导入备份" : "Import Backup"}
            </button>
          </div>
        </div>

        {/* About */}
        <div className="section-card">
          <div className="section-card-title">
            <Info size={17} style={{ color: "var(--text-secondary)" }} />
            {i.settings.about}
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>{i.settings.aboutDesc}</p>
          <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
            <span className="badge badge-muted">{i.app.version}</span>
            <span className="badge badge-muted">{i.settings.license}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

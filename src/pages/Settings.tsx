import { useState } from "react";
import { Globe, FolderOpen, Info, Palette, Sun, Moon, Download, RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
import { t, getLocale, setLocale, type Locale } from "../lib/i18n";
import { getTheme, setTheme, type Theme } from "../lib/theme";

interface AppUpdateState {
  update_available: boolean;
  latest_version: string | null;
  body: string | null;
  not_configured: boolean;
}

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
  const i = t();

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
    <div className="animate-in" style={{ maxWidth: 640 }}>
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

        {/* Paths */}
        <div className="section-card">
          <div className="section-card-title">
            <FolderOpen size={17} style={{ color: "var(--text-secondary)" }} />
            {i.settings.paths}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[
              [i.settings.claudeSettings, "~/.claude/settings.json"],
              [i.settings.pluginsDir, "~/.claude/plugins/"],
              [i.settings.cursorConfig, "~/.cursor/mcp.json"],
            ].map(([label, path]) => (
              <div key={path}>
                <span className="field-label">{label}</span>
                <div className="code-block" style={{ fontSize: 12 }}>{path}</div>
              </div>
            ))}
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

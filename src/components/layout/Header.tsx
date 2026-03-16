import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Bell, Sun, Moon, ArrowUpCircle } from "lucide-react";
import { getTheme, setTheme, type Theme } from "../../lib/theme";

export default function Header() {
  const [updateCount, setUpdateCount] = useState(0);
  const [appUpdateAvailable, setAppUpdateAvailable] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<Theme>(getTheme());

  useEffect(() => {
    invoke<unknown[]>("check_updates")
      .then((u) => setUpdateCount(u.length))
      .catch(() => {});

    import("@tauri-apps/plugin-updater")
      .then(({ check }) => check())
      .then((update) => setAppUpdateAvailable(!!update))
      .catch(() => {});
  }, []);

  function toggleTheme() {
    const next = currentTheme === "dark" ? "light" : "dark";
    setTheme(next);
    setCurrentTheme(next);
  }

  return (
    <header className="topbar">
      <button className="theme-btn" onClick={toggleTheme} title="Toggle theme">
        {currentTheme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      {updateCount > 0 && (
        <div className="badge badge-warning" style={{ gap: 6 }}>
          <Bell size={12} />
          <span>{updateCount}</span>
        </div>
      )}

      {appUpdateAvailable && (
        <div className="badge badge-accent" style={{ gap: 6 }} title="App update available">
          <ArrowUpCircle size={12} />
        </div>
      )}

      <div className="dot dot-active" title="Connected" />
    </header>
  );
}

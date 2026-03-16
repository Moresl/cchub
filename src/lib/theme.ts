export type Theme = "dark" | "light";

export function getTheme(): Theme {
  const saved = localStorage.getItem("cchub-theme") as Theme | null;
  return saved === "light" ? "light" : "dark";
}

export function setTheme(theme: Theme) {
  localStorage.setItem("cchub-theme", theme);
  applyTheme(theme);
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export function initTheme() {
  applyTheme(getTheme());
}

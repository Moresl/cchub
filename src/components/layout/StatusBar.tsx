export default function StatusBar() {
  return (
    <footer
      className="h-6 flex items-center px-4 text-xs border-t"
      style={{
        backgroundColor: "var(--color-surface)",
        borderColor: "var(--color-border)",
        color: "var(--color-text-secondary)",
      }}
    >
      <span>CCHub v0.1.0</span>
    </footer>
  );
}

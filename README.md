<div align="center">

<img src="app-icon.png" alt="CCHub" width="120" />

# CCHub

**Claude Code 全生态管理平台**

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-orange.svg)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-Backend-red.svg)](https://rust-lang.org)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev)

[English](#english) · [中文](#中文)

</div>

---

## 中文

### 简介

CCHub 是一个桌面应用程序，用于统一管理 Claude Code 的完整生态系统——MCP Servers、Skills、Plugins、Hooks，一站式搞定。

当前 Claude Code 生态爆炸式增长，但管理体验极度碎片化：手动编辑 JSON、手动复制文件、没有统一界面。CCHub 就是为了解决这个问题而生。

### 核心功能

- **MCP 服务管理** — 自动扫描所有已安装的 MCP Server（Claude Code 插件目录、Claude Desktop、Cursor），支持启用/禁用、编辑配置、一键删除
- **技能与插件管理** — 浏览已安装的 Skills 和 Plugins，查看触发命令、描述、文件路径
- **钩子管理** — 可视化查看所有 Hooks 配置，包括事件类型、匹配器、执行命令
- **更新中心** — 检查 MCP Server 和 Plugin 的可用更新，一键升级
- **深色/浅色主题** — 毛玻璃质感的精致 UI，支持主题切换
- **中英双语** — 默认中文界面，一键切换英文

### 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | **Tauri 2.0** — Rust 后端 + Web 前端，比 Electron 轻 10x |
| 前端 | **React 19 + TypeScript + Tailwind CSS 4** |
| 后端 | **Rust** — 高性能，单二进制分发 |
| 数据库 | **SQLite** (rusqlite) — 零依赖本地存储 |
| 构建 | **Vite 6 + pnpm** |

### 快速开始

#### 环境要求

- [Node.js](https://nodejs.org) >= 18
- [pnpm](https://pnpm.io) >= 8
- [Rust](https://rustup.rs) >= 1.70
- [Tauri 2.0 Prerequisites](https://v2.tauri.app/start/prerequisites/)

#### 安装运行

```bash
# 克隆仓库
git clone https://github.com/Moresl/cchub.git
cd cchub

# 安装依赖
pnpm install

# 开发模式
pnpm tauri dev

# 构建发布
pnpm tauri build
```

构建产物位于 `src-tauri/target/release/`：
- `cchub.exe` — 可执行文件 (~6MB)
- `bundle/msi/` — MSI 安装包
- `bundle/nsis/` — NSIS 安装包

### 扫描路径

CCHub 会自动扫描以下位置的 MCP Server 配置：

| 路径 | 说明 |
|---|---|
| `~/.claude/plugins/**/.mcp.json` | Claude Code 插件目录（递归） |
| `%APPDATA%/Claude/claude_desktop_config.json` | Claude Desktop 配置 |
| `~/.cursor/mcp.json` | Cursor 编辑器配置 |

### 截图

> 🚧 截图待补充

### 路线图

- [x] MCP Server 管理（扫描、启停、编辑、删除）
- [x] Skills & Plugins 浏览
- [x] Hooks 可视化
- [x] 版本更新检查
- [x] 深色/浅色主题
- [x] 中英文国际化
- [x] 市场浏览器（一键安装 MCP Server / Skill）
- [x] CLAUDE.md 管理器
- [x] MCP Server 健康监控
- [x] 安全审计（权限扫描、变更检测）
- [x] 自动更新 (Tauri Updater)

---

## English

### Introduction

CCHub is a desktop application for managing the complete Claude Code ecosystem — MCP Servers, Skills, Plugins, and Hooks — all in one place.

The Claude Code ecosystem is growing rapidly, but management is fragmented: manual JSON editing, manual file copying, no unified interface. CCHub is here to fix that.

### Features

- **MCP Server Management** — Auto-scan installed MCP Servers (Claude Code plugins, Claude Desktop, Cursor). Enable/disable, edit config, delete.
- **Skills & Plugins** — Browse installed Skills and Plugins with trigger commands, descriptions, and file paths.
- **Hooks Management** — Visualize all Hooks with event types, matchers, and commands.
- **Update Center** — Check for available updates, one-click upgrade.
- **Dark / Light Theme** — Glassmorphism UI with theme switching.
- **i18n** — Chinese (default) and English.

### Tech Stack

| Layer | Technology |
|---|---|
| Desktop Framework | **Tauri 2.0** — Rust backend + Web frontend, 10x lighter than Electron |
| Frontend | **React 19 + TypeScript + Tailwind CSS 4** |
| Backend | **Rust** — High performance, single binary distribution |
| Database | **SQLite** (rusqlite) — Zero-dependency local storage |
| Build | **Vite 6 + pnpm** |

### Getting Started

```bash
# Clone
git clone https://github.com/Moresl/cchub.git
cd cchub

# Install
pnpm install

# Dev
pnpm tauri dev

# Build
pnpm tauri build
```

### Roadmap

- [x] MCP Server management (scan, toggle, edit, delete)
- [x] Skills & Plugins browser
- [x] Hooks visualization
- [x] Update checking
- [x] Dark / Light theme
- [x] i18n (Chinese + English)
- [x] Marketplace (one-click install MCP Servers / Skills)
- [x] CLAUDE.md manager
- [x] MCP Server health monitoring
- [x] Security audit (permission scanning, change detection)
- [x] Auto-update (Tauri Updater)

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Tauri](https://tauri.app) — Lightweight desktop app framework
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) — AI coding assistant
- [MCP](https://modelcontextprotocol.io) — Model Context Protocol

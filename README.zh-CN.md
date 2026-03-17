<div align="center">

<img src="app-icon.png" alt="CCHub" width="120" />

# CCHub

**Claude Code 全生态管理平台**

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Latest Release](https://img.shields.io/github/v/release/Moresl/cchub?color=green)](https://github.com/Moresl/cchub/releases)
[![Downloads](https://img.shields.io/github/downloads/Moresl/cchub/total?color=blue)](https://github.com/Moresl/cchub/releases)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-orange.svg)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-Backend-red.svg)](https://rust-lang.org)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev)

中文 · [English](README.md)

**[下载最新版本](https://github.com/Moresl/cchub/releases/latest)**

</div>

---

## 简介

CCHub 是一个桌面应用程序，用于统一管理 Claude Code 的完整生态系统——MCP 服务、技能、插件、钩子、配置切换，一站式搞定。

当前 Claude Code 生态爆炸式增长，但管理体验极度碎片化：手动编辑配置文件、手动复制文件、没有统一界面。CCHub 就是为了解决这个问题而生。

## 截图

<!-- 在此添加截图 -->
<!-- ![MCP 服务管理](screenshots/mcp-management.png) -->
<!-- ![配置切换](screenshots/config-profiles.png) -->
<!-- ![暗色主题](screenshots/dark-theme.png) -->

> 截图即将上线，Star 关注获取最新动态！

## 核心功能

- **MCP 服务管理** — 自动扫描所有已安装的 MCP 服务（Claude Code、Claude 桌面版、Cursor），支持启用/禁用、编辑配置、一键删除
- **技能与插件管理** — 浏览已安装的技能和插件，查看触发命令、描述、文件路径
- **钩子管理** — 可视化查看所有钩子配置，包括事件类型、匹配器、执行命令
- **配置切换** — 在 Claude Code、Codex、Gemini CLI 等不同配置间一键切换，支持结构化编辑与预设模板，自动扫描本地已有配置
- **CLAUDE.md 管理器** — 可视化编辑项目指令文件
- **深色/浅色主题** — 毛玻璃质感的精致界面，支持主题切换
- **中英双语** — 默认中文界面，一键切换英文
- **自动更新** — 内置版本检查，一键安装更新

## 下载安装

| 文件 | 说明 |
|------|------|
| [安装版 EXE](https://github.com/Moresl/cchub/releases/latest) | **推荐** — NSIS 安装包，支持快捷方式和自动更新 |
| [MSI 安装版](https://github.com/Moresl/cchub/releases/latest) | Windows Installer 格式，适合企业部署 |
| [便携版](https://github.com/Moresl/cchub/releases/latest) | 免安装，双击即用，可放 U 盘随身携带 |

**系统要求：** Windows 10/11 (x64)，无需安装额外运行时。

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | **Tauri 2.0** — Rust 后端 + Web 前端，比 Electron 轻 10 倍 |
| 前端 | **React 19 + TypeScript + Tailwind CSS 4** |
| 后端 | **Rust** — 高性能，单文件分发 |
| 数据库 | **SQLite**（rusqlite）— 零依赖本地存储 |
| 构建工具 | **Vite 6 + pnpm** |

## 开发指南

### 环境要求

- [Node.js](https://nodejs.org) >= 18
- [pnpm](https://pnpm.io) >= 8
- [Rust](https://rustup.rs) >= 1.70
- [Tauri 2.0 前置依赖](https://v2.tauri.app/start/prerequisites/)

### 安装运行

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

## 扫描路径

CCHub 会自动扫描以下位置的 MCP 服务配置：

| 路径 | 说明 |
|---|---|
| `~/.claude/plugins/**/.mcp.json` | Claude Code 插件目录（递归） |
| `%APPDATA%/Claude/claude_desktop_config.json` | Claude 桌面版配置 |
| `~/.cursor/mcp.json` | Cursor 编辑器配置 |

## 路线图

- [x] MCP 服务管理（扫描、启停、编辑、删除）
- [x] 技能与插件浏览
- [x] 钩子可视化
- [x] 配置切换（多配置管理）
- [x] CLAUDE.md 管理器
- [x] MCP 服务健康监控
- [x] 安全审计（权限扫描、变更检测）
- [x] 自动更新
- [x] 深色/浅色主题
- [x] 中英文国际化
- [ ] macOS / Linux 支持
- [ ] MCP 服务市场
- [ ] 备份与恢复

---

## 参与贡献

欢迎提交 Pull Request！

1. Fork 本仓库
2. 创建功能分支（`git checkout -b feature/amazing-feature`）
3. 提交更改（`git commit -m '添加新功能'`）
4. 推送分支（`git push origin feature/amazing-feature`）
5. 发起 Pull Request

## Star 趋势

[![Star History Chart](https://api.star-history.com/svg?repos=Moresl/cchub&type=Date)](https://star-history.com/#Moresl/cchub&Date)

## 许可证

本项目采用 MIT 许可证 — 详见 [LICENSE](LICENSE) 文件。

## 致谢

- [Tauri](https://tauri.app) — 轻量级桌面应用框架
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) — AI 编程助手
- [MCP](https://modelcontextprotocol.io) — 模型上下文协议

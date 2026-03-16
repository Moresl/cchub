export interface DetectedTool {
  id: string;       // "claude" | "cursor" | "windsurf" | "codex"
  name: string;     // "Claude Code"
  config_path: string;
  skills_dir: string;
  installed: boolean;
}

export interface FolderNode {
  name: string;
  path: string;
  is_dir: boolean;
  children: FolderNode[];
}

export interface CategoryCounts {
  skills: number;
  prompts: number;
  commands: number;
  plugins: number;
  total: number;
}

export type SkillCategory = "all" | "skill" | "prompt" | "command" | "plugin";

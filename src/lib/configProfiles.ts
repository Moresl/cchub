export type StructuredConfigTool = "claude" | "codex" | "gemini";
export type ClaudeAuthField = "ANTHROPIC_AUTH_TOKEN" | "ANTHROPIC_API_KEY";

export interface ConfigPreset {
  id: string;
  toolId: StructuredConfigTool;
  name: string;
  baseUrl: string;
  model: string;
  authField?: ClaudeAuthField;
}

export interface StructuredDraftFields {
  presetId: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  authField: ClaudeAuthField;
}

const PRESETS: Record<StructuredConfigTool, ConfigPreset[]> = {
  claude: [
    {
      id: "claude-official",
      toolId: "claude",
      name: "官方",
      baseUrl: "https://api.anthropic.com",
      model: "claude-sonnet-4-5",
      authField: "ANTHROPIC_AUTH_TOKEN",
    },
    {
      id: "claude-compatible",
      toolId: "claude",
      name: "兼容服务",
      baseUrl: "https://api.example.com",
      model: "claude-sonnet-4-5",
      authField: "ANTHROPIC_AUTH_TOKEN",
    },
  ],
  codex: [
    {
      id: "codex-official",
      toolId: "codex",
      name: "官方",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-5.3-codex",
    },
    {
      id: "codex-compatible",
      toolId: "codex",
      name: "OpenAI 兼容",
      baseUrl: "https://api.example.com/v1",
      model: "gpt-5.3-codex",
    },
    {
      id: "codex-azure",
      toolId: "codex",
      name: "Azure OpenAI",
      baseUrl: "https://YOUR_RESOURCE_NAME.openai.azure.com/openai",
      model: "gpt-5.3-codex",
    },
  ],
  gemini: [
    {
      id: "gemini-official",
      toolId: "gemini",
      name: "官方",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
      model: "gemini-2.5-pro",
    },
    {
      id: "gemini-compatible",
      toolId: "gemini",
      name: "兼容服务",
      baseUrl: "https://api.example.com",
      model: "gemini-2.5-pro",
    },
  ],
};

function findTomlValue(content: string, key: string) {
  const pattern = new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, "m");
  return content.match(pattern)?.[1] || "";
}

export function supportsStructuredConfig(toolId: string): toolId is StructuredConfigTool {
  return toolId === "claude" || toolId === "codex" || toolId === "gemini";
}

export function getConfigPresets(toolId: string): ConfigPreset[] {
  if (!supportsStructuredConfig(toolId)) return [];
  return PRESETS[toolId];
}

export function createDefaultStructuredFields(toolId: string): StructuredDraftFields {
  const preset = getConfigPresets(toolId)[0];
  return {
    presetId: preset?.id || "custom",
    baseUrl: preset?.baseUrl || "",
    apiKey: "",
    model: preset?.model || "",
    authField: preset?.authField || "ANTHROPIC_AUTH_TOKEN",
  };
}

export function applyPresetToFields(
  toolId: string,
  presetId: string,
  current?: Partial<StructuredDraftFields>,
): StructuredDraftFields {
  const preset = getConfigPresets(toolId).find((item) => item.id === presetId);
  if (!preset) {
    return {
      presetId,
      baseUrl: current?.baseUrl || "",
      apiKey: current?.apiKey || "",
      model: current?.model || "",
      authField: current?.authField || "ANTHROPIC_AUTH_TOKEN",
    };
  }

  return {
    presetId,
    baseUrl: preset.baseUrl,
    apiKey: current?.apiKey || "",
    model: preset.model,
    authField: preset.authField || current?.authField || "ANTHROPIC_AUTH_TOKEN",
  };
}

export function buildStructuredConfig(toolId: string, fields: StructuredDraftFields): string {
  if (toolId === "claude") {
    const env: Record<string, string> = {};
    if (fields.apiKey.trim()) {
      env[fields.authField] = fields.apiKey.trim();
    }
    if (fields.baseUrl.trim()) {
      env.ANTHROPIC_BASE_URL = fields.baseUrl.trim();
    }
    if (fields.model.trim()) {
      env.ANTHROPIC_MODEL = fields.model.trim();
      env.ANTHROPIC_REASONING_MODEL = fields.model.trim();
      env.ANTHROPIC_DEFAULT_HAIKU_MODEL = fields.model.trim();
      env.ANTHROPIC_DEFAULT_SONNET_MODEL = fields.model.trim();
      env.ANTHROPIC_DEFAULT_OPUS_MODEL = fields.model.trim();
    }
    return JSON.stringify({ env }, null, 2);
  }

  if (toolId === "codex") {
    const providerName = "custom";
    const config = [
      `model_provider = "${providerName}"`,
      `model = "${fields.model.trim() || "gpt-5.3-codex"}"`,
      'model_reasoning_effort = "high"',
      "disable_response_storage = true",
      "",
      `[model_providers.${providerName}]`,
      `name = "${providerName}"`,
      `base_url = "${fields.baseUrl.trim()}"`,
      'wire_api = "responses"',
      "requires_openai_auth = true",
    ].join("\n");

    return JSON.stringify(
      {
        auth: {
          OPENAI_API_KEY: fields.apiKey.trim(),
        },
        config,
      },
      null,
      2,
    );
  }

  return JSON.stringify(
    {
      env: {
        GOOGLE_GEMINI_BASE_URL: fields.baseUrl.trim(),
        GEMINI_API_KEY: fields.apiKey.trim(),
        GEMINI_MODEL: fields.model.trim() || "gemini-2.5-pro",
      },
      config: {},
    },
    null,
    2,
  );
}

export function parseStructuredConfig(toolId: string, content: string): StructuredDraftFields {
  const defaults = createDefaultStructuredFields(toolId);

  try {
    const parsed = JSON.parse(content) as Record<string, any>;

    if (toolId === "claude") {
      const env = (parsed.env || {}) as Record<string, string>;
      const authField = env.ANTHROPIC_API_KEY ? "ANTHROPIC_API_KEY" : "ANTHROPIC_AUTH_TOKEN";
      return {
        ...defaults,
        baseUrl: env.ANTHROPIC_BASE_URL || defaults.baseUrl,
        apiKey: env[authField] || "",
        model:
          env.ANTHROPIC_MODEL ||
          env.ANTHROPIC_DEFAULT_SONNET_MODEL ||
          env.ANTHROPIC_DEFAULT_OPUS_MODEL ||
          env.ANTHROPIC_DEFAULT_HAIKU_MODEL ||
          defaults.model,
        authField,
      };
    }

    if (toolId === "codex") {
      const auth = (parsed.auth || {}) as Record<string, string>;
      const config = typeof parsed.config === "string" ? parsed.config : "";
      return {
        ...defaults,
        apiKey: auth.OPENAI_API_KEY || "",
        baseUrl: findTomlValue(config, "base_url") || defaults.baseUrl,
        model: findTomlValue(config, "model") || defaults.model,
      };
    }

    const env = (parsed.env || {}) as Record<string, string>;
    return {
      ...defaults,
      baseUrl: env.GOOGLE_GEMINI_BASE_URL || defaults.baseUrl,
      apiKey: env.GEMINI_API_KEY || "",
      model: env.GEMINI_MODEL || defaults.model,
    };
  } catch {
    return defaults;
  }
}

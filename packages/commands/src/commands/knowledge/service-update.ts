import { readFileSync } from "node:fs";
import {
  defineCommand,
  ragEndpoint,
  RAG_PATHS,
  detectOutputFormat,
  BailianError,
  ExitCode,
  type Client,
  type FlagsDef,
  type RagAgentConfig,
  type RagAgentGetResponse,
  type RagAgentMutationResponse,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { resolveWorkspaceId, WORKSPACE_FLAG } from "./shared.ts";

const BOOL_CHOICES = ["true", "false"];

const SERVICE_UPDATE_FLAGS = {
  agentId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Service (agent) ID", "zh-CN": "服务（Agent）ID" },
    required: true,
  },
  name: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "New service name (up to 200 chars)",
      "zh-CN": "新服务名称（最多 200 个字符）",
    },
  },
  description: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "New service description (up to 1000 chars)",
      "zh-CN": "新服务描述（最多 1000 个字符）",
    },
  },
  agentVersion: {
    type: "string",
    valueHint: "<version>",
    description: {
      "en-US":
        "Target version (default: beta draft). Published versions only accept --version-desc",
      "zh-CN": "目标版本（默认：beta 草稿）。已发布版本只接受 --version-desc",
    },
  },
  versionDesc: {
    type: "string",
    valueHint: "<text>",
    description: { "en-US": "Version description", "zh-CN": "版本描述" },
  },
  policy: {
    type: "string",
    valueHint: "<policy>",
    description: {
      "en-US": "Agent policy: turbo (fast) or agentic (multi-turn)",
      "zh-CN": "Agent 策略：turbo（快速）或 agentic（多轮）",
    },
  },
  model: {
    type: "string",
    valueHint: "<name>",
    description: {
      "en-US": "Generation model code (must be in the platform allowlist)",
      "zh-CN": "生成模型代码（必须在平台白名单中）",
    },
  },
  temperature: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Sampling temperature, range 0-2", "zh-CN": "采样温度，范围 0–2" },
  },
  maxLlmCalls: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Max LLM calls per request, range 1-30",
      "zh-CN": "每次请求最大 LLM 调用次数，范围 1–30",
    },
  },
  enableSessionFile: {
    type: "string",
    valueHint: "<bool>",
    description: {
      "en-US": "Enable session files: true or false",
      "zh-CN": "启用会话文件：true 或 false",
    },
  },
  enableRefusal: {
    type: "string",
    valueHint: "<bool>",
    description: {
      "en-US": "Enable refusal answers: true or false",
      "zh-CN": "启用拒答：true 或 false",
    },
  },
  enableAntiLeak: {
    type: "string",
    valueHint: "<bool>",
    description: {
      "en-US": "Enable anti prompt-leak: true or false",
      "zh-CN": "启用防提示词泄露：true 或 false",
    },
  },
  enableRichText: {
    type: "string",
    valueHint: "<bool>",
    description: {
      "en-US": "Enable rich text output: true or false",
      "zh-CN": "启用富文本输出：true 或 false",
    },
  },
  enableCitation: {
    type: "string",
    valueHint: "<bool>",
    description: { "en-US": "Enable citations: true or false", "zh-CN": "启用引用：true 或 false" },
  },
  configFile: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US":
        "JSON file replacing the whole agent_config (for nested settings like kb_search_configs); mutually exclusive with scalar config flags",
      "zh-CN":
        "替换整个 agent_config 的 JSON 文件（用于 kb_search_configs 等嵌套设置）；不能与标量配置选项同时使用",
    },
  },
  ...WORKSPACE_FLAG,
} satisfies FlagsDef;

type UpdateFlags = {
  policy?: string;
  model?: string;
  temperature?: number;
  maxLlmCalls?: number;
  enableSessionFile?: string;
  enableRefusal?: string;
  enableAntiLeak?: string;
  enableRichText?: string;
  enableCitation?: string;
};

/** Scalar config flag → agent_config field mapping (centralized for validation and merge) */
function collectScalarConfig(flags: UpdateFlags): Partial<RagAgentConfig> {
  const scalar: Partial<RagAgentConfig> = {};
  if (flags.policy !== undefined) scalar.agent_policy = flags.policy;
  if (flags.model !== undefined) scalar.agent_model = flags.model;
  if (flags.temperature !== undefined) scalar.temperature = flags.temperature;
  if (flags.maxLlmCalls !== undefined) scalar.max_num_llm_calls = flags.maxLlmCalls;
  if (flags.enableSessionFile !== undefined) scalar.enable_session_file = flags.enableSessionFile;
  if (flags.enableRefusal !== undefined) scalar.enable_refusal = flags.enableRefusal;
  if (flags.enableAntiLeak !== undefined) scalar.enable_anti_leak = flags.enableAntiLeak;
  if (flags.enableRichText !== undefined) scalar.enable_rich_text = flags.enableRichText;
  if (flags.enableCitation !== undefined) scalar.enable_citation = flags.enableCitation;
  return scalar;
}

/** --config-file: read JSON + structural/enum/range validation; unknown fields warn but pass through */
export function parseConfigFile(filePath: string): RagAgentConfig {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (error) {
    const errno = (error as { code?: string }).code ?? "unknown";
    throw new BailianError(
      `Cannot read config file: ${filePath}`,
      ExitCode.GENERAL,
      `File system error (${errno}) — check the path and permissions.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BailianError("--config-file must contain valid JSON.", ExitCode.USAGE);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new BailianError("--config-file must contain a JSON object.", ExitCode.USAGE);
  }
  const config = parsed as RagAgentConfig;
  validateConfigValues(config);
  return config;
}

const KNOWN_CONFIG_KEYS = new Set([
  "agent_policy",
  "agent_model",
  "enable_session_file",
  "enable_refusal",
  "enable_anti_leak",
  "enable_rich_text",
  "enable_citation",
  "temperature",
  "max_num_llm_calls",
  "max_completion_tokens",
  "session_file_max_parse_length",
  "enable_kb_router",
  "kb_router_model",
  "rerank_top_n",
  "hybrid_rerank",
  "kb_search_configs",
]);

/** Enum/range validation + behavioral warnings, per the agent_config contract */
export function validateConfigValues(config: RagAgentConfig): void {
  if (config.agent_policy !== undefined && !["turbo", "agentic"].includes(config.agent_policy)) {
    throw new BailianError("agent_policy must be turbo or agentic", ExitCode.USAGE);
  }
  if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 2)) {
    throw new BailianError("temperature must be between 0 and 2", ExitCode.USAGE);
  }
  if (
    config.max_num_llm_calls !== undefined &&
    (config.max_num_llm_calls < 1 || config.max_num_llm_calls > 30)
  ) {
    throw new BailianError("max_num_llm_calls must be between 1 and 30", ExitCode.USAGE);
  }
  if (config.rerank_top_n !== undefined && (config.rerank_top_n < 1 || config.rerank_top_n > 20)) {
    throw new BailianError("rerank_top_n must be between 1 and 20", ExitCode.USAGE);
  }
  // Behavioral warning: the server clears rerank_instruct unless rerank_mode is custom
  for (const kbConfig of config.kb_search_configs ?? []) {
    const rerank = kbConfig.rerank as
      | { rerank_mode?: string; rerank_instruct?: string }
      | undefined;
    if (rerank?.rerank_instruct && rerank.rerank_mode !== "custom") {
      process.stderr.write(
        "Warning: rerank_instruct is only effective with rerank_mode=custom; the server clears it otherwise.\n",
      );
    }
  }
  // Unknown fields: warn but pass through (the server is the source of truth)
  for (const key of Object.keys(config)) {
    if (!KNOWN_CONFIG_KEYS.has(key)) {
      process.stderr.write(`Warning: unknown agent_config field passed through: ${key}\n`);
    }
  }
}

/** read-merge-write: fetch the full beta-draft config and merge scalar changes (the API has whole-replace semantics) */
async function fetchBetaConfig(
  client: Client,
  workspaceId: string,
  agentId: string,
): Promise<RagAgentConfig> {
  const response = await client.requestJson<RagAgentGetResponse>({
    path: ragEndpoint(workspaceId, RAG_PATHS.agentGet),
    method: "POST",
    body: { agent_id: agentId, agent_version: "beta" },
  });
  const betaDetail = (response.data?.agent_details ?? []).find(
    (detail) => detail.agent_version === "beta",
  );
  return betaDetail?.agent_config ?? {};
}

export default defineCommand({
  description: {
    "en-US": "Update service name, description or draft configuration",
    "zh-CN": "更新服务名称、描述或草稿配置",
  },
  auth: "apiKey",
  usageArgs: "--agent-id <id> [flags]",
  flags: SERVICE_UPDATE_FLAGS,
  notes: [
    {
      "en-US":
        "Configuration changes only apply to the beta draft; published versions accept --version-desc only.",
      "zh-CN": "配置修改只应用于 beta 草稿；已发布版本只接受 --version-desc。",
    },
    {
      "en-US":
        "To change the configuration of a published version, first update the beta draft (this command without --agent-version or with --agent-version beta), then run service deploy to publish a new version.",
      "zh-CN":
        "要修改已发布版本的配置，请先更新 beta 草稿（不传 --agent-version，或传 --agent-version beta），然后运行 service deploy 发布新版本。",
    },
    {
      "en-US":
        "Scalar config flags merge into the current draft config (read-merge-write); --config-file replaces the whole config and is mutually exclusive with them.",
      "zh-CN":
        "标量配置选项会合并到当前草稿配置（读取-合并-写入）；--config-file 会替换整个配置，且不能与标量配置选项同时使用。",
    },
    {
      "en-US":
        "After updating the draft, verify with --agent-version beta on search/chat, then deploy.",
      "zh-CN": "更新草稿后，先在 search/chat 命令中使用 --agent-version beta 验证，再部署。",
    },
    {
      "en-US": "Requires the knowledge-base modify permission in the workspace.",
      "zh-CN": "需要 Workspace 中的知识库修改权限。",
    },
  ],
  // Note on `agent_version` in the request body: this is the agent-management
  // domain's "target version" parameter (beta draft or a published version
  // number). It is NOT the search/chat debug-draft field that the project-wide
  // agent_version cleanup removes — the two share a name but live in different
  // API surfaces and have different semantics.
  exampleArgs: [
    "--agent-id aid-xxx --temperature 0.7 --workspace-id ws-xxx",
    "--agent-id aid-xxx --config-file ./agent-config.json",
    {
      "en-US": "--agent-id aid-xxx --agent-version 1 --version-desc 'first stable release'",
      "zh-CN": "--agent-id aid-xxx --agent-version 1 --version-desc '首个稳定版本'",
    },
  ],
  validate(flags) {
    const scalarTouched = Object.keys(collectScalarConfig(flags)).length > 0;
    const anyChange =
      flags.name !== undefined ||
      flags.description !== undefined ||
      flags.versionDesc !== undefined ||
      flags.configFile !== undefined ||
      scalarTouched;
    if (!anyChange)
      return "Nothing to update — pass a name/description/version-desc or config flags";
    if (flags.configFile !== undefined && scalarTouched) {
      return "--config-file is mutually exclusive with scalar config flags";
    }
    // Version check up front: published version + config change → USAGE (the server
    // would also reject it, but failing early is faster)
    const publishedVersion = flags.agentVersion !== undefined && flags.agentVersion !== "beta";
    if (publishedVersion && (scalarTouched || flags.configFile !== undefined)) {
      return "Published versions only accept --version-desc; update the beta draft to change config";
    }
    if (flags.name !== undefined && flags.name.length > 200) {
      return "--name must be at most 200 characters";
    }
    if (flags.description !== undefined && flags.description.length > 1000) {
      return "--description must be at most 1000 characters";
    }
    if (flags.policy !== undefined && !["turbo", "agentic"].includes(flags.policy)) {
      return "--policy must be turbo or agentic";
    }
    if (flags.temperature !== undefined && (flags.temperature < 0 || flags.temperature > 2)) {
      return "--temperature must be between 0 and 2";
    }
    if (flags.maxLlmCalls !== undefined && (flags.maxLlmCalls < 1 || flags.maxLlmCalls > 30)) {
      return "--max-llm-calls must be between 1 and 30";
    }
    for (const [flagName, value] of [
      ["--enable-session-file", flags.enableSessionFile],
      ["--enable-refusal", flags.enableRefusal],
      ["--enable-anti-leak", flags.enableAntiLeak],
      ["--enable-rich-text", flags.enableRichText],
      ["--enable-citation", flags.enableCitation],
    ] as const) {
      if (value !== undefined && !BOOL_CHOICES.includes(value)) {
        return `${flagName} must be true or false`;
      }
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const workspaceId = resolveWorkspaceId(ctx);
    const format = detectOutputFormat(settings.output);

    const scalarConfig = collectScalarConfig(flags);
    const hasConfigChange = flags.configFile !== undefined || Object.keys(scalarConfig).length > 0;

    let agentConfig: RagAgentConfig | undefined;
    if (flags.configFile !== undefined) {
      // dry-run also reads the file and validates (rehearsal semantics)
      agentConfig = parseConfigFile(flags.configFile);
    } else if (Object.keys(scalarConfig).length > 0) {
      if (settings.dryRun) {
        // dry-run does not issue the read-merge request; show the scalar delta with a placeholder note
        agentConfig = { ...scalarConfig };
      } else {
        // The API has whole-replace semantics — read the full beta config first,
        // then merge (hidden from the user)
        const currentConfig = await fetchBetaConfig(ctx.client, workspaceId, flags.agentId);
        agentConfig = { ...currentConfig, ...scalarConfig };
        validateConfigValues(agentConfig);
      }
    }

    const body = {
      agent_id: flags.agentId,
      ...(flags.name !== undefined ? { agent_name: flags.name } : {}),
      ...(flags.description !== undefined ? { agent_desc: flags.description } : {}),
      ...(flags.agentVersion !== undefined ? { agent_version: flags.agentVersion } : {}),
      ...(flags.versionDesc !== undefined ? { agent_version_desc: flags.versionDesc } : {}),
      ...(agentConfig !== undefined ? { agent_config: agentConfig } : {}),
    };
    const endpoint = ragEndpoint(workspaceId, RAG_PATHS.agentUpdate);

    if (settings.dryRun) {
      emitResult(
        {
          endpoint,
          request: body,
          ...(hasConfigChange && flags.configFile === undefined
            ? { note: "scalar config flags are merged into the current beta config at run time" }
            : {}),
        },
        format,
      );
      return;
    }

    const response = await ctx.client.requestJson<RagAgentMutationResponse>({
      path: endpoint,
      method: "POST",
      body,
    });

    if (settings.quiet) return;
    if (format === "text") {
      emitBare(`updated: ${flags.agentId}`);
      if (hasConfigChange) {
        emitBare("Draft config changed — verify with --agent-version beta, then deploy.");
      }
      return;
    }
    emitResult(response, format);
  },
});

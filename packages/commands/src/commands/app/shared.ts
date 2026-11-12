import { readFile } from "node:fs/promises";
import {
  BailianError,
  ExitCode,
  UsageError,
  effectiveConsoleGatewayConfig,
  unwrapConsoleResponse,
  type Client,
  type FlagsDef,
  type Settings,
} from "bailian-cli-core";

// ---------------------------------------------------------------------------
// Console control-plane API names (mirrors the app-center assistant/workflow
// pages in bailian-agent-infra/apps/app-flow-agents).
// app-control.* / app-data.* wrap the payload in { reqDTO }; app-orchestra-flow.*
// takes the payload as-is.
// ---------------------------------------------------------------------------

export const APP_CONTROL_CREATE_API = "zeldaEasy.broadscope-bailian.app-control.create";
export const APP_CONTROL_UPDATE_API = "zeldaEasy.broadscope-bailian.app-control.update";
export const APP_CONTROL_PUBLISH_API = "zeldaEasy.broadscope-bailian.app-control.publish";
export const APP_CONTROL_DELETE_API = "zeldaEasy.broadscope-bailian.app-control.delete";
export const APP_CONTROL_COPY_API = "zeldaEasy.broadscope-bailian.app-control.copy";
export const APP_CONTROL_DETAIL_API = "zeldaEasy.broadscope-bailian.app-control.detail";
export const APP_CONTROL_LIST_API = "zeldaEasy.broadscope-bailian.app-control.list";
export const APP_CONTROL_VERSION_LIST_API =
  "zeldaEasy.broadscope-bailian.app-control.getAgentVersionList";
export const APP_CONTROL_VERSION_GET_API =
  "zeldaEasy.broadscope-bailian.app-control.getAgentVersion";

export const APP_DATA_CREATE_DRAFT_API = "zeldaEasy.broadscope-bailian.app-data.createAppDraft";
export const APP_DATA_UPDATE_DRAFT_API = "zeldaEasy.broadscope-bailian.app-data.updateAppDraft";
export const APP_DATA_GET_API = "zeldaEasy.broadscope-bailian.app-data.get";

export const FLOW_GET_CONFIG_API = "zeldaEasy.broadscope-bailian.app-orchestra-flow.getConfig";
export const FLOW_SAVE_API = "zeldaEasy.broadscope-bailian.app-orchestra-flow.save";
export const FLOW_PUBLISH_API = "zeldaEasy.broadscope-bailian.app-orchestra-flow.publish";
export const FLOW_VERSION_LIST_API =
  "zeldaEasy.broadscope-bailian.app-orchestra-flow.getFlowVersionConfig";
export const FLOW_VERSION_GET_API =
  "zeldaEasy.broadscope-bailian.app-orchestra-flow.getFlowVersion";
export const FLOW_EXPORT_DSL_API =
  "zeldaEasy.broadscope-bailian.app-orchestra-flow.generateDSLSchema";

/** Application type enum on the wire (ApplicationTypeEnum). */
export const APP_TYPE_AGENT = 5;
export const APP_TYPE_WORKFLOW = 7;
/** CCAI app type, excluded from both list pages. */
export const APP_TYPE_CCAI = 10;
/** High-code app type, excluded from the workflow list page. */
export const APP_TYPE_HIGH_CODE = 8;

// ---------------------------------------------------------------------------
// Shared flags
// ---------------------------------------------------------------------------

export const APP_ID_FLAG = {
  appId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Application ID (app code, required)",
      "zh-CN": "应用 ID（应用 code，必填）",
    },
    required: true,
  },
} satisfies FlagsDef;

export const APP_TYPE_FLAG = {
  type: {
    type: "string",
    valueHint: "<type>",
    choices: ["agent", "workflow"] as const,
    description: {
      "en-US": "Application type: agent (default), workflow",
      "zh-CN": "应用类型：agent（默认）、workflow",
    },
  },
} satisfies FlagsDef;

export const SCOPE_FLAG = {
  scope: {
    type: "string",
    valueHint: "<scope>",
    choices: ["draft", "publish"] as const,
    description: {
      "en-US": "Data scope: draft (default), publish",
      "zh-CN": "数据范围：draft（默认）、publish",
    },
  },
} satisfies FlagsDef;

export const CONFIG_FLAGS = {
  configJson: {
    type: "string",
    valueHint: "<json>",
    description: {
      "en-US": "Config JSON string (mutually exclusive with --config-file)",
      "zh-CN": "配置 JSON 字符串（与 --config-file 互斥）",
    },
  },
  configFile: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Path to a config JSON file (mutually exclusive with --config-json)",
      "zh-CN": "配置 JSON 文件路径（与 --config-json 互斥）",
    },
  },
} satisfies FlagsDef;

export type AppType = "agent" | "workflow";

export function resolveAppType(flags: { type?: AppType }): AppType {
  return flags.type ?? "agent";
}

// ---------------------------------------------------------------------------
// Config JSON input (--config / --config-file)
// ---------------------------------------------------------------------------

/** Cross-flag validation for the mutually exclusive config inputs. */
export function validateConfigFlags(flags: {
  configJson?: string;
  configFile?: string;
}): { "en-US": string; "zh-CN": string } | undefined {
  if (flags.configJson !== undefined && flags.configFile !== undefined) {
    return {
      "en-US": "--config-json and --config-file are mutually exclusive",
      "zh-CN": "--config-json 与 --config-file 互斥，只能提供其中一个",
    };
  }
  return undefined;
}

function fileReadHint(error: NodeJS.ErrnoException, filePath: string): string {
  switch (error.code) {
    case "ENOENT":
      return `Config file not found: ${filePath}`;
    case "EACCES":
      return `Permission denied reading config file: ${filePath}`;
    case "EISDIR":
      return `Config file path is a directory: ${filePath}`;
    default:
      return `Cannot read config file: ${filePath} (${error.code ?? error.message})`;
  }
}

/**
 * Read the config JSON object from --config-json or --config-file.
 * Returns undefined when neither is provided. Invalid JSON or a non-object
 * payload is a usage error; file I/O failures keep their errno-specific hint.
 */
export async function readConfigJson(flags: {
  configJson?: string;
  configFile?: string;
}): Promise<Record<string, unknown> | undefined> {
  const conflict = validateConfigFlags(flags);
  if (conflict) throw new UsageError(conflict["en-US"]);

  let raw: string | undefined;
  if (flags.configJson !== undefined) {
    raw = flags.configJson;
  } else if (flags.configFile !== undefined) {
    const filePath = flags.configFile;
    raw = await readFile(filePath, "utf-8").catch((error: NodeJS.ErrnoException) => {
      throw new BailianError(
        `Cannot read config file: ${filePath}`,
        ExitCode.GENERAL,
        fileReadHint(error, filePath),
      );
    });
  }
  if (raw === undefined) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new UsageError("--config-json/--config-file must contain valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new UsageError("--config-json/--config-file JSON must be an object");
  }
  return parsed as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Console call helpers
// ---------------------------------------------------------------------------

/** Call a console API and unwrap the known protocol envelope. */
export async function consoleCall(
  client: Client,
  api: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  const raw = await client.console(api, data);
  return unwrapConsoleResponse(raw);
}

/** Uniform dry-run preview for console write commands (matches `console call`). */
export function consoleDryRunPreview(
  settings: Settings,
  api: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  return { api, data, ...effectiveConsoleGatewayConfig(settings) };
}

/** Create/copy responses carry the new app code as a string or { result }. */
export function extractAppCode(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload;
  if (typeof payload === "object" && payload !== null) {
    const result = (payload as Record<string, unknown>).result;
    if (typeof result === "string" && result.trim()) return result;
  }
  return undefined;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// ---------------------------------------------------------------------------
// Workflow canvas helpers
// ---------------------------------------------------------------------------

export interface WorkflowCanvas {
  config: string;
  version: string;
  applicationDTO?: Record<string, unknown>;
}

/** Read the current draft canvas (config JSON string + optimistic-lock version). */
export async function fetchWorkflowCanvas(
  client: Client,
  appCode: string,
): Promise<WorkflowCanvas> {
  const payload = asRecord(await consoleCall(client, FLOW_GET_CONFIG_API, { appCode }));
  const config = payload.config;
  const version = payload.version;
  if (typeof config !== "string" || typeof version !== "string" || !version) {
    throw new BailianError(
      "Console returned no workflow canvas config/version.",
      ExitCode.GENERAL,
      "Check the app ID with `app get --type workflow`, or pass --version explicitly.",
    );
  }
  return {
    config,
    version,
    applicationDTO: asRecord(payload.applicationDTO),
  };
}

/**
 * Normalize a trigger list the way the workflow editor does before publish:
 * drop "none" triggers (uiConfig.type or the legacy __triggerType parameter)
 * and strip the UI-only uiConfig field.
 */
export function normalizeTriggerList(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return [];
  const triggers: Record<string, unknown>[] = [];
  for (const entry of raw) {
    const trigger = asRecord(entry);
    let uiConfig: Record<string, unknown> = {};
    if (typeof trigger.uiConfig === "string") {
      try {
        uiConfig = asRecord(JSON.parse(trigger.uiConfig));
      } catch {
        uiConfig = {};
      }
    }
    if (uiConfig.type === "none") continue;
    const parameters = Array.isArray(trigger.parameters) ? trigger.parameters : [];
    const triggerTypeParam = parameters.find(
      (param) => asRecord(param).parameterKey === "__triggerType",
    );
    if (asRecord(triggerTypeParam).parameterValue === "none") continue;
    const { uiConfig: _uiConfig, ...rest } = trigger;
    triggers.push(rest);
  }
  return triggers;
}

/** Fallback: read triggers from the canvas Start node (mirrors the editor). */
export function triggersFromCanvas(config: string): unknown[] {
  try {
    const canvas = asRecord(JSON.parse(config));
    const nodes = Array.isArray(canvas.nodes) ? canvas.nodes : [];
    const startNode = nodes.find((node) => asRecord(node).type === "Start");
    const nodeParam = asRecord(asRecord(startNode).config).nodeParam;
    const triggerList = asRecord(nodeParam).triggerList;
    return Array.isArray(triggerList) ? triggerList : [];
  } catch {
    return [];
  }
}

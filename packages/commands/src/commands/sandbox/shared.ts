import { readFile } from "node:fs/promises";
import { BailianError, ExitCode, type FlagsDef, type LocalizedText } from "bailian-cli-core";

export const WORKSPACE_FLAG = {
  workspaceId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Workspace ID for the Sandbox endpoint (or set BAILIAN_WORKSPACE_ID)",
      "zh-CN": "Sandbox Endpoint 使用的 Workspace ID（也可设置 BAILIAN_WORKSPACE_ID）",
    },
  },
} satisfies FlagsDef;

export const BODY_FLAG = {
  body: {
    type: "string",
    valueHint: "<json|@path>",
    description: {
      "en-US": "JSON request body, inline or loaded from an @file path; explicit flags override it",
      "zh-CN": "JSON 请求体，可内联或从 @文件路径读取；显式 Flag 优先",
    },
  },
} satisfies FlagsDef;

export const INSTANCE_TIMEOUT_FLAG = {
  instanceTimeout: {
    type: "number",
    valueHint: "<seconds>",
    description: {
      "en-US": "Sandbox lifetime after this operation (300-604800 seconds)",
      "zh-CN": "本次操作后的 Sandbox 存活时间（300–604800 秒）",
    },
  },
} satisfies FlagsDef;

export const SHOW_CREDENTIALS_FLAG = {
  showCredentials: {
    type: "switch",
    description: {
      "en-US": "Print envd and traffic access tokens instead of redacting them",
      "zh-CN": "输出 envd 与流量访问 Token 原值，不进行脱敏",
    },
  },
} satisfies FlagsDef;

export const POLL_INTERVAL_FLAG = {
  pollInterval: {
    type: "number",
    valueHint: "<seconds>",
    description: {
      "en-US": "Template build polling interval (default: 5 seconds)",
      "zh-CN": "模版构建轮询间隔（默认：5 秒）",
    },
  },
} satisfies FlagsDef;

export const SANDBOX_NOTES: LocalizedText[] = [
  {
    "en-US": "Auth: uses a Bailian API Key as an Authorization Bearer token; no E2B key is sent.",
    "zh-CN": "鉴权：使用百炼 API Key 作为 Authorization Bearer Token；不会发送 E2B Key。",
  },
  {
    "en-US":
      "The workspace is resolved from --workspace-id, BAILIAN_WORKSPACE_ID, then config workspace_id.",
    "zh-CN": "Workspace 依次从 --workspace-id、BAILIAN_WORKSPACE_ID、配置项 workspace_id 解析。",
  },
  {
    "en-US":
      "Sandbox is currently available in cn-beijing only and requires prior SLR authorization.",
    "zh-CN": "Sandbox 当前仅支持 cn-beijing，首次使用前需完成 SLR 授权。",
  },
  {
    "en-US":
      "Global --timeout limits HTTP requests and total template-build polling; --instance-timeout maps to the Sandbox API lifetime field.",
    "zh-CN":
      "全局 --timeout 限制 HTTP 请求和模版构建总轮询时间；--instance-timeout 映射到 Sandbox API 的实例存活时间字段。",
  },
];

export type JsonObject = Record<string, unknown>;

export function resolveWorkspaceId(ctx: {
  flags: { workspaceId?: string };
  settings: { workspaceId?: string };
  identity: { binName: string };
}): string {
  const workspaceId = ctx.flags.workspaceId || ctx.settings.workspaceId;
  if (!workspaceId) {
    throw new BailianError(
      "Workspace ID is required.",
      ExitCode.USAGE,
      `Pass --workspace-id, set BAILIAN_WORKSPACE_ID, or configure: ${ctx.identity.binName} config set workspace_id <id>`,
    );
  }
  return workspaceId;
}

function asJsonObject(value: unknown, source: string): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new BailianError(`${source} must contain a JSON object.`, ExitCode.USAGE);
  }
  return value as JsonObject;
}

export async function readRequestBody(argument?: string): Promise<JsonObject> {
  if (!argument) return {};
  const source = argument.startsWith("@") ? argument.slice(1) : undefined;
  if (source !== undefined && source.length === 0) {
    throw new BailianError("--body @path must include a file path.", ExitCode.USAGE);
  }
  const raw = source === undefined ? argument : await readFile(source, "utf8");
  try {
    return asJsonObject(JSON.parse(raw) as unknown, source ? `Body file ${source}` : "--body");
  } catch (error) {
    if (error instanceof BailianError) throw error;
    if (error instanceof SyntaxError) {
      throw new BailianError(
        source ? `Body file ${source} contains invalid JSON.` : "--body contains invalid JSON.",
        ExitCode.USAGE,
      );
    }
    throw error;
  }
}

export function setDefined(body: JsonObject, key: string, value: unknown): void {
  if (value !== undefined) body[key] = value;
}

export function parseKeyValueEntries(entries: string[] | undefined, flag: string): JsonObject {
  const values: JsonObject = {};
  for (const entry of entries ?? []) {
    const separator = entry.indexOf("=");
    if (separator <= 0) {
      throw new BailianError(`${flag} values must use KEY=VALUE format.`, ExitCode.USAGE);
    }
    const key = entry.slice(0, separator).trim();
    if (!key) {
      throw new BailianError(`${flag} values must include a non-empty key.`, ExitCode.USAGE);
    }
    values[key] = entry.slice(separator + 1);
  }
  return values;
}

export function mergeObjectField(body: JsonObject, key: string, overrides: JsonObject): void {
  if (Object.keys(overrides).length === 0) return;
  const current = body[key];
  const base =
    current !== null && typeof current === "object" && !Array.isArray(current)
      ? (current as JsonObject)
      : {};
  body[key] = { ...base, ...overrides };
}

export function validateIntegerRange(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): void {
  if (
    value !== undefined &&
    (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum)
  ) {
    throw new BailianError(
      `${label} must be an integer between ${minimum} and ${maximum}.`,
      ExitCode.USAGE,
    );
  }
}

export function validatePositiveInteger(value: unknown, label: string): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new BailianError(`${label} must be a positive integer.`, ExitCode.USAGE);
  }
}

const CONNECTION_CREDENTIAL_KEYS = new Set(["envdAccessToken", "trafficAccessToken"]);
const SENSITIVE_KEY = /(?:token|secret|password|credential|api[_-]?key)/i;

function redactValue(value: unknown, redactEnvironmentMaps: boolean): unknown {
  if (Array.isArray(value)) return value.map((entry) => redactValue(entry, redactEnvironmentMaps));
  if (value === null || typeof value !== "object") return value;
  const output: JsonObject = {};
  for (const [key, entry] of Object.entries(value as JsonObject)) {
    if (
      CONNECTION_CREDENTIAL_KEYS.has(key) ||
      SENSITIVE_KEY.test(key) ||
      (redactEnvironmentMaps && (key === "envVars" || key === "envConfig"))
    ) {
      if (entry !== undefined && entry !== null) {
        output[key] =
          (key === "envVars" || key === "envConfig") &&
          typeof entry === "object" &&
          !Array.isArray(entry)
            ? Object.fromEntries(
                Object.keys(entry as JsonObject).map((environmentKey) => [
                  environmentKey,
                  "[REDACTED]",
                ]),
              )
            : "[REDACTED]";
      } else {
        output[key] = entry;
      }
      continue;
    }
    output[key] = redactValue(entry, redactEnvironmentMaps);
  }
  return output;
}

export function redactConnectionCredentials<T>(value: T): T {
  return redactValue(value, false) as T;
}

export function redactRequestSecrets<T>(value: T): T {
  return redactValue(value, true) as T;
}

export function displayValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "-";
  if (Array.isArray(value)) return value.join(",");
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return `${value}`;
  }
  return JSON.stringify(value) ?? "-";
}

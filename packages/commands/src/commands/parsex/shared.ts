import { readFile } from "node:fs/promises";
import {
  BailianError,
  ExitCode,
  UsageError,
  parsexBaseUrl,
  parsexEndpoint,
  submitParsexTask,
  type CommandContext,
  type FlagsDef,
  type ParsexOperation,
  type ParsexOssConfig,
  type ParsexOssCredentials,
  type ParsexSubmitRequest,
} from "bailian-cli-core";
export { WORKSPACE_FLAG } from "../shared/workspace.ts";

export const PARSEX_NOTE = {
  "en-US":
    "Uses a workspace-specific ParseX API and an ordinary API key. Set --workspace-id, BAILIAN_WORKSPACE_ID or workspace_id in the profile. --base-url overrides the origin (the CLI discards its path); cn-beijing.pre-maas.aliyuncs.com workspace hosts use pre-parse-x. Service availability depends on the workspace and rollout.",
  "zh-CN":
    "使用业务空间专属 ParseX API 和普通 API Key。通过 --workspace-id、BAILIAN_WORKSPACE_ID 或 Profile 的 workspace_id 指定空间。--base-url 覆盖源站（CLI 会忽略路径）；cn-beijing.pre-maas.aliyuncs.com 空间域名使用 pre-parse-x。服务可用性取决于业务空间和发布进度。",
};
export const SUBMIT_NOTE = {
  "en-US":
    "Returns data.biz_id without waiting; query the matching result command with --follow. Input must be an accessible HTTP(S) URL (including a signed OSS URL); local file upload is not part of this API. Inline processing takes precedence over config-id. Dry-run makes no business requests and redacts OSS credentials and URL query strings.",
  "zh-CN":
    "返回 data.biz_id，不等待任务完成；使用对应 result 命令加 --follow 等待。输入必须为可访问的 HTTP(S) URL（可使用 OSS 签名 URL）；此 API 不包含本地文件上传。内联 processing 优先于 config-id。dry-run 不调用业务接口，并隐藏 OSS 凭证和 URL 查询参数。",
};
export const OSS_FLAG = {
  ossConfigFile: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "JSON file with OSS credentials; submit also requires bucket and endpoint",
      "zh-CN": "包含 OSS 凭证的 JSON 文件；提交时还需 bucket 和 endpoint",
    },
  },
} satisfies FlagsDef;
export const SUBMIT_FLAGS = {
  fileUrl: {
    type: "string",
    valueHint: "<url>",
    description: { "en-US": "Accessible source file URL", "zh-CN": "可访问的源文件 URL" },
  },
  fileName: {
    type: "string",
    valueHint: "<name>",
    description: {
      "en-US": "File name (alternative to --file-name-extension)",
      "zh-CN": "文件名（与 --file-name-extension 二选一）",
    },
  },
  fileNameExtension: {
    type: "string",
    valueHint: "<extension>",
    description: { "en-US": "File extension, e.g. pdf", "zh-CN": "文件扩展名，例如 pdf" },
  },
  configId: {
    type: "string",
    valueHint: "<id>",
    description: { "en-US": "Saved ParseX configuration ID", "zh-CN": "已保存的 ParseX 配置 ID" },
  },
  processingFile: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "JSON object for the API processing field",
      "zh-CN": "API processing 字段的 JSON 对象文件",
    },
  },
  ...OSS_FLAG,
} satisfies FlagsDef;

export function objectValue(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new UsageError(`${name} must be a JSON object. / ${name} 必须为 JSON 对象。`);
  return value as Record<string, unknown>;
}

export async function readObjectFile(path: string, flag: string): Promise<Record<string, unknown>> {
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    throw new BailianError(
      `Cannot read ${flag} (${code ?? "I/O error"}). / 无法读取 ${flag} 文件。`,
      ExitCode.GENERAL,
      code === "ENOENT"
        ? "Check that the file exists. / 请检查文件是否存在。"
        : code === "EACCES" || code === "EPERM"
          ? "Check file read permissions. / 请检查文件读取权限。"
          : "Use a readable UTF-8 JSON file. / 请使用可读取的 UTF-8 JSON 文件。",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new UsageError(`${flag} must contain valid JSON. / ${flag} 必须包含合法 JSON。`);
  }
  return objectValue(parsed, flag);
}

export function nonEmpty(value: string | undefined, flag: string): void {
  if (value !== undefined && !value.trim())
    throw new UsageError(`${flag} cannot be empty. / ${flag} 不能为空。`);
}

export function integer(
  value: number | undefined,
  flag: string,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < minimum || value > maximum))
    throw new UsageError(
      `${flag} must be an integer in [${minimum}, ${maximum}]. / ${flag} 必须为该范围内的整数。`,
    );
}

export async function readOssConfig(
  path: string | undefined,
  submit: true,
): Promise<ParsexOssConfig | undefined>;
export async function readOssConfig(
  path: string | undefined,
  submit: false,
): Promise<ParsexOssCredentials | undefined>;
export async function readOssConfig(
  path: string | undefined,
  submit: boolean,
): Promise<ParsexOssConfig | ParsexOssCredentials | undefined> {
  if (path === undefined) return undefined;
  const config = await readObjectFile(path, "--oss-config-file");
  for (const name of [
    "access_key_id",
    "access_key_secret",
    ...(submit ? ["bucket", "endpoint"] : []),
  ]) {
    if (typeof config[name] !== "string" || !(config[name] as string).trim())
      throw new UsageError(
        `--oss-config-file requires ${name}. / --oss-config-file 缺少 ${name}。`,
      );
  }
  if (config.security_token !== undefined && typeof config.security_token !== "string")
    throw new UsageError("security_token must be a string. / security_token 必须为字符串。");
  const credentials: ParsexOssCredentials = {
    access_key_id: config.access_key_id as string,
    access_key_secret: config.access_key_secret as string,
    ...(config.security_token === undefined
      ? {}
      : { security_token: config.security_token as string }),
  };
  return submit
    ? { ...credentials, bucket: config.bucket as string, endpoint: config.endpoint as string }
    : credentials;
}

interface SubmitFlags {
  fileUrl?: string;
  fileName?: string;
  fileNameExtension?: string;
  configId?: string;
  processingFile?: string;
  ossConfigFile?: string;
}

export async function buildSubmitBody(flags: SubmitFlags): Promise<ParsexSubmitRequest> {
  for (const [name, value] of Object.entries(flags)) {
    if (typeof value === "string") nonEmpty(value, name);
  }
  if (flags.fileName !== undefined && flags.fileNameExtension !== undefined)
    throw new UsageError(
      "Use only one of --file-name and --file-name-extension. / --file-name 与 --file-name-extension 二选一。",
    );
  if (flags.fileUrl !== undefined) {
    let valid = false;
    try {
      const url = new URL(flags.fileUrl);
      valid = ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
    } catch {
      /* Report usage without printing potentially signed source URLs. */
    }
    if (!valid)
      throw new UsageError(
        "--file-url must be an HTTP(S) URL without embedded credentials. / --file-url 必须为不含用户名密码的 HTTP(S) URL。",
      );
  }
  const processing =
    flags.processingFile === undefined
      ? undefined
      : await readObjectFile(flags.processingFile, "--processing-file");
  const ossConfig = await readOssConfig(flags.ossConfigFile, true);
  return {
    ...(flags.fileUrl === undefined ? {} : { file_url: flags.fileUrl }),
    ...(flags.fileName === undefined ? {} : { file_name: flags.fileName }),
    ...(flags.fileNameExtension === undefined
      ? {}
      : { file_name_extension: flags.fileNameExtension }),
    ...(flags.configId === undefined ? {} : { config_id: flags.configId }),
    ...(processing === undefined ? {} : { processing }),
    ...(ossConfig === undefined ? {} : { output: { oss_config: ossConfig } }),
  };
}

/** Request previews must not disclose customer OSS credentials or signed query strings. */
export function redactParsexRequest(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactParsexRequest);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        ["access_key_id", "access_key_secret", "security_token"].includes(key)
          ? "[REDACTED]"
          : key === "file_url" && typeof entry === "string"
            ? redactUrl(entry)
            : redactParsexRequest(entry),
      ]),
    );
  return value;
}
function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.search) url.search = "[REDACTED]";
    url.hash = "";
    return url.toString();
  } catch {
    // Schema examples may also contain a field named file_url with arbitrary text.
    return value;
  }
}

export function resolveParsexBaseUrl(
  ctx: Pick<CommandContext, "client" | "settings"> & { flags: { workspaceId?: string } },
): string {
  return ctx.client.url("", () => {
    const workspaceId = ctx.flags.workspaceId || ctx.settings.workspaceId;
    if (!workspaceId)
      throw new UsageError(
        "ParseX requires --workspace-id, BAILIAN_WORKSPACE_ID or profile workspace_id. / ParseX 需要通过 --workspace-id、BAILIAN_WORKSPACE_ID 或 Profile 的 workspace_id 指定空间。",
      );
    return parsexBaseUrl(workspaceId);
  });
}

export async function runSubmit(
  ctx: Pick<CommandContext, "client" | "settings" | "output"> & { flags: { workspaceId?: string } },
  operation: ParsexOperation,
  body: ParsexSubmitRequest,
): Promise<void> {
  const baseUrl = resolveParsexBaseUrl(ctx);
  const endpoint = parsexEndpoint(baseUrl, operation, "submit");
  if (ctx.settings.dryRun) {
    ctx.output.result({ endpoint, method: "POST", request: redactParsexRequest(body) });
    return;
  }
  const response = await submitParsexTask(ctx.client, baseUrl, operation, body);
  ctx.output.result(response);
}

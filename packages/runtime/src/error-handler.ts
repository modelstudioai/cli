import {
  BailianError,
  ExitCode,
  detectOutputFormat,
  type LocalizedText,
  type OutputFormat,
} from "bailian-cli-core";
import { API_KEY_PAGE } from "./urls.ts";

const LABEL_WIDTH = 13;

/** Binary name used in error hints; set by handleError() so its helpers can read it. */
let binName: string;

function pad(label: string): string {
  return label.padEnd(LABEL_WIDTH);
}

function alignContinuation(text: string): string {
  return text
    .split("\n")
    .map((line, i) => (i === 0 ? line : " ".repeat(LABEL_WIDTH) + line))
    .join("\n");
}

function enhanceHint(err: BailianError): string | undefined {
  if (err.exitCode === ExitCode.AUTH) {
    // Non-model auth domains carry their own credential-specific hints; don't
    // append model API key onboarding lines to Console/OpenAPI errors.
    if (isNonModelAuthHint(err.hint)) {
      return err.hint;
    }
    return [
      err.hint,
      "",
      `${binName} auth login --api-key <your-key>`,
      `${binName} auth status`,
      `Get API Key: ${API_KEY_PAGE}`,
    ]
      .filter((s): s is string => s !== undefined)
      .join("\n");
  }
  return err.hint;
}

function isNonModelAuthHint(hint: string | undefined): boolean {
  if (!hint) return false;
  return (
    hint.includes("auth login --console") ||
    hint.includes("auth login --open-api") ||
    hint.includes("--access-key-id") ||
    hint.includes("ALIBABA_CLOUD_ACCESS_KEY_")
  );
}

export function detectErrorOutputFormat(
  argv: string[] = process.argv.slice(2),
  envOutput: string | undefined = process.env.DASHSCOPE_OUTPUT,
): OutputFormat {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--output") {
      return detectOutputFormat(argv[i + 1] || envOutput);
    }
    if (arg?.startsWith("--output=")) {
      return detectOutputFormat(arg.slice("--output=".length));
    }
  }
  return detectOutputFormat(envOutput);
}

function writeCauseChain(err: Error): void {
  let cur: unknown = (err as { cause?: unknown }).cause;
  let depth = 0;
  while (cur instanceof Error && depth < 5) {
    process.stderr.write(`${pad("Caused by:")}${cur.message}\n`);
    cur = (cur as { cause?: unknown }).cause;
    depth++;
  }
}

function writeBailianErrorText(err: BailianError): void {
  process.stderr.write(`\n${pad("Error:")}${err.message}\n`);

  const hint = enhanceHint(err);
  if (hint) {
    process.stderr.write(`${pad("Hint:")}${alignContinuation(hint)}\n`);
  }

  const api = err.api;
  if (api) {
    if (api.httpStatus !== undefined) {
      const codeSuffix = api.apiCode ? ` (${api.apiCode})` : "";
      process.stderr.write(`${pad("Status:")}HTTP ${api.httpStatus}${codeSuffix}\n`);
    } else if (api.apiCode) {
      process.stderr.write(`${pad("Code:")}${api.apiCode}\n`);
    }
    if (api.requestId) {
      process.stderr.write(`${pad("Request ID:")}${api.requestId}\n`);
    }
  }

  writeCauseChain(err);

  process.stderr.write(`${pad("Exit code:")}${err.exitCode}\n`);
}

export function handleError(err: unknown, cliName: string): never {
  binName = cliName;

  if (err instanceof BailianError) {
    const format = detectErrorOutputFormat();

    if (format === "json") {
      process.stderr.write(JSON.stringify(err.toJSON(), null, 2) + "\n");
    } else {
      writeBailianErrorText(err);
    }
    process.exit(err.exitCode);
  }

  if (err instanceof Error) {
    const classified = classifyRuntimeError(err, binName);
    if (classified) return handleError(classified, binName);

    process.stderr.write(`\n${pad("Error:")}${err.message}\n`);
    writeCauseChain(err);
    if (process.env.DASHSCOPE_VERBOSE === "1") {
      process.stderr.write(`${err.stack}\n`);
    }
  } else {
    process.stderr.write(`\n${pad("Error:")}${String(err)}\n`);
  }

  process.exit(ExitCode.GENERAL);
}

type Localize = (text: LocalizedText) => string;
const english: Localize = (text) => (typeof text === "string" ? text : text["en-US"]);

/** Shared local-error classification; service errors are never reclassified. */
export function classifyRuntimeError(
  error: Error,
  binName: string,
  localize: Localize = english,
): BailianError | undefined {
  if (error instanceof BailianError) return error;
  const baseUrlHint = localize({
    "en-US": `If the DashScope host is wrong, check baseUrl (--base-url, ${binName} config show, or DASHSCOPE_BASE_URL).`,
    "zh-CN": `如果 DashScope 主机地址有误，请检查 baseUrl（--base-url、${binName} config show 或 DASHSCOPE_BASE_URL）。`,
  });
  if (
    error.name === "AbortError" ||
    error.name === "TimeoutError" ||
    error.message.includes("timed out")
  ) {
    return new BailianError(
      localize({ "en-US": "Request timed out.", "zh-CN": "请求超时。" }),
      ExitCode.TIMEOUT,
      localize({
        "en-US": `Try increasing --timeout (e.g. --timeout 60).\n${baseUrlHint}\nRun: ${binName} auth status — to check credentials.`,
        "zh-CN": `请尝试增大 --timeout（例如 --timeout 60）。\n${baseUrlHint}\n运行 ${binName} auth status 检查凭证。`,
      }),
      { cause: error },
    );
  }
  if (error instanceof TypeError && error.message === "fetch failed") {
    const cause = error.cause as NodeJS.ErrnoException | undefined;
    const detailParts = [
      cause?.code,
      cause?.message !== cause?.code ? cause?.message : undefined,
    ].filter(Boolean);
    const detail = detailParts.length
      ? detailParts.join(": ")
      : localize({ "en-US": "unknown cause", "zh-CN": "未知原因" });
    return new BailianError(
      localize({
        "en-US": `Network request failed: ${detail}`,
        "zh-CN": `网络请求失败：${detail}`,
      }),
      ExitCode.NETWORK,
      networkHint(cause?.code, binName, baseUrlHint, localize),
      { cause: cause ?? error },
    );
  }
  const errno = (error as NodeJS.ErrnoException).code;
  if (typeof errno === "string" && errno.startsWith("E")) {
    let hint: LocalizedText = {
      "en-US": "Check the file path and permissions.",
      "zh-CN": "请检查文件路径和权限。",
    };
    if (errno === "ENOENT")
      hint = { "en-US": "File or directory not found.", "zh-CN": "文件或目录不存在。" };
    else if (errno === "EACCES" || errno === "EPERM")
      hint = {
        "en-US": "Permission denied — check file or directory permissions.",
        "zh-CN": "权限不足，请检查文件或目录权限。",
      };
    else if (errno === "ENOSPC")
      hint = {
        "en-US": "Disk full — free up space and try again.",
        "zh-CN": "磁盘已满，请释放空间后重试。",
      };
    return new BailianError(
      localize({
        "en-US": `File system error: ${error.message}`,
        "zh-CN": `文件系统错误：${error.message}`,
      }),
      ExitCode.GENERAL,
      localize(hint),
      { cause: error },
    );
  }
  return undefined;
}

function networkHint(
  code: string | undefined,
  binName: string,
  baseUrlHint: string,
  localize: Localize,
): string {
  switch (code) {
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return localize({
        "en-US": `DNS resolution failed. Check DNS / network. ${baseUrlHint}`,
        "zh-CN": `DNS 解析失败，请检查 DNS 和网络。${baseUrlHint}`,
      });
    case "ECONNREFUSED":
      return localize({
        "en-US": "Connection refused. Check the target host/port and proxy settings.",
        "zh-CN": "连接被拒绝，请检查目标主机、端口和代理配置。",
      });
    case "ECONNRESET":
      return localize({
        "en-US": `Connection reset by peer. Retry, or check proxy / firewall.\nIf you are behind a VPN or corporate proxy, route ${binName} through it:\nexport HTTPS_PROXY=http://127.0.0.1:<proxy-port>`,
        "zh-CN": `连接被对端重置，请重试或检查代理和防火墙。\n如果使用 VPN 或企业代理，请为 ${binName} 配置代理：\nexport HTTPS_PROXY=http://127.0.0.1:<proxy-port>`,
      });
    case "ETIMEDOUT":
      return localize({
        "en-US": `Connection timed out. Check your network. ${baseUrlHint}`,
        "zh-CN": `连接超时，请检查网络。${baseUrlHint}`,
      });
    case "CERT_HAS_EXPIRED":
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
      return localize({
        "en-US": "TLS certificate error. Check system clock and CA bundle.",
        "zh-CN": "TLS 证书错误，请检查系统时间和 CA 证书。",
      });
    default:
      return localize({
        "en-US": `Check network and proxy (HTTP_PROXY / HTTPS_PROXY). ${baseUrlHint}`,
        "zh-CN": `请检查网络和代理（HTTP_PROXY / HTTPS_PROXY）。${baseUrlHint}`,
      });
  }
}

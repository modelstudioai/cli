import {
  BailianError,
  ExitCode,
  detectOutputFormat,
  type OutputFormat,
  CONSOLE_GATEWAY_NO_TOKEN_MESSAGE,
} from "bailian-cli-core";
import { API_KEY_PAGE } from "./urls.ts";

const LABEL_WIDTH = 13;

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
    if (err.message === CONSOLE_GATEWAY_NO_TOKEN_MESSAGE) {
      return err.hint;
    }
    return [
      err.hint,
      "",
      "bl auth login --api-key <your-key>",
      "bl auth status",
      `Get API Key: ${API_KEY_PAGE}`,
    ]
      .filter((s): s is string => s !== undefined)
      .join("\n");
  }
  if (err.exitCode === ExitCode.QUOTA) {
    return [err.hint, "", `Console: ${API_KEY_PAGE}`]
      .filter((s): s is string => s !== undefined)
      .join("\n");
  }
  return err.hint;
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

function fromFetchFailed(err: TypeError): BailianError {
  const cause = err.cause as NodeJS.ErrnoException | undefined;
  const code = cause?.code;
  const causeMsg = cause?.message;

  const detailParts: string[] = [];
  if (code) detailParts.push(code);
  if (causeMsg && causeMsg !== code) detailParts.push(causeMsg);
  const detail = detailParts.length > 0 ? detailParts.join(": ") : "unknown cause";

  return new BailianError(
    `Network request failed: ${detail}`,
    ExitCode.NETWORK,
    pickNetworkHint(code),
    { cause: err },
  );
}

function pickNetworkHint(code: string | undefined): string {
  switch (code) {
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "DNS resolution failed. Check DASHSCOPE_BASE_URL or your DNS / network.";
    case "ECONNREFUSED":
      return "Connection refused. Check the target host/port and proxy settings.";
    case "ECONNRESET":
      return "Connection reset by peer. Retry, or check proxy / firewall.";
    case "ETIMEDOUT":
      return "Connection timed out. Check your network or try a different region.";
    case "CERT_HAS_EXPIRED":
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
      return "TLS certificate error. Check system clock and CA bundle.";
    default:
      return "Check network connection, proxy settings (HTTP_PROXY / HTTPS_PROXY), and DASHSCOPE_BASE_URL.";
  }
}

function fromFsError(err: NodeJS.ErrnoException): BailianError {
  const ecode = err.code;
  let hint = "Check the file path and permissions.";
  if (ecode === "ENOENT") hint = "File or directory not found.";
  else if (ecode === "EACCES" || ecode === "EPERM")
    hint = "Permission denied — check file or directory permissions.";
  else if (ecode === "ENOSPC") hint = "Disk full — free up space and try again.";
  return new BailianError(`File system error: ${err.message}`, ExitCode.GENERAL, hint, {
    cause: err,
  });
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

export function handleError(err: unknown): never {
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
    if (
      err.name === "AbortError" ||
      err.name === "TimeoutError" ||
      err.message.includes("timed out")
    ) {
      const timeout = new BailianError(
        "Request timed out.",
        ExitCode.TIMEOUT,
        "Try increasing --timeout (e.g. --timeout 60).\n" +
          "If this happens on every request with a valid API key, you may be hitting the wrong region.\n" +
          "Run: bl auth status   — to check your credentials and region.\n" +
          "Run: bl config set --key region --value cn   — to override the region.",
        { cause: err },
      );
      return handleError(timeout);
    }

    if (err instanceof TypeError && err.message === "fetch failed") {
      return handleError(fromFetchFailed(err));
    }

    const ecode = (err as NodeJS.ErrnoException).code;
    if (typeof ecode === "string" && ecode.startsWith("E")) {
      return handleError(fromFsError(err as NodeJS.ErrnoException));
    }

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

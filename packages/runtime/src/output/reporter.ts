import { stripVTControlCharacters } from "node:util";
import {
  BailianError,
  ExitCode,
  formatOutput,
  type CommandOutput,
  type LocalizedText,
  type OutputMessage,
  type Settings,
} from "bailian-cli-core";
import { errorHint, normalizeError } from "../error-handler.ts";
import { createTranslator } from "../i18n.ts";
import { diagnosticPayload } from "./diagnostics.ts";

export interface OutputWriter {
  write(chunk: string): unknown;
}

export interface OutputReporterOptions {
  settings: Pick<Settings, "output" | "quiet" | "verbose">;
  stdout?: OutputWriter;
  stderr?: OutputWriter;
  localize?: (text: LocalizedText) => string;
  binName?: string;
}

export interface OutputReporter {
  output: CommandOutput;
  /** Runtime-only terminal error rendering. The lifecycle owns process exit. */
  error(error: unknown): ExitCode;
}

/** No global interception: legacy emitters remain separate until they are migrated. */
export function createOutputReporter(options: OutputReporterOptions): OutputReporter {
  const { output: format, quiet, verbose } = options.settings;
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const translator = createTranslator("en-US");
  const localize = options.localize ?? ((text: LocalizedText) => translator.localize(text));
  let resultWritten = false;
  let errorCode: ExitCode | undefined;

  function diagnostic(level: "warning" | "debug", input: OutputMessage): void {
    const payload = diagnosticPayload(input, localize);
    if (format === "json") {
      stderr.write(JSON.stringify({ [level]: payload }) + "\n");
    } else {
      const label =
        level === "warning" ? localize({ "en-US": "Warning", "zh-CN": "警告" }) : "debug";
      const details = payload.details === undefined ? "" : ` ${JSON.stringify(payload.details)}`;
      stderr.write(stripVTControlCharacters(`${label}: ${payload.message}${details}`) + "\n");
    }
  }

  function information(message: LocalizedText): void {
    if (format === "text" && !quiet) {
      stderr.write(stripVTControlCharacters(diagnosticPayload(message, localize).message) + "\n");
    }
  }

  return {
    output: {
      result(data, resultOptions) {
        if (resultWritten) {
          throw new BailianError(
            localize({
              "en-US": "A final result has already been written.",
              "zh-CN": "最终结果已经输出，不能重复输出。",
            }),
          );
        }
        // Serialize before writing; invalid values must not reserve the result slot.
        const serialized =
          format === "text" && resultOptions?.text !== undefined
            ? resultOptions.text
            : formatOutput(data, format);
        if (typeof serialized !== "string") {
          throw new BailianError(
            localize({
              "en-US": "The final result is not serializable.",
              "zh-CN": "最终结果无法序列化。",
            }),
          );
        }
        stdout.write(serialized + "\n");
        resultWritten = true;
      },
      progress: information,
      info: information,
      warning: (warning) => diagnostic("warning", warning),
      debug(details) {
        if (verbose) diagnostic("debug", details);
      },
    },
    error(error) {
      if (errorCode !== undefined) return errorCode;
      const failure = normalizeError(error, options.binName ?? "cli", localize);
      const hint = errorHint(failure, options.binName ?? "cli", localize);
      if (verbose && error instanceof Error && !(error instanceof BailianError)) {
        diagnostic("debug", {
          code: "ERROR_STACK",
          message: { "en-US": "Error stack", "zh-CN": "错误调用栈" },
          details: { stack: error.stack },
        });
      }
      if (format === "json") {
        const payload = failure.toJSON();
        if (hint !== undefined) payload.error.hint = hint;
        stderr.write(JSON.stringify(payload) + "\n");
      } else {
        const lines: string[] = [];
        const field = (label: LocalizedText, value: string | number) =>
          lines.push(`${localize(label)}: ${value}`);
        field({ "en-US": "Error", "zh-CN": "错误" }, failure.message);
        if (hint) field({ "en-US": "Hint", "zh-CN": "提示" }, hint);
        if (failure.api?.httpStatus !== undefined) {
          const suffix = failure.api.apiCode ? ` (${failure.api.apiCode})` : "";
          field({ "en-US": "Status", "zh-CN": "状态" }, `HTTP ${failure.api.httpStatus}${suffix}`);
        } else if (failure.api?.apiCode)
          field({ "en-US": "Code", "zh-CN": "错误码" }, failure.api.apiCode);
        if (failure.api?.requestId)
          field({ "en-US": "Request ID", "zh-CN": "请求 ID" }, failure.api.requestId);
        let cause: unknown = failure.cause;
        const seen = new Set<Error>();
        while (cause instanceof Error && seen.size < 5 && !seen.has(cause)) {
          seen.add(cause);
          const code = (cause as NodeJS.ErrnoException).code;
          field(
            { "en-US": "Caused by", "zh-CN": "原因" },
            code ? `${code}: ${cause.message}` : cause.message,
          );
          cause = cause.cause;
        }
        field({ "en-US": "Exit code", "zh-CN": "退出码" }, failure.exitCode);
        stderr.write(stripVTControlCharacters(lines.join("\n")) + "\n");
      }
      errorCode = failure.exitCode;
      return errorCode;
    },
  };
}

/**
 * 子进程执行 CLI：spawn 仓库本地 tsx main.ts，解析 stdout。
 */
import { spawn } from "node:child_process";
import { resolveTsxBin } from "./paths.mjs";
import { truncateLog, extractError, isRateLimitFailure } from "./parsers.mjs";
import { captureTraceIdsFromText, enrichTraceIdsAsync } from "./trace-ids.mjs";

/** 压测默认开启 --verbose，便于从 stderr 捕获 request_id（设 STRESS_VERBOSE_REQUEST_ID=0 可关） */
export function stressCliArgs(cliArgs) {
  if (process.env.STRESS_VERBOSE_REQUEST_ID === "0") return cliArgs;
  if (cliArgs.includes("--verbose")) return cliArgs;
  return ["--verbose", ...cliArgs];
}

/** 对 shell 参数做引号包裹。 */
export function shellQuote(s) {
  if (/^[A-Za-z0-9_./:=+-]+$/.test(s)) return s;
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * 构建可复制的 pnpm 展示命令。
 * @param {string[]} cliArgs image generate 之后的参数
 */
export function buildDisplayCommand(cliArgs) {
  return ["pnpm", "run", "dev", ...cliArgs].map(shellQuote).join(" ");
}

/** 追加捕获输出并限制缓冲区。 */
export function appendCapturedLog(current, chunk, maxCapture) {
  const next = current + chunk.toString();
  if (next.length <= maxCapture) return next;
  return next.slice(-maxCapture);
}

/**
 * 执行一次 CLI 调用。
 * @param {object} ctx
 * @param {(stdout: string, context: object) => { ok: boolean, data?: object, error?: string }} parseStdout 成功解析；可对 asr 读取 context.asrOutPath
 */
export function executeSingleCli(ctx) {
  const {
    MAIN_TS,
    CLI_PACKAGE,
    TIMEOUT_MS,
    MAX_LOG_CAPTURE,
    index,
    displayCommand,
    cliArgs,
    baseRecord,
    parseStdout,
    readFileOptional,
    asrOutPath,
    TSX_BIN = resolveTsxBin(),
  } = ctx;

  const startedAt = Date.now();

  return new Promise((resolve) => {
    const child = spawn(TSX_BIN, [MAIN_TS, ...stressCliArgs(cliArgs)], {
      cwd: CLI_PACKAGE,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    /** 子进程运行期间累积的 trace id（不受日志尾部截断影响） */
    let streamTrace = {};

    const onLogChunk = (which, chunk) => {
      streamTrace = captureTraceIdsFromText(chunk.toString(), streamTrace);
      if (which === "stdout") {
        stdout = appendCapturedLog(stdout, chunk, MAX_LOG_CAPTURE);
      } else {
        stderr = appendCapturedLog(stderr, chunk, MAX_LOG_CAPTURE);
      }
    };

    child.stdout?.on("data", (chunk) => onLogChunk("stdout", chunk));
    child.stderr?.on("data", (chunk) => onLogChunk("stderr", chunk));

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000);
    }, TIMEOUT_MS);

    const pack = async (payload) => {
      const enriched = await enrichTraceIdsAsync({
        ...payload,
        streamRequestId: streamTrace.requestId,
        streamTaskId: streamTrace.taskId,
        stdout: payload.stdout,
        stderr: payload.stderr,
      });
      return {
        ...enriched,
        stdout: enriched.stdout != null ? truncateLog(String(enriched.stdout), 2048) : undefined,
        stderr: enriched.stderr != null ? truncateLog(String(enriched.stderr), 2048) : undefined,
      };
    };

    child.on("close", async (code, signal) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startedAt;
      /** @type {Record<string, unknown>} */
      const base = {
        ...baseRecord,
        index: index + 1,
        command: displayCommand,
        cwd: CLI_PACKAGE,
        durationMs,
        durationSec: (durationMs / 1000).toFixed(2),
      };

      if (signal === "SIGTERM" || signal === "SIGKILL") {
        resolve(
          await pack({
            ...base,
            status: "failed",
            exitCode: code ?? 1,
            error: `超时（>${TIMEOUT_MS}ms）或被信号 ${signal ?? "终止"}`,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
          }),
        );
        return;
      }

      const trimmedOut = stdout.trim();
      const trimmedErr = stderr.trim();

      if (code !== 0) {
        resolve(
          await pack({
            ...base,
            status: "failed",
            exitCode: code ?? 1,
            error: extractError(trimmedErr, trimmedOut, code ?? 1),
            stdout: trimmedOut,
            stderr: trimmedErr,
          }),
        );
        return;
      }

      let parsed =
        typeof parseStdout === "function"
          ? await parseStdout(trimmedOut, {
              stderr: trimmedErr,
              asrOutPath,
              readFileOptional,
              index,
            })
          : { ok: false, error: "parseStdout 未配置" };

      if (!parsed.ok) {
        resolve(
          await pack({
            ...base,
            status: "failed",
            exitCode: code ?? 1,
            error:
              parsed.error ??
              extractError(trimmedErr, trimmedOut, code ?? 1) ??
              "退出码为 0 但未解析到结果",
            stdout: trimmedOut,
            stderr: trimmedErr,
          }),
        );
        return;
      }

      resolve(
        await pack({
          ...base,
          status: "success",
          exitCode: 0,
          ...parsed.data,
          stdout: trimmedOut,
          stderr: trimmedErr,
        }),
      );
    });

    child.on("error", async (err) => {
      clearTimeout(timer);
      resolve(
        await pack({
          ...baseRecord,
          index: index + 1,
          command: displayCommand,
          cwd: CLI_PACKAGE,
          durationMs: Date.now() - startedAt,
          durationSec: ((Date.now() - startedAt) / 1000).toFixed(2),
          status: "failed",
          exitCode: 1,
          error: /** @type {Error} */ (err).message,
          stdout: stdout.trim(),
          stderr: String(err),
        }),
      );
    });
  });
}

/**
 * 固定并发池。
 * @param {number} total
 * @param {number} concurrency
 * @param {(index: number) => Promise<object>} worker
 */
export async function runPool(total, concurrency, worker, opts = {}) {
  const results = Array.from({ length: total });
  let next = 0;
  let doneCount = 0;

  async function runner() {
    while (true) {
      const i = next++;
      if (i >= total) break;
      results[i] = await worker(i);
      doneCount++;
      if (opts.onTaskDone) opts.onTaskDone(results[i], i);
      process.stderr.write(`\r[进度] ${doneCount}/${total} 已完成`);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => runner());
  await Promise.all(workers);
  process.stderr.write("\n");
  return results;
}

/**
 * 单任务带限流重试。
 * @param {object} opts
 */
export async function runOneWithRetries(opts) {
  const { index, rateLimiter, maxRetries, retryBaseMs, sleepFn, runAttempt } = opts;
  const { sleep } = await import("./rate-limit.mjs");
  const wait = sleepFn ?? sleep;

  const overallStarted = Date.now();
  let attempt = 0;
  /** @type {object | undefined} */
  let lastResult;

  while (attempt <= maxRetries) {
    attempt++;
    if (rateLimiter) {
      await rateLimiter.acquire();
    }

    lastResult = await runAttempt(index);

    if (lastResult.status === "success") {
      if (attempt > 1) {
        lastResult.retries = attempt - 1;
      }
      break;
    }

    if (!isRateLimitFailure(lastResult) || attempt > maxRetries) {
      break;
    }

    const waitMs = retryBaseMs * attempt;
    process.stderr.write(
      `\n[#${index + 1}] 触发限流，${(waitMs / 1000).toFixed(1)}s 后重试 (${attempt}/${maxRetries})\n`,
    );
    await wait(waitMs);
  }

  const durationMs = Date.now() - overallStarted;
  return {
    ...lastResult,
    durationMs,
    durationSec: (durationMs / 1000).toFixed(2),
  };
}

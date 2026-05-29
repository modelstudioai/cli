/**
 * 压测 target 工厂函数：封装共享逻辑，每个 target 只需声明式配置。
 */
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { DEFAULT_CLI_PACKAGE, MONOREPO_ROOT, resolveMainTs } from "./paths.mjs";
import { parseStressArgv, optFrom } from "./argv-parse.mjs";
import { resolveStressCountAndConcurrency } from "./stress-config.mjs";
import { SubmissionRateLimiter } from "./rate-limit.mjs";
import { ensurePrerequisites } from "./fixtures.mjs";
import {
  buildDisplayCommand,
  executeSingleCli,
  runPool,
  runOneWithRetries,
} from "./cli-runner.mjs";
import { logReportStep } from "./report.mjs";
import { finishStressRun, stressExit, createIncrementalWriter } from "./finish-run.mjs";

const execFileAsync = promisify(execFile);

/**
 * @param {object} config
 * @returns {(forwardedArgv: string[], ctx?: object) => Promise<object>}
 */
export function defineStressTarget(config) {
  return async function runStress(forwardedArgv, ctx = {}) {
    const ARGV = parseStressArgv(["node", "stress", ...forwardedArgv]);

    if (ARGV.__help) {
      console.error(config.helpText ?? `pnpm run test:stress -- ${config.canonical}`);
      return stressExit(ctx, 0, { skipped: true });
    }

    const globals = ctx?.globals ?? {};
    const CLI_PACKAGE = optFrom(ARGV, "CLI_PACKAGE") || DEFAULT_CLI_PACKAGE;
    const MAIN_TS = resolveMainTs(CLI_PACKAGE);

    const canonical = ctx?.canonicalTarget ?? config.canonical;
    const {
      count: COUNT,
      concurrency: CONCURRENCY,
      concurrencyExplicit: CONCURRENCY_EXPLICIT,
    } = resolveStressCountAndConcurrency({
      canonical,
      argv: ARGV,
      configPath: globals.stressConfigPath,
    });

    const MODEL = optFrom(ARGV, "MODEL") || config.defaultModel;
    const TIMEOUT_MS = Math.max(
      config.minTimeoutMs ?? 10_000,
      parseInt(optFrom(ARGV, "TIMEOUT_MS") ?? String(config.defaultTimeoutMs ?? 120_000), 10) ||
        (config.defaultTimeoutMs ?? 120_000),
    );
    const CLI_TIMEOUT_SEC = Math.ceil(TIMEOUT_MS / 1000);
    const MAX_RETRIES = Math.max(
      0,
      parseInt(optFrom(ARGV, "MAX_RETRIES") ?? String(config.defaultMaxRetries ?? 3), 10) ||
        (config.defaultMaxRetries ?? 3),
    );
    const RETRY_BASE_MS = Math.max(
      500,
      parseInt(optFrom(ARGV, "RETRY_BASE_MS") ?? String(config.defaultRetryBaseMs ?? 3000), 10) ||
        (config.defaultRetryBaseMs ?? 3000),
    );
    const DISABLE_RATE_LIMIT = optFrom(ARGV, "DISABLE_RATE_LIMIT") === "1";
    const MAX_LOG_CAPTURE = Math.max(
      4096,
      parseInt(optFrom(ARGV, "MAX_LOG_CAPTURE") ?? "65536", 10) || 65536,
    );

    const RATE_LIMIT_MAX = Math.max(
      1,
      parseInt(optFrom(ARGV, "RATE_LIMIT_MAX") ?? String(config.defaultRateLimitMax ?? 10), 10) ||
        (config.defaultRateLimitMax ?? 10),
    );
    const RATE_LIMIT_WINDOW_MS = Math.max(
      100,
      parseInt(
        optFrom(ARGV, "RATE_LIMIT_WINDOW_MS") ?? String(config.defaultRateLimitWindowMs ?? 1000),
        10,
      ) ||
        (config.defaultRateLimitWindowMs ?? 1000),
    );

    const POLL_INTERVAL = config.hasPollInterval
      ? Math.max(
          1,
          parseInt(
            optFrom(ARGV, "POLL_INTERVAL") ?? String(config.defaultPollInterval ?? 10),
            10,
          ) ||
            (config.defaultPollInterval ?? 10),
        )
      : null;

    const extraParams = config.extraParams ? config.extraParams(ARGV) : {};

    const runId = new Date().toISOString().replace(/[:.]/g, "-");
    const BATCH_ROOT =
      ctx.reportDirOverride ||
      optFrom(ARGV, "REPORT_DIR") ||
      join(MONOREPO_ROOT, "test", "output", `${config.batchDirPrefix}-${runId}`);

    mkdirSync(BATCH_ROOT, { recursive: true });

    // Fixture handling
    let fixtureRef = null;
    if (config.fixtureKind) {
      const prerequisites = await ensurePrerequisites({
        canonicalTarget: canonical,
        batchRoot: BATCH_ROOT,
        mainTs: MAIN_TS,
        cliPackage: CLI_PACKAGE,
        globals: {
          reuseFixtures: globals.reuseFixtures === true || ARGV.__reuseFixtures === "1",
          fixturesDir: globals.fixturesDir,
        },
        setupTimeoutMs: config.fixtureSetupTimeoutMs ?? 600_000,
        videoSetupTimeoutMs: config.videoSetupTimeoutMs,
      });

      if (globals.setupOnly === true || ARGV.__setupOnly === "1") {
        console.error("--setup-only：仅生成前置资源，已结束");
        return stressExit(ctx, 0, { skipped: true });
      }

      fixtureRef = config.resolveFixtureRef(prerequisites);
      if (!fixtureRef) {
        console.error(config.fixtureRefErrorMessage ?? "前置 manifest 缺少所需资源");
        return stressExit(ctx, 1);
      }
    }

    // Environment validation
    if (!existsSync(MAIN_TS)) {
      console.error(`未找到 CLI 入口: ${MAIN_TS}`);
      return stressExit(ctx, 1);
    }
    try {
      await execFileAsync("node", ["--version"], { encoding: "utf8" });
    } catch {
      console.error("未找到 node。");
      return stressExit(ctx, 1);
    }

    const rateLimiter = DISABLE_RATE_LIMIT
      ? null
      : new SubmissionRateLimiter(RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);

    const buildCtx = {
      MODEL,
      CLI_TIMEOUT_SEC,
      POLL_INTERVAL,
      BATCH_ROOT,
      fixtureRef,
      extraParams,
    };

    /** @param {number} index */
    const runAttempt = async (index) => {
      const prompt = config.generatePrompt(index, buildCtx);
      const runDir = join(BATCH_ROOT, `run-${String(index + 1).padStart(3, "0")}`);
      mkdirSync(runDir, { recursive: true });

      const cliArgs = config.buildCliArgs({ ...buildCtx, prompt, runDir, index });
      const displayCommand = buildDisplayCommand(cliArgs);
      const baseRecord = { prompt, runDir };
      const extraBase = config.buildBaseRecord
        ? config.buildBaseRecord({ ...buildCtx, prompt, runDir, index })
        : {};

      return executeSingleCli({
        MAIN_TS,
        CLI_PACKAGE,
        TIMEOUT_MS,
        MAX_LOG_CAPTURE,
        index,
        displayCommand,
        cliArgs,
        baseRecord: { ...baseRecord, ...extraBase },
        ...(extraBase.asrOutPath ? { asrOutPath: extraBase.asrOutPath } : {}),
        ...(extraBase.readFileOptional ? { readFileOptional: extraBase.readFileOptional } : {}),
        parseStdout: config.parseStdout,
      });
    };

    // Banner
    if (config.printBanner) {
      config.printBanner({
        COUNT,
        CONCURRENCY,
        CONCURRENCY_EXPLICIT,
        MODEL,
        TIMEOUT_MS,
        CLI_TIMEOUT_SEC,
        POLL_INTERVAL,
        MAX_RETRIES,
        RETRY_BASE_MS,
        RATE_LIMIT_MAX,
        RATE_LIMIT_WINDOW_MS,
        DISABLE_RATE_LIMIT,
        CLI_PACKAGE,
        BATCH_ROOT,
        fixtureRef,
        extraParams,
      });
    } else {
      const startedAtIso = new Date().toISOString();
      console.error(`批量压测（${canonical}）`);
      console.error(`  任务数: ${COUNT}`);
      console.error(`  并发数: ${CONCURRENCY}${CONCURRENCY_EXPLICIT ? "" : "（配置文件/默认）"}`);
      console.error(`  模型: ${MODEL}`);
      if (POLL_INTERVAL != null) console.error(`  轮询间隔: ${POLL_INTERVAL}s`);
      console.error(
        `  任务下发限流: ${DISABLE_RATE_LIMIT ? "已关闭" : `${RATE_LIMIT_MAX} 次 / ${RATE_LIMIT_WINDOW_MS}ms`}`,
      );
      console.error(`  限流重试: 最多 ${MAX_RETRIES} 次，基数 ${RETRY_BASE_MS}ms`);
      console.error(`  CLI 超时: ${CLI_TIMEOUT_SEC}s`);
      console.error(`  输出: ${BATCH_ROOT}`);
      console.error(`  开始: ${startedAtIso}`);
      console.error("");
    }

    // Pool execution
    const startedAt = Date.now();
    const onTaskDone = createIncrementalWriter(BATCH_ROOT);
    const results = await runPool(
      COUNT,
      CONCURRENCY,
      (i) =>
        runOneWithRetries({
          index: i,
          rateLimiter,
          maxRetries: MAX_RETRIES,
          retryBaseMs: RETRY_BASE_MS,
          runAttempt,
        }),
      { onTaskDone },
    );

    process.stderr.write("\n");
    logReportStep("所有任务已结束，开始生成报告…");

    const finishedAt = Date.now();
    const reportMeta = {
      startedAt,
      finishedAt,
      finishedAtIso: new Date(finishedAt).toISOString(),
      concurrency: CONCURRENCY,
      model: MODEL,
      pollInterval: POLL_INTERVAL,
      timeoutMs: TIMEOUT_MS,
      rateLimitLabel: `${RATE_LIMIT_MAX} 次 / ${RATE_LIMIT_WINDOW_MS}ms`,
      rateLimitDisabled: DISABLE_RATE_LIMIT,
      maxRetries: MAX_RETRIES,
      retryBaseMs: RETRY_BASE_MS,
      cliPackage: CLI_PACKAGE,
      batchRoot: BATCH_ROOT,
    };

    if (config.extraReportMeta) {
      const extra = config.extraReportMeta({ ...buildCtx, fixtureRef });
      if (extra.extraMdLines) reportMeta.extraMdLines = extra.extraMdLines;
      if (extra.extraHtmlMeta) reportMeta.extraHtmlMeta = extra.extraHtmlMeta;
    }

    return finishStressRun({
      batchRoot: BATCH_ROOT,
      results,
      reportMeta,
      reportSpec: config.reportSpec,
      ctx: { ...ctx, canonicalTarget: canonical },
    });
  };
}

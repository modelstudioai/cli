/**
 * 全量压测套件：支持分阶段并行（默认）和顺序执行（--sequential）。
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MONOREPO_ROOT } from "./paths.mjs";
import { STRESS_SUITE_ORDER, SUITE_PHASES, TARGET_DISPLAY_NAMES } from "./suite-catalog.mjs";
import { writeSuiteReports } from "./suite-report.mjs";
import { generateCombinedFixtures } from "./suite-fixtures.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGETS_DIR = join(__dirname, "..", "targets");

function formatSuiteTimestamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * 运行单个 target 并返回摘要（不 throw）。
 */
async function runSingleTarget(item, { globals, forwarded, suiteRoot }) {
  const displayName = TARGET_DISPLAY_NAMES[item.canonical] ?? item.canonical;
  const modHref = pathToFileURL(join(TARGETS_DIR, item.file)).href;
  const mod = await import(modHref);
  const caseStarted = Date.now();

  try {
    const result = await mod.runStress(forwarded, {
      canonicalTarget: item.canonical,
      displayName,
      globals,
      noExit: true,
      reportDirOverride: join(suiteRoot, item.canonical),
    });

    const wallClockMs = Date.now() - caseStarted;

    if (result?.skipped) {
      return { displayName, canonicalTarget: item.canonical, wallClockMs, skipped: true };
    }

    if (result == null || typeof result.exitCode !== "number") {
      return {
        displayName,
        canonicalTarget: item.canonical,
        wallClockMs,
        exitCode: 1,
        failCount: 1,
        successCount: 0,
        count: 0,
        error: "runStress 未返回 exitCode",
      };
    }

    return { ...result, displayName, canonicalTarget: item.canonical, wallClockMs };
  } catch (err) {
    return {
      displayName,
      canonicalTarget: item.canonical,
      wallClockMs: Date.now() - caseStarted,
      exitCode: 1,
      failCount: 1,
      successCount: 0,
      count: 0,
      error: String(/** @type {Error} */ (err).message ?? err),
    };
  }
}

/**
 * 并行模式（默认）：Phase 0 生成共享 fixtures → Phase 1 并行 → Phase 2 并行。
 */
export async function runStressSuite({ globals, forwarded }) {
  if (globals.sequential) {
    return runStressSuiteSequential({ globals, forwarded });
  }

  if (globals.setupOnly) {
    console.error("全量压测模式不支持 --setup-only，请对单个 target 运行，例如：");
    console.error("  pnpm run test:stress -- image-edit --setup-only");
    process.exit(1);
  }

  const suiteStarted = Date.now();
  const ts = formatSuiteTimestamp();
  const suiteRoot = join(MONOREPO_ROOT, "test", "output", `stress-suite-${ts}`);
  mkdirSync(suiteRoot, { recursive: true });

  console.error(`[全量压测] 模式: 并行`);
  console.error(`[全量压测] 输出根目录: ${suiteRoot}`);

  // Phase 0: 生成共享前置资源
  console.error("");
  console.error("========== [Phase 0] 生成共享前置资源 ==========");
  let sharedFixturesDir;
  try {
    sharedFixturesDir = await generateCombinedFixtures({ suiteRoot, cliPackage: undefined });
  } catch (err) {
    console.error(`[全量压测] 共享前置资源生成失败: ${err.message}`);
    process.exit(1);
  }

  const summaries = [];
  let passedCases = 0;
  let failedCases = 0;
  let skippedCases = 0;

  for (const phase of SUITE_PHASES) {
    console.error("");
    console.error(`========== ${phase.label} (${phase.targets.length} targets, 并行) ==========`);

    const phasePromises = phase.targets.map((item) => {
      const phaseGlobals = { ...globals, fixturesDir: sharedFixturesDir };
      return runSingleTarget(item, {
        globals: phaseGlobals,
        forwarded,
        suiteRoot,
      });
    });

    const phaseResults = await Promise.allSettled(phasePromises);

    for (const settled of phaseResults) {
      const summary =
        settled.status === "fulfilled"
          ? settled.value
          : {
              displayName: "unknown",
              canonicalTarget: "unknown",
              wallClockMs: 0,
              exitCode: 1,
              failCount: 1,
              successCount: 0,
              count: 0,
              error: String(settled.reason),
            };

      if (summary.skipped) {
        skippedCases++;
        console.error(`  [跳过] ${summary.displayName}`);
        continue;
      }

      summaries.push(summary);

      if (summary.exitCode !== 0 || summary.hadFailures) {
        failedCases++;
        console.error(`  [失败] ${summary.displayName}`);
      } else {
        passedCases++;
        console.error(`  [通过] ${summary.displayName}`);
      }
    }
  }

  const suiteFinished = Date.now();
  const meta = {
    suiteRoot,
    startedAt: suiteStarted,
    finishedAt: suiteFinished,
    finishedAtIso: new Date(suiteFinished).toISOString(),
    wallClockMs: suiteFinished - suiteStarted,
    passedCases,
    failedCases,
    skippedCases,
  };

  const paths = writeSuiteReports(suiteRoot, summaries, meta);

  console.error("");
  console.error("========== 全量压测完成 ==========");
  console.error(
    `用例: 成功 ${passedCases} / 失败 ${failedCases} / 跳过 ${skippedCases} / 共 ${SUITE_PHASES.reduce((n, p) => n + p.targets.length, 0)}`,
  );
  console.error(`墙钟总耗时: ${((suiteFinished - suiteStarted) / 1000).toFixed(1)}s`);
  console.error(`全量压测报告 Markdown: ${paths.reportPath}`);
  console.error(`全量压测报告 HTML: ${paths.reportHtmlPath}`);
  console.error(`全量压测报告 JSON: ${paths.jsonPath}`);

  process.exit(0);
}

/**
 * 顺序模式（--sequential）：逐个执行全部用例。
 */
async function runStressSuiteSequential({ globals, forwarded }) {
  if (globals.setupOnly) {
    console.error("全量压测模式不支持 --setup-only，请对单个 target 运行，例如：");
    console.error("  pnpm run test:stress -- image-edit --setup-only");
    process.exit(1);
  }

  const suiteStarted = Date.now();
  const ts = formatSuiteTimestamp();
  const suiteRoot = join(MONOREPO_ROOT, "test", "output", `stress-suite-${ts}`);
  mkdirSync(suiteRoot, { recursive: true });

  console.error(`[全量压测] 模式: 顺序`);
  console.error(`[全量压测] 输出根目录: ${suiteRoot}`);
  console.error(`[全量压测] 将顺序执行 ${STRESS_SUITE_ORDER.length} 个用例…`);

  const summaries = [];
  let passedCases = 0;
  let failedCases = 0;
  let skippedCases = 0;

  for (const item of STRESS_SUITE_ORDER) {
    const displayName = TARGET_DISPLAY_NAMES[item.canonical] ?? item.canonical;
    console.error("");
    console.error(`========== [${displayName}] (${item.canonical}) [全量压测] ==========`);

    const summary = await runSingleTarget(item, { globals, forwarded, suiteRoot });

    if (summary.skipped) {
      skippedCases++;
      console.error(`[全量压测] 跳过: ${displayName}`);
      continue;
    }

    summaries.push(summary);

    if (summary.exitCode !== 0 || summary.hadFailures) {
      failedCases++;
    } else {
      passedCases++;
    }
  }

  const suiteFinished = Date.now();
  const meta = {
    suiteRoot,
    startedAt: suiteStarted,
    finishedAt: suiteFinished,
    finishedAtIso: new Date(suiteFinished).toISOString(),
    wallClockMs: suiteFinished - suiteStarted,
    passedCases,
    failedCases,
    skippedCases,
  };

  const paths = writeSuiteReports(suiteRoot, summaries, meta);

  console.error("");
  console.error("========== 全量压测完成 ==========");
  console.error(
    `用例: 成功 ${passedCases} / 失败 ${failedCases} / 跳过 ${skippedCases} / 共 ${STRESS_SUITE_ORDER.length}`,
  );
  console.error(`墙钟总耗时: ${((suiteFinished - suiteStarted) / 1000).toFixed(1)}s`);
  console.error(`全量压测报告 Markdown: ${paths.reportPath}`);
  console.error(`全量压测报告 HTML: ${paths.reportHtmlPath}`);
  console.error(`全量压测报告 JSON: ${paths.jsonPath}`);

  process.exit(0);
}

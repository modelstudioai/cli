/**
 * 压测收尾：写报告、打印路径；套件模式下返回摘要而不 process.exit。
 */
import { writeStressReports } from "./report.mjs";
import { TARGET_DISPLAY_NAMES } from "./suite-catalog.mjs";
import { IncrementalWriter } from "./incremental-writer.mjs";

/**
 * 创建增量写入器，返回可直接传给 runPool opts.onTaskDone 的回调。
 * @param {string} batchRoot
 */
export function createIncrementalWriter(batchRoot) {
  const writer = new IncrementalWriter(batchRoot);
  return (result, index) => writer.append(result, index);
}

/**
 * @param {object | undefined} ctx
 * @param {number} exitCode
 * @param {Record<string, unknown>} [extra]
 */
export function stressExit(ctx, exitCode, extra = {}) {
  const payload = { exitCode, ...extra };
  if (ctx?.noExit) return payload;
  process.exit(exitCode);
}

/**
 * @param {object} params
 * @param {string} params.batchRoot
 * @param {object[]} params.results
 * @param {object} params.reportMeta 需含 startedAt / finishedAt / finishedAtIso
 * @param {object} params.reportSpec
 * @param {object} [params.ctx]
 */
export function finishStressRun({ batchRoot, results, reportMeta, reportSpec, ctx }) {
  const { reportPath, reportHtmlPath, jsonPath } = writeStressReports(
    batchRoot,
    results,
    reportMeta,
    reportSpec,
  );

  const successCount = results.filter((r) => r.status === "success").length;
  const failCount = results.length - successCount;
  const successRate = results.length > 0 ? successCount / results.length : 0;
  /** 报告用：是否存在失败任务（不用于进程退出码） */
  const hadFailures = failCount > 0;

  const canonical = ctx?.canonicalTarget ?? "unknown";
  const displayName = ctx?.displayName ?? TARGET_DISPLAY_NAMES[canonical] ?? canonical;

  console.error("");
  console.error(
    `完成 [${displayName}]: 成功 ${successCount} / 失败 ${failCount} / 共 ${results.length}`,
  );
  console.error(`报告 Markdown: ${reportPath}`);
  console.error(`报告 HTML: ${reportHtmlPath}`);
  console.error(`原始数据: ${jsonPath}`);

  return stressExit(ctx, 0, {
    canonicalTarget: canonical,
    displayName,
    batchRoot,
    startedAt: reportMeta.startedAt,
    finishedAt: reportMeta.finishedAt,
    count: results.length,
    concurrency: reportMeta.concurrency,
    model: reportMeta.model,
    successCount,
    failCount,
    successRate,
    hadFailures,
    exitCode: hadFailures ? 1 : 0,
    reportPath,
    reportHtmlPath,
    jsonPath,
  });
}

/**
 * 压测 Markdown / HTML 报告生成。
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { sanitizeResultForExport } from "./parsers.mjs";

/** 步骤日志 */
export function logReportStep(message) {
  process.stderr.write(`[报告] ${message}\n`);
}

export function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function escapeTableCell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, "<br>");
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {{ cwd: string, command: string }} r */
export function formatFullCommand(r) {
  return `cd ${r.cwd} && ${r.command}`;
}

/** @param {object} r @param {(a: string,b: string,n?: number)=>string} extractError */
/** @param {object} r */
export function formatRequestIdCell(r) {
  return escapeTableCell(r.requestId ?? "—");
}

/** @param {object} r */
export function formatTaskIdCell(r) {
  const raw =
    r.taskId ??
    (Array.isArray(r.taskIds) && r.taskIds.length > 0 ? r.taskIds.join(", ") : undefined);
  return escapeTableCell(raw ?? "—");
}

export function getErrorMessage(r, extractError) {
  const err =
    r.error && r.error !== '"error": {'
      ? r.error
      : extractError(r.stderr ?? "", r.stdout ?? "", r.exitCode);
  const parts = [];
  if (r.exitCode != null && r.exitCode !== 0) {
    parts.push(`exit=${r.exitCode}`);
  }
  parts.push(err || "（未能解析错误信息）");
  return parts.join(" | ");
}

/** @param {object[]} results */
export function computeReportStats(results, meta) {
  const successes = results.filter((r) => r.status === "success");
  const failures = results.filter((r) => r.status === "failed");
  const durations = results.map((r) => r.durationMs);
  const totalMs = meta.finishedAt - meta.startedAt;
  let min = 0;
  let max = 0;
  let avg = 0;
  if (durations.length > 0) {
    min = Math.min(...durations);
    max = Math.max(...durations);
    avg = durations.reduce((a, b) => a + b, 0) / durations.length;
  }
  return { successes, failures, durations, totalMs, min, max, avg };
}

/**
 * @param {object} spec
 * @param {object[]} results 已 sanitize
 * @param {object} meta
 */
export function buildMarkdownReport(spec, results, meta) {
  const { successes, failures, totalMs, min, max, avg } = computeReportStats(results, meta);
  const lines = [];
  lines.push(`# ${spec.titleMd}`);
  lines.push("");
  lines.push(`- **生成时间**: ${meta.finishedAtIso}`);
  lines.push(`- **任务总数**: ${results.length}`);
  lines.push(`- **成功**: ${successes.length}`);
  lines.push(`- **失败**: ${failures.length}`);
  lines.push(`- **并发数**: ${meta.concurrency}`);
  lines.push(`- **模型**: ${meta.model}`);
  if (Array.isArray(meta.extraMdLines)) {
    for (const l of meta.extraMdLines) lines.push(l);
  }
  lines.push(
    `- **任务下发限流**: ${meta.rateLimitLabel}${meta.rateLimitDisabled ? "（已关闭）" : ""}`,
  );
  if (!meta.rateLimitDisabled) {
    lines.push(`- **限流重试**: 最多 ${meta.maxRetries} 次，间隔基数 ${meta.retryBaseMs}ms`);
  }
  if (meta.pollInterval != null) {
    lines.push(`- **轮询间隔**: ${meta.pollInterval}s`);
  }
  if (meta.timeoutMs != null) {
    lines.push(`- **CLI 超时**: ${formatDuration(meta.timeoutMs)}`);
  }
  lines.push(`- **工作目录**: \`${meta.cliPackage}\``);
  lines.push(`- **输出根目录**: \`${meta.batchRoot}\``);
  lines.push(`- **墙钟总耗时**: ${formatDuration(totalMs)}`);
  if (results.length > 0) {
    lines.push(
      `- **单任务耗时**: 最短 ${formatDuration(min)} / 最长 ${formatDuration(max)} / 平均 ${formatDuration(avg)}`,
    );
  }
  lines.push("");
  lines.push("## 明细");
  lines.push("");
  lines.push(
    `| # | 状态 | 耗时 | Request ID | Task ID | ${spec.promptColumnMd} | 完整命令 | ${spec.outcomeColumnMd} |`,
  );
  lines.push("|---|------|------|------------|---------|---------|----------|-----------|");
  for (const r of results) {
    const status = r.status === "success" ? "✅ 成功" : "❌ 失败";
    lines.push(
      `| ${r.index} | ${status} | ${r.durationSec}s | ${formatRequestIdCell(r)} | ${formatTaskIdCell(r)} | ${escapeTableCell(r.prompt)} | ${escapeTableCell(formatFullCommand(r))} | ${spec.formatOutcomeMd(r)} |`,
    );
  }
  return lines.join("\n");
}

/**
 * @param {object} spec
 */
export function buildHtmlReport(spec, results, meta) {
  const { successes, failures, totalMs, min, max, avg } = computeReportStats(results, meta);

  const rows = results
    .map((r) => {
      const statusClass = r.status === "success" ? "status-ok" : "status-fail";
      const statusLabel = r.status === "success" ? "成功" : "失败";
      return `<tr class="${statusClass}">
  <td>${r.index}</td>
  <td><span class="badge ${statusClass}">${statusLabel}</span></td>
  <td>${escapeHtml(r.durationSec)}s</td>
  <td class="col-trace"><code>${escapeHtml(r.requestId ?? "—")}</code></td>
  <td class="col-trace"><code>${escapeHtml(
    r.taskId ??
      (Array.isArray(r.taskIds) && r.taskIds.length > 0 ? r.taskIds.join(", ") : "—") ??
      "—",
  )}</code></td>
  <td class="col-prompt">${escapeHtml(r.prompt)}</td>
  <td class="col-cmd"><code>${escapeHtml(formatFullCommand(r))}</code></td>
  <td class="col-outcome">${spec.formatOutcomeHtml(r)}</td>
</tr>`;
    })
    .join("\n");

  const extraMeta = meta.extraHtmlMeta ? escapeHtml(meta.extraHtmlMeta) : "";

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(spec.titleHtml)}</title>
  <style>
    :root {
      --bg: #f6f7f9; --card: #fff; --text: #1a1a1a; --muted: #666; --border: #e5e7eb;
      --ok: #0d7d4d; --ok-bg: #e8f7ef; --fail: #c41e3a; --fail-bg: #fdecee;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
      background: var(--bg); color: var(--text); line-height: 1.5; }
    .wrap { max-width: 100%; padding: 24px; }
    h1 { margin: 0 0 8px; font-size: 1.5rem; }
    .meta { color: var(--muted); font-size: 0.875rem; margin-bottom: 20px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; margin-bottom: 24px; }
    .stat { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; }
    .stat label { display: block; font-size: 0.75rem; color: var(--muted); }
    .stat strong { font-size: 1.25rem; }
    .stat.ok strong { color: var(--ok); }
    .stat.fail strong { color: var(--fail); }
    .table-wrap { background: var(--card); border: 1px solid var(--border); border-radius: 8px; overflow: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
    th, td { border-bottom: 1px solid var(--border); padding: 10px 12px; text-align: left; vertical-align: top; }
    th { position: sticky; top: 0; background: #f0f1f3; font-weight: 600; white-space: nowrap; }
    tr:last-child td { border-bottom: none; }
    tr.status-fail { background: var(--fail-bg); }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
    .badge.status-ok { background: var(--ok-bg); color: var(--ok); }
    .badge.status-fail { background: var(--fail-bg); color: var(--fail); }
    .col-prompt { max-width: 220px; word-break: break-word; }
    .col-cmd { max-width: 360px; }
    .col-cmd code { display: block; white-space: pre-wrap; word-break: break-all; font-size: 0.75rem;
      background: #f4f4f5; padding: 6px 8px; border-radius: 4px; }
    .col-outcome { max-width: 340px; }
    .url-link { font-size: 0.7rem; word-break: break-all; color: #2563eb; }
    .outcome-error { color: var(--fail); word-break: break-word; }
    code.path { font-size: 0.7rem; word-break: break-all; }
    .outcome-success img { display: block; max-width: 160px; max-height: 160px; border-radius: 4px; border: 1px solid var(--border); margin-bottom: 4px; }
    .meta-inline { font-size: 0.75rem; color: var(--muted); }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>${escapeHtml(spec.titleHtml)}</h1>
    <p class="meta">生成时间：${escapeHtml(meta.finishedAtIso)} · 模型：${escapeHtml(meta.model)} · 并发：${meta.concurrency}${extraMeta}</p>
    <div class="stats">
      <div class="stat"><label>任务总数</label><strong>${results.length}</strong></div>
      <div class="stat ok"><label>成功</label><strong>${successes.length}</strong></div>
      <div class="stat fail"><label>失败</label><strong>${failures.length}</strong></div>
      <div class="stat"><label>墙钟总耗时</label><strong>${escapeHtml(formatDuration(totalMs))}</strong></div>
      <div class="stat"><label>单任务最短</label><strong>${escapeHtml(formatDuration(min))}</strong></div>
      <div class="stat"><label>单任务最长</label><strong>${escapeHtml(formatDuration(max))}</strong></div>
      <div class="stat"><label>单任务平均</label><strong>${escapeHtml(formatDuration(avg))}</strong></div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th><th>状态</th><th>耗时</th><th>Request ID</th><th>Task ID</th><th>${escapeHtml(spec.promptColumnHtml)}</th><th>完整命令</th><th>${escapeHtml(spec.outcomeColumnHtml)}</th>
          </tr>
        </thead>
        <tbody>
${rows}
        </tbody>
      </table>
    </div>
    <p class="meta" style="margin-top:16px">输出目录：${escapeHtml(meta.batchRoot)} · 轮询间隔 ${meta.pollInterval != null ? escapeHtml(String(meta.pollInterval)) : "—"}s · CLI 超时 ${meta.timeoutMs != null ? escapeHtml(formatDuration(meta.timeoutMs)) : "—"}</p>
  </div>
</body>
</html>`;
}

/**
 * @param {string} batchRoot
 * @param {object[]} results 原始任务结果（会先 sanitize）
 * @param {object} reportMeta
 * @param {object} reportSpec outcome / title 定义
 */
export function writeStressReports(batchRoot, results, reportMeta, reportSpec) {
  logReportStep(`共 ${results.length} 条结果，正在精简并生成报告…`);

  const exportResults = results.map(sanitizeResultForExport);

  logReportStep("生成 Markdown…");
  const reportMd = buildMarkdownReport(reportSpec, exportResults, reportMeta);

  logReportStep("生成 HTML…");
  const reportHtml = buildHtmlReport(reportSpec, exportResults, reportMeta);

  const reportPath = join(batchRoot, "REPORT.md");
  const reportHtmlPath = join(batchRoot, "REPORT.html");
  const jsonPath = join(batchRoot, "results.json");

  writeFileSync(reportPath, reportMd, "utf8");
  writeFileSync(reportHtmlPath, reportHtml, "utf8");
  writeFileSync(jsonPath, JSON.stringify(exportResults, null, 2), "utf8");

  logReportStep("报告已全部写入");

  return { reportPath, reportHtmlPath, jsonPath };
}

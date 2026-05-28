/**
 * 全量压测套件总报告。
 */
import { writeFileSync } from "fs";
import { join } from "path";
import { formatDuration, escapeHtml, escapeTableCell } from "./report.mjs";

/**
 * @param {number} rate 0–1
 */
export function formatSuccessRate(rate) {
  if (!Number.isFinite(rate)) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

/**
 * @param {string} suiteRoot
 * @param {object[]} rows 各用例 finishStressRun 返回的摘要
 * @param {object} meta
 */
export function writeSuiteReports(suiteRoot, rows, meta) {
  const md = buildSuiteMarkdown(rows, meta);
  const html = buildSuiteHtml(rows, meta);
  const json = JSON.stringify({ meta, cases: rows }, null, 2);

  const reportPath = join(suiteRoot, "SUITE_REPORT.md");
  const reportHtmlPath = join(suiteRoot, "SUITE_REPORT.html");
  const jsonPath = join(suiteRoot, "suite-results.json");

  writeFileSync(reportPath, md, "utf8");
  writeFileSync(reportHtmlPath, html, "utf8");
  writeFileSync(jsonPath, json, "utf8");

  return { reportPath, reportHtmlPath, jsonPath };
}

/**
 * @param {object[]} rows
 * @param {object} meta
 */
function buildSuiteMarkdown(rows, meta) {
  const lines = [];
  lines.push("# 全量压测报告");
  lines.push("");
  lines.push(`- **生成时间**: ${meta.finishedAtIso}`);
  lines.push(`- **用例数**: ${rows.length}`);
  lines.push(`- **套件墙钟耗时**: ${formatDuration(meta.wallClockMs)}`);
  lines.push(`- **输出根目录**: \`${meta.suiteRoot}\``);
  lines.push(
    `- **汇总**: 成功用例 ${meta.passedCases} / 失败用例 ${meta.failedCases} / 跳过 ${meta.skippedCases}`,
  );
  lines.push("");
  lines.push("## 用例汇总");
  lines.push("");
  lines.push("| 用例 | 执行时间 | 任务数 | 并发 | 成功 | 失败 | 成功率 | 详细报告 |");
  lines.push("|------|----------|--------|------|------|------|--------|--------|");
  for (const r of rows) {
    const dur = formatDuration(r.wallClockMs ?? r.finishedAt - r.startedAt ?? 0);
    const sub = r.reportPath ? `\`${r.reportPath}\`` : "—";
    lines.push(
      `| ${escapeTableCell(r.displayName)} | ${dur} | ${r.count ?? "—"} | ${r.concurrency ?? "—"} | ${r.successCount ?? "—"} | ${r.failCount ?? "—"} | ${formatSuccessRate(r.successRate)} | ${sub} |`,
    );
  }
  return lines.join("\n");
}

/**
 * @param {object[]} rows
 * @param {object} meta
 */
function buildSuiteHtml(rows, meta) {
  const tableRows = rows
    .map((r) => {
      const dur = formatDuration(r.wallClockMs ?? r.finishedAt - r.startedAt ?? 0);
      const sub = r.reportPath
        ? `<a href="${escapeHtml(r.reportPath)}">${escapeHtml(r.reportPath)}</a>`
        : "—";
      const failClass = (r.failCount ?? 0) > 0 ? "status-fail" : "";
      return `<tr class="${failClass}">
  <td>${escapeHtml(r.displayName)}</td>
  <td>${escapeHtml(dur)}</td>
  <td>${r.count ?? "—"}</td>
  <td>${r.concurrency ?? "—"}</td>
  <td>${r.successCount ?? "—"}</td>
  <td>${r.failCount ?? "—"}</td>
  <td>${escapeHtml(formatSuccessRate(r.successRate))}</td>
  <td class="col-sub">${sub}</td>
</tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>全量压测报告</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
      margin: 24px; background: #f6f7f9; color: #1a1a1a; }
    h1 { font-size: 1.5rem; }
    .meta { color: #666; font-size: 0.875rem; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; background: #fff; font-size: 0.8125rem; }
    th, td { border: 1px solid #e5e7eb; padding: 10px 12px; text-align: left; vertical-align: top; }
    th { background: #f0f1f3; }
    tr.status-fail { background: #fdecee; }
    .col-sub { max-width: 420px; word-break: break-all; font-size: 0.75rem; }
  </style>
</head>
<body>
  <h1>全量压测报告</h1>
  <p class="meta">生成时间：${escapeHtml(meta.finishedAtIso)} · 墙钟 ${escapeHtml(formatDuration(meta.wallClockMs))} · 目录 ${escapeHtml(meta.suiteRoot)}</p>
  <p class="meta">成功用例 ${meta.passedCases} · 失败用例 ${meta.failedCases} · 跳过 ${meta.skippedCases}</p>
  <table>
    <thead>
      <tr>
        <th>用例</th><th>执行时间</th><th>任务数</th><th>并发</th>
        <th>成功</th><th>失败</th><th>成功率</th><th>详细报告</th>
      </tr>
    </thead>
    <tbody>
${tableRows}
    </tbody>
  </table>
</body>
</html>`;
}

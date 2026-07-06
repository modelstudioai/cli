#!/usr/bin/env node
/**
 * `video edit` 视频编辑并发压测；依赖前置短视频 fixtures。
 */
import { join } from "node:path";
import { defineStressTarget } from "../lib/define-stress-target.mjs";
import { parseVideoResult, extractError } from "../lib/parsers.mjs";
import { escapeHtml, escapeTableCell, getErrorMessage } from "../lib/report.mjs";
import { optFrom } from "../lib/argv-parse.mjs";

const edits = [
  "将整体画面转为柔和的水彩风格。",
  "增强色彩饱和度，保持镜头稳定。",
  "加入轻微电影宽银幕暗角效果。",
];

export const runStress = defineStressTarget({
  canonical: "video-edit",
  defaultModel: "happyhorse-1.0-video-edit",
  batchDirPrefix: "video-edit-batch",
  helpText: "pnpm run test:stress -- video-edit [--reuse-fixtures] -- --count 5 -c 2",

  defaultTimeoutMs: 3_600_000,
  minTimeoutMs: 60_000,
  defaultRateLimitMax: 10,
  defaultRateLimitWindowMs: 1000,
  defaultRetryBaseMs: 15000,
  defaultMaxRetries: 2,
  hasPollInterval: true,
  defaultPollInterval: 15,

  fixtureKind: "video",
  fixtureSetupTimeoutMs: 600_000,
  videoSetupTimeoutMs: 3_600_000,
  resolveFixtureRef: (prerequisites) =>
    prerequisites.video?.video_url || prerequisites.video?.saved,
  fixtureRefErrorMessage: "前置 manifest 缺少输入视频",

  extraParams: (ARGV) => ({
    DURATION: Math.max(2, Math.min(10, parseInt(optFrom(ARGV, "DURATION") ?? "5", 10) || 5)),
  }),

  generatePrompt: (idx) => `${edits[idx % edits.length]} [#edit-${idx}]`,

  buildCliArgs: ({
    MODEL,
    prompt,
    runDir,
    fixtureRef,
    CLI_TIMEOUT_SEC,
    POLL_INTERVAL,
    extraParams,
    index,
  }) => [
    "video",
    "edit",
    "--model",
    MODEL,
    "--video",
    String(fixtureRef),
    "--prompt",
    prompt,
    "--download",
    join(runDir, `edited_${String(index + 1).padStart(3, "0")}.mp4`),
    "--duration",
    String(extraParams.DURATION),
    "--output",
    "json",
    "--timeout",
    String(CLI_TIMEOUT_SEC),
    "--poll-interval",
    String(POLL_INTERVAL),
  ],

  buildBaseRecord: ({ runDir, index }) => ({
    downloadPath: join(runDir, `edited_${String(index + 1).padStart(3, "0")}.mp4`),
  }),

  parseStdout: (stdout) => Promise.resolve(parseVideoResult(stdout)),

  extraReportMeta: ({ fixtureRef, extraParams }) => ({
    extraMdLines: [
      `- **源视频**: ${String(fixtureRef)}`,
      `- **输出时长**: ${extraParams.DURATION}s`,
    ],
    extraHtmlMeta: ` · edit · ${extraParams.DURATION}s`,
  }),

  reportSpec: {
    titleMd: "视频编辑批量压测报告（video edit）",
    titleHtml: "视频编辑批量压测报告（video edit）",
    promptColumnMd: "编辑指令",
    promptColumnHtml: "编辑指令",
    outcomeColumnMd: "输出视频 / 错误",
    outcomeColumnHtml: "输出视频 / 错误",
    formatOutcomeMd: (r) => {
      if (r.status === "success") {
        const lines = [];
        if (r.videoUrls?.length) lines.push(...r.videoUrls.map((u) => escapeTableCell(u)));
        if (r.saved?.length) lines.push(...r.saved.map((p) => escapeTableCell(`(本地) ${p}`)));
        return lines.length ? lines.join("<br>") : "—";
      }
      return escapeTableCell(getErrorMessage(r, extractError));
    },
    formatOutcomeHtml: (r) => {
      if (r.status === "success") {
        const parts = [];
        if (r.videoUrls?.length) {
          for (const url of r.videoUrls) {
            const safe = escapeHtml(url);
            parts.push(
              `<div class="outcome-success"><a class="url-link" href="${safe}" target="_blank" rel="noopener">${safe}</a></div>`,
            );
          }
        }
        if (r.saved?.length) {
          for (const p of r.saved) parts.push(`<code class="path">${escapeHtml(p)}</code>`);
        }
        return parts.length ? parts.join("") : "—";
      }
      return `<span class="outcome-error">${escapeHtml(getErrorMessage(r, extractError))}</span>`;
    },
  },
});

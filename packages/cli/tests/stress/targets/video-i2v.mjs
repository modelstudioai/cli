#!/usr/bin/env node
/**
 * `video generate` 图生视频（--image）并发压测。
 */
import { join } from "node:path";
import { defineStressTarget } from "../lib/define-stress-target.mjs";
import { parseVideoResult, extractError } from "../lib/parsers.mjs";
import { escapeHtml, escapeTableCell, getErrorMessage } from "../lib/report.mjs";
import { optFrom } from "../lib/argv-parse.mjs";

const motions = [
  "让画面主体微微晃动，云层缓慢流动。",
  "镜头缓缓推进，保持画面稳定。",
  "风轻拂树叶，光影缓慢变化。",
];

export const runStress = defineStressTarget({
  canonical: "video-i2v",
  defaultModel: "wan3.0-video",
  batchDirPrefix: "video-i2v-batch",
  helpText: "pnpm run test:stress -- video-i2v [--reuse-fixtures] -- --count 5 -c 2",

  defaultTimeoutMs: 3_600_000,
  minTimeoutMs: 60_000,
  defaultRateLimitMax: 10,
  defaultRateLimitWindowMs: 1000,
  defaultRetryBaseMs: 8000,
  defaultMaxRetries: 3,
  hasPollInterval: true,
  defaultPollInterval: 5,

  fixtureKind: "image",
  fixtureSetupTimeoutMs: 600_000,
  videoSetupTimeoutMs: 3_600_000,
  resolveFixtureRef: (prerequisites) =>
    prerequisites.image?.primaryUrl ||
    prerequisites.image?.urls?.[0] ||
    prerequisites.image?.saved?.[0],
  fixtureRefErrorMessage: "前置 manifest 缺少图片",

  extraParams: (ARGV) => ({
    DURATION: Math.max(1, parseInt(optFrom(ARGV, "DURATION") ?? "5", 10) || 5),
  }),

  generatePrompt: (idx) => `${motions[idx % motions.length]} [#i2v-${idx}]`,

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
    "generate",
    "--model",
    MODEL,
    "--image",
    String(fixtureRef),
    "--prompt",
    prompt,
    "--download",
    join(runDir, `video_${String(index + 1).padStart(3, "0")}.mp4`),
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
    downloadPath: join(runDir, `video_${String(index + 1).padStart(3, "0")}.mp4`),
  }),

  parseStdout: (stdout) => Promise.resolve(parseVideoResult(stdout)),

  extraReportMeta: ({ fixtureRef, extraParams }) => ({
    extraMdLines: [
      `- **首帧图**: ${String(fixtureRef)}`,
      `- **单段时长**: ${extraParams.DURATION}s`,
    ],
    extraHtmlMeta: ` · i2v · ${extraParams.DURATION}s`,
  }),

  reportSpec: {
    titleMd: "图生视频批量压测报告（video generate i2v）",
    titleHtml: "图生视频批量压测报告（video generate i2v）",
    promptColumnMd: "Prompt",
    promptColumnHtml: "Prompt",
    outcomeColumnMd: "视频 / 错误",
    outcomeColumnHtml: "视频 / 错误",
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

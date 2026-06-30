#!/usr/bin/env node
/**
 * `video ref` 参考生视频并发压测；使用前置图片。
 */
import { join } from "node:path";
import { defineStressTarget } from "../lib/define-stress-target.mjs";
import { parseVideoResult, extractError } from "../lib/parsers.mjs";
import { escapeHtml, escapeTableCell, getErrorMessage } from "../lib/report.mjs";
import { optFrom } from "../lib/argv-parse.mjs";

const prompts = [
  "图1在草地上缓慢行走，远景静态镜头。",
  "图1微微转头望向镜头，背景保持稳定。",
  "图1在柔和光线下眨眼，微风拂动发丝。",
];

export const runStress = defineStressTarget({
  canonical: "video-ref",
  defaultModel: "happyhorse-1.1-r2v",
  batchDirPrefix: "video-ref-batch",
  helpText: "pnpm run test:stress -- video-ref [--reuse-fixtures] -- --count 5 -c 2",

  defaultTimeoutMs: 3_600_000,
  minTimeoutMs: 60_000,
  defaultRateLimitMax: 10,
  defaultRateLimitWindowMs: 1000,
  defaultRetryBaseMs: 15000,
  defaultMaxRetries: 2,
  hasPollInterval: true,
  defaultPollInterval: 15,

  fixtureKind: "image",
  fixtureSetupTimeoutMs: 600_000,
  videoSetupTimeoutMs: 3_600_000,
  resolveFixtureRef: (prerequisites) =>
    prerequisites.image?.primaryUrl ||
    prerequisites.image?.urls?.[0] ||
    prerequisites.image?.saved?.[0],
  fixtureRefErrorMessage: "前置 manifest 缺少参考图",

  extraParams: (ARGV) => ({
    DURATION: Math.max(2, Math.min(10, parseInt(optFrom(ARGV, "DURATION") ?? "5", 10) || 5)),
  }),

  generatePrompt: (idx) => `${prompts[idx % prompts.length]} [#r2v-${idx}]`,

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
    "ref",
    "--model",
    MODEL,
    "--prompt",
    prompt,
    "--image",
    String(fixtureRef),
    "--download",
    join(runDir, `ref_${String(index + 1).padStart(3, "0")}.mp4`),
    "--duration",
    String(extraParams.DURATION),
    "--non-interactive",
    "--output",
    "json",
    "--timeout",
    String(CLI_TIMEOUT_SEC),
    "--poll-interval",
    String(POLL_INTERVAL),
  ],

  buildBaseRecord: ({ runDir, index }) => ({
    downloadPath: join(runDir, `ref_${String(index + 1).padStart(3, "0")}.mp4`),
  }),

  parseStdout: (stdout) => Promise.resolve(parseVideoResult(stdout)),

  extraReportMeta: ({ fixtureRef, extraParams }) => ({
    extraMdLines: [`- **参考图**: ${String(fixtureRef)}`, `- **时长**: ${extraParams.DURATION}s`],
    extraHtmlMeta: ` · ref · ${extraParams.DURATION}s`,
  }),

  reportSpec: {
    titleMd: "参考生视频批量压测报告（video ref）",
    titleHtml: "参考生视频批量压测报告（video ref）",
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

#!/usr/bin/env node
/**
 * `video generate` 文本生视频并发压测。
 */
import { join } from "node:path";
import { defineStressTarget } from "../lib/define-stress-target.mjs";
import { parseVideoResult, extractError } from "../lib/parsers.mjs";
import { escapeHtml, escapeTableCell, getErrorMessage } from "../lib/report.mjs";
import { optFrom } from "../lib/argv-parse.mjs";

const subjects = [
  "一只橘猫",
  "一位宇航员",
  "一片海浪",
  "一座古城",
  "一辆复古汽车",
  "一位舞者在舞台上",
  "一片樱花飘落",
  "一座雪山",
  "一条街道",
  "一只飞鸟",
];
const motions = [
  "缓缓转头看向镜头",
  "在微风中轻轻摇摆",
  "从远处向镜头走来",
  "镜头缓慢推进",
  "光影随日落变化",
  "静态镜头，细微自然运动",
  "镜头环绕半圈",
  "雨滴落下，水面泛起涟漪",
];
const styles = [
  "电影感写实",
  "日系清新",
  "赛博朋克霓虹",
  "水墨意境",
  "纪录片风格",
  "慢动作",
  "暖色调",
  "冷色调悬疑",
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const runStress = defineStressTarget({
  canonical: "video-t2v",
  defaultModel: "happyhorse-1.0-t2v",
  batchDirPrefix: "video-t2v-batch",
  helpText: `用法：pnpm run test:stress -- video-t2v -- --concurrency 1 --count 3
详见 docs/agents/stress-batch-tests.md`,

  defaultTimeoutMs: 3_600_000,
  minTimeoutMs: 60_000,
  defaultRateLimitMax: 10,
  defaultRateLimitWindowMs: 1000,
  defaultRetryBaseMs: 5000,
  defaultMaxRetries: 3,
  hasPollInterval: true,
  defaultPollInterval: 5,

  extraParams: (ARGV) => ({
    DURATION: Math.max(1, parseInt(optFrom(ARGV, "DURATION") ?? "5", 10) || 5),
  }),

  generatePrompt: (index) => {
    const seed = `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
    return `${pick(subjects)}，${pick(motions)}，${pick(styles)} [#${seed.slice(-6)}]`;
  },

  buildCliArgs: ({ MODEL, prompt, runDir, CLI_TIMEOUT_SEC, POLL_INTERVAL, extraParams, index }) => [
    "video",
    "generate",
    "--model",
    MODEL,
    "--prompt",
    prompt,
    "--download",
    join(runDir, `video_${String(index + 1).padStart(3, "0")}.mp4`),
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

  buildBaseRecord: ({ runDir, index, extraParams }) => ({
    downloadPath: join(runDir, `video_${String(index + 1).padStart(3, "0")}.mp4`),
  }),

  parseStdout: (stdout) => Promise.resolve(parseVideoResult(stdout)),

  extraReportMeta: ({ extraParams }) => ({
    extraMdLines: [`- **单段时长**: ${extraParams.DURATION}s`],
    extraHtmlMeta: ` · 单段时长 ${extraParams.DURATION}s`,
  }),

  reportSpec: {
    titleMd: "视频文本生批量压测报告（video-t2v）",
    titleHtml: "视频文本生批量压测报告（video-t2v）",
    promptColumnMd: "Prompt",
    promptColumnHtml: "Prompt",
    outcomeColumnMd: "视频地址 / 错误信息",
    outcomeColumnHtml: "视频地址 / 错误信息",
    formatOutcomeMd: (r) => {
      if (r.status === "success") {
        const lines = [];
        if (r.videoUrls?.length) lines.push(...r.videoUrls.map((u) => escapeTableCell(u)));
        if (r.saved?.length) lines.push(...r.saved.map((p) => escapeTableCell(`(本地) ${p}`)));
        if (r.size) lines.push(escapeTableCell(`size: ${r.size}`));
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
        if (r.size)
          parts.push(`<span class="meta-inline">size: ${escapeHtml(String(r.size))}</span>`);
        return parts.length ? parts.join("") : "—";
      }
      return `<span class="outcome-error">${escapeHtml(getErrorMessage(r, extractError))}</span>`;
    },
  },
});

#!/usr/bin/env node
/**
 * `image edit` 并发压测；依赖前置生成的图片 fixtures。
 */
import { defineStressTarget } from "../lib/define-stress-target.mjs";
import { parseImageResult, extractError } from "../lib/parsers.mjs";
import { escapeHtml, escapeTableCell, getErrorMessage } from "../lib/report.mjs";

const instructions = [
  "将整体色调改为暖色夕阳。",
  "增强对比度与细节，保持主体不变。",
  "为画面加入轻微胶片颗粒感。",
  "把背景虚化成浅景深。",
  "转换为黑白照片风格，保留主体清晰度。",
  "将画面调为日系清新色调。",
  "加入柔和的逆光效果。",
  "将背景替换为星空。",
];

export const runStress = defineStressTarget({
  canonical: "image-edit",
  defaultModel: "qwen-image-2.0",
  batchDirPrefix: "image-edit-batch",
  helpText: "pnpm run test:stress -- image-edit [--reuse-fixtures] -- --count 20",

  defaultTimeoutMs: 600_000,
  minTimeoutMs: 30_000,
  defaultRateLimitMax: 2,
  defaultRateLimitWindowMs: 1000,
  defaultRetryBaseMs: 3000,
  defaultMaxRetries: 3,
  hasPollInterval: true,
  defaultPollInterval: 10,

  fixtureKind: "image",
  resolveFixtureRef: (prerequisites) =>
    prerequisites.image?.primaryUrl ||
    prerequisites.image?.urls?.[0] ||
    prerequisites.image?.saved?.[0],
  fixtureRefErrorMessage: "前置 manifest 缺少图片 URL 或路径",

  generatePrompt: (idx) => `${instructions[idx % instructions.length]} [#${idx}]`,

  buildCliArgs: ({ MODEL, prompt, runDir, fixtureRef, CLI_TIMEOUT_SEC, POLL_INTERVAL }) => [
    "image",
    "edit",
    "--model",
    MODEL,
    "--image",
    String(fixtureRef),
    "--prompt",
    prompt,
    "--out-dir",
    runDir,
    "--output",
    "json",
    "--timeout",
    String(CLI_TIMEOUT_SEC),
    "--poll-interval",
    String(POLL_INTERVAL),
  ],

  parseStdout: (stdout) => Promise.resolve(parseImageResult(stdout)),

  extraReportMeta: ({ fixtureRef }) => ({
    extraMdLines: [`- **源图**: \`${String(fixtureRef).slice(0, 120)}\``],
  }),

  reportSpec: {
    titleMd: "图像编辑批量压测报告（image edit）",
    titleHtml: "图像编辑批量压测报告（image edit）",
    promptColumnMd: "编辑指令",
    promptColumnHtml: "编辑指令",
    outcomeColumnMd: "图片地址 / 错误信息",
    outcomeColumnHtml: "图片地址 / 错误信息",
    formatOutcomeMd: (r) => {
      if (r.status === "success") {
        if (r.urls?.length) return escapeTableCell(r.urls.join("<br>"));
        if (r.saved?.length) return escapeTableCell(`(本地) ${r.saved.join("<br>")}`);
        return "—";
      }
      return escapeTableCell(getErrorMessage(r, extractError));
    },
    formatOutcomeHtml: (r) => {
      if (r.status === "success") {
        if (r.urls?.length) {
          return r.urls
            .map((url) => {
              const safe = escapeHtml(url);
              return `<div class="outcome-success"><a class="url-link" href="${safe}" target="_blank" rel="noopener">${safe}</a></div>`;
            })
            .join("");
        }
        if (r.saved?.length)
          return r.saved.map((p) => `<code class="path">${escapeHtml(p)}</code>`).join("<br>");
        return "—";
      }
      return `<span class="outcome-error">${escapeHtml(getErrorMessage(r, extractError))}</span>`;
    },
  },
});

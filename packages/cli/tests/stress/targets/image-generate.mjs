#!/usr/bin/env node
/**
 * `image generate` 并发压测。
 */
import { defineStressTarget } from "../lib/define-stress-target.mjs";
import { parseImageResult, extractError } from "../lib/parsers.mjs";
import { escapeHtml, escapeTableCell, getErrorMessage } from "../lib/report.mjs";
import { optFrom } from "../lib/argv-parse.mjs";

const subjects = [
  "一只橘猫",
  "一位宇航员",
  "一座古堡",
  "一片向日葵田",
  "一条锦鲤",
  "一杯拿铁",
  "一辆复古自行车",
  "一朵樱花",
  "一只柴犬",
  "一座雪山",
  "一艘帆船",
  "一只机械蝴蝶",
  "一座中式亭台",
  "一片极光",
  "一只企鹅",
];
const styles = [
  "水彩插画风格",
  "赛博朋克霓虹",
  "极简扁平设计",
  "电影级写实光影",
  "日系动漫",
  "像素艺术",
  "油画厚涂",
  "黑白素描",
  "3D 渲染",
  "蒸汽波复古",
];
const scenes = [
  "在雨夜街头",
  "在火星表面",
  "在海底珊瑚礁",
  "在清晨薄雾中",
  "在星空下",
  "在图书馆里",
  "在樱花飘落的公园",
  "在云端之上",
  "在沙漠绿洲",
  "在冬日雪地里",
];
const extras = [
  "细节丰富，构图居中",
  "柔和光线，高对比",
  "广角镜头，景深明显",
  "暖色调，温馨氛围",
  "冷色调，神秘气氛",
  "留白充足，适合壁纸",
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const runStress = defineStressTarget({
  canonical: "image-generate",
  defaultModel: "qwen-image-2.0",
  batchDirPrefix: "image-generate-batch",
  helpText: `用法（由 pnpm run test:stress -- image-generate 调用）：
  pnpm run test:stress -- image-generate -- --concurrency 5 --count 100

详见 docs/agents/stress-batch-tests.md`,

  defaultTimeoutMs: 600_000,
  minTimeoutMs: 30_000,
  defaultRateLimitMax: 2,
  defaultRateLimitWindowMs: 1000,
  defaultRetryBaseMs: 3000,
  defaultMaxRetries: 3,
  hasPollInterval: true,
  defaultPollInterval: 10,

  extraParams: (ARGV) => ({
    REPORT_THUMBNAILS: optFrom(ARGV, "REPORT_THUMBNAILS") === "1",
  }),

  generatePrompt: (index) => {
    const seed = `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
    return `${pick(subjects)}${pick(scenes)}，${pick(styles)}，${pick(extras)} [#${seed.slice(-6)}]`;
  },

  buildCliArgs: ({ MODEL, prompt, runDir, CLI_TIMEOUT_SEC, POLL_INTERVAL }) => [
    "image",
    "generate",
    "--model",
    MODEL,
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

  reportSpec: {
    titleMd: "图片生成批量压测报告（image-generate）",
    titleHtml: "图片生成批量压测报告",
    promptColumnMd: "Prompt",
    promptColumnHtml: "Prompt",
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

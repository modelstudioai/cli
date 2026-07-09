#!/usr/bin/env node
/**
 * `text chat` 并发压测。
 */
import { defineStressTarget } from "../lib/define-stress-target.mjs";
import { parseTextChatResult, extractError } from "../lib/parsers.mjs";
import { escapeHtml, escapeTableCell, getErrorMessage } from "../lib/report.mjs";

const snippets = [
  "用两句话解释机器学习。",
  "列举三个节能习惯。",
  "写一首五言绝句，主题为春雨。",
  "什么是 REST API？",
  "简述 TypeScript 与 JavaScript 的区别。",
];

export const runStress = defineStressTarget({
  canonical: "text",
  defaultModel: "qwen3.6-plus",
  batchDirPrefix: "text-chat-batch",
  helpText: "pnpm run test:stress -- text -- --count 20 --concurrency 5",

  defaultTimeoutMs: 120_000,
  minTimeoutMs: 10_000,
  defaultRateLimitMax: 10,
  defaultRateLimitWindowMs: 1000,
  defaultRetryBaseMs: 3000,
  defaultMaxRetries: 3,

  generatePrompt: (idx) =>
    `${snippets[idx % snippets.length]} [run-${idx}-${Date.now().toString(36)}]`,

  buildCliArgs: ({ MODEL, prompt, CLI_TIMEOUT_SEC }) => [
    "text",
    "chat",
    "--model",
    MODEL,
    "--message",
    prompt,
    "--output",
    "json",
    "--timeout",
    String(CLI_TIMEOUT_SEC),
  ],

  parseStdout: (stdout) => Promise.resolve(parseTextChatResult(stdout)),

  reportSpec: {
    titleMd: "文本对话批量压测报告（text chat）",
    titleHtml: "文本对话批量压测报告（text chat）",
    promptColumnMd: "Message",
    promptColumnHtml: "Message",
    outcomeColumnMd: "回复摘要 / 错误信息",
    outcomeColumnHtml: "回复摘要 / 错误信息",
    formatOutcomeMd: (r) => {
      if (r.status === "success") {
        return escapeTableCell(String(r.replyTextPreview ?? "").slice(0, 500));
      }
      return escapeTableCell(getErrorMessage(r, extractError));
    },
    formatOutcomeHtml: (r) => {
      if (r.status === "success") {
        return `<code class="path">${escapeHtml(String(r.replyTextPreview ?? "").slice(0, 800))}</code>`;
      }
      return `<span class="outcome-error">${escapeHtml(getErrorMessage(r, extractError))}</span>`;
    },
  },
});

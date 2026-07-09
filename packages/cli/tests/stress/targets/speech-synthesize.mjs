#!/usr/bin/env node
/**
 * `speech synthesize` 并发压测。
 */
import { defineStressTarget } from "../lib/define-stress-target.mjs";
import { parseSpeechSynthesizeResult, extractError } from "../lib/parsers.mjs";
import { escapeHtml, escapeTableCell, getErrorMessage } from "../lib/report.mjs";
import { optFrom } from "../lib/argv-parse.mjs";

const texts = [
  "今天天气晴朗，适合出门散步。",
  "人工智能正在改变我们的生活。",
  "春天来了，万物复苏，百花盛开。",
  "学习新技能需要持续不断的练习。",
  "海浪拍打着沙滩，远处传来海鸥的鸣叫。",
];

export const runStress = defineStressTarget({
  canonical: "speech-tts",
  defaultModel: "cosyvoice-v3-flash",
  batchDirPrefix: "speech-tts-batch",
  helpText: "pnpm run test:stress -- speech-tts -- --count 20 --concurrency 5",

  defaultTimeoutMs: 180_000,
  minTimeoutMs: 10_000,
  defaultRateLimitMax: 8,
  defaultRateLimitWindowMs: 1000,
  defaultRetryBaseMs: 4000,
  defaultMaxRetries: 3,

  extraParams: (ARGV) => ({
    VOICE: optFrom(ARGV, "VOICE") || process.env.STRESS_TTS_VOICE?.trim() || "longanyang",
  }),

  generatePrompt: (idx) => `${texts[idx % texts.length]} [run-${idx}-${Date.now().toString(36)}]`,

  buildCliArgs: ({ MODEL, prompt, runDir, CLI_TIMEOUT_SEC, extraParams, index }) => [
    "speech",
    "synthesize",
    "--model",
    MODEL,
    "--voice",
    extraParams.VOICE,
    "--text",
    prompt,
    "--out",
    `${runDir}/audio_${String(index + 1).padStart(3, "0")}.mp3`,
    "--output",
    "json",
    "--timeout",
    String(CLI_TIMEOUT_SEC),
  ],

  parseStdout: (stdout) => Promise.resolve(parseSpeechSynthesizeResult(stdout)),

  extraReportMeta: ({ extraParams }) => ({
    extraMdLines: [`- **音色**: ${extraParams.VOICE}`],
    extraHtmlMeta: ` · 音色: ${extraParams.VOICE}`,
  }),

  reportSpec: {
    titleMd: "语音合成批量压测报告（speech synthesize）",
    titleHtml: "语音合成批量压测报告（speech synthesize）",
    promptColumnMd: "文本",
    promptColumnHtml: "文本",
    outcomeColumnMd: "audio URL / 本地路径 / 错误信息",
    outcomeColumnHtml: "audio URL / 本地路径 / 错误信息",
    formatOutcomeMd: (r) => {
      if (r.status === "success") {
        const parts = [];
        if (r.audioUrls?.length) parts.push(...r.audioUrls.map((u) => escapeTableCell(u)));
        if (r.saved?.length) parts.push(...r.saved.map((p) => escapeTableCell(`(本地) ${p}`)));
        return parts.length ? parts.join("<br>") : "—";
      }
      return escapeTableCell(getErrorMessage(r, extractError));
    },
    formatOutcomeHtml: (r) => {
      if (r.status === "success") {
        const parts = [];
        if (r.audioUrls?.length) {
          for (const url of r.audioUrls) {
            const safe = escapeHtml(url);
            parts.push(
              `<a class="url-link" href="${safe}" target="_blank" rel="noopener">${safe}</a>`,
            );
          }
        }
        if (r.saved?.length) {
          for (const p of r.saved) {
            parts.push(`<code class="path">${escapeHtml(p)}</code>`);
          }
        }
        return parts.length ? parts.join("<br>") : "—";
      }
      return `<span class="outcome-error">${escapeHtml(getErrorMessage(r, extractError))}</span>`;
    },
  },
});

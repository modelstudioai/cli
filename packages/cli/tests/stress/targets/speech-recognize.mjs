#!/usr/bin/env node
/**
 * `speech recognize` 并发压测；依赖前置合成的音频 fixtures。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineStressTarget } from "../lib/define-stress-target.mjs";
import { parseAsrOutFile, parseAsrStdoutOnly, extractError } from "../lib/parsers.mjs";
import { escapeHtml, escapeTableCell, getErrorMessage } from "../lib/report.mjs";

export const runStress = defineStressTarget({
  canonical: "speech-asr",
  defaultModel: "fun-asr",
  batchDirPrefix: "speech-asr-batch",
  helpText: "pnpm run test:stress -- speech-asr [--reuse-fixtures] -- --count 10",

  defaultTimeoutMs: 600_000,
  minTimeoutMs: 60_000,
  defaultRateLimitMax: 6,
  defaultRateLimitWindowMs: 1000,
  defaultRetryBaseMs: 4000,
  defaultMaxRetries: 3,
  hasPollInterval: true,
  defaultPollInterval: 2,

  fixtureKind: "audio",
  resolveFixtureRef: (prerequisites) =>
    prerequisites.audio?.url || prerequisites.audio?.saved || prerequisites.audio?.urls?.[0],
  fixtureRefErrorMessage: "前置 manifest 缺少音频 URL 或路径",

  generatePrompt: (idx) => `[ASR-${idx}-${Date.now().toString(36)}]`,

  buildCliArgs: ({ MODEL, CLI_TIMEOUT_SEC, POLL_INTERVAL, fixtureRef, runDir }) => [
    "speech",
    "recognize",
    "--model",
    MODEL,
    "--url",
    String(fixtureRef),
    "--poll-interval",
    String(POLL_INTERVAL),
    "--out",
    join(runDir, "asr-result.json"),
    "--timeout",
    String(CLI_TIMEOUT_SEC),
    "--language",
    "zh",
  ],

  buildBaseRecord: ({ runDir }) => ({
    asrOutPath: join(runDir, "asr-result.json"),
  }),

  parseStdout: async (stdout, psCtx) => {
    const fp = psCtx.asrOutPath;
    try {
      const raw = readFileSync(fp, "utf8");
      const pr = parseAsrOutFile(raw);
      if (pr.ok) {
        return { ok: true, data: { transcriptNote: `(见 ${fp})`, asrOutPath: fp } };
      }
    } catch {
      // file not found or read failure
    }
    const so = parseAsrStdoutOnly(stdout);
    if (so?.ok) {
      return { ok: true, data: { transcriptNote: String(so.data.preview ?? ""), asrOutPath: fp } };
    }
    return { ok: false, error: "无法从 --out 或 stdout 得到识别正文" };
  },

  extraReportMeta: ({ fixtureRef }) => ({
    extraMdLines: [`- **音频输入**: \`${String(fixtureRef)}\``],
  }),

  reportSpec: {
    titleMd: "语音识别批量压测报告（speech recognize）",
    titleHtml: "语音识别批量压测报告（speech recognize）",
    promptColumnMd: "任务标记",
    promptColumnHtml: "任务标记",
    outcomeColumnMd: "结果",
    outcomeColumnHtml: "结果",
    formatOutcomeMd: (r) => {
      if (r.status === "success") {
        return escapeTableCell(String(r.transcriptNote ?? r.asrOutPath ?? "—"));
      }
      return escapeTableCell(getErrorMessage(r, extractError));
    },
    formatOutcomeHtml: (r) => {
      if (r.status === "success") {
        return `<code class="path">${escapeHtml(String(r.transcriptNote ?? r.asrOutPath ?? ""))}</code>`;
      }
      return `<span class="outcome-error">${escapeHtml(getErrorMessage(r, extractError))}</span>`;
    },
  },
});

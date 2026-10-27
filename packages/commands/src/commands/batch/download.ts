import { resolve, join } from "node:path";
import {
  defineCommand,
  getBatch,
  getBatchFileContent,
  exportBatchCsv,
  writeBatchFile,
  batchDataNotes,
  BATCH_TERMINAL,
  BailianError,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import { BATCH_ID_FLAGS, FORCE_FLAGS, DRY_RUN_NOTE } from "./shared.ts";
const DOWNLOAD_FLAGS = {
  ...BATCH_ID_FLAGS,
  ...FORCE_FLAGS,
  outDir: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Output directory (default: ./batch-results/<batch-id>/)",
      "zh-CN": "输出目录（默认：./batch-results/<batch-id>/）",
    },
  },
  csv: {
    type: "switch",
    description: {
      "en-US": "Also generate result.csv (lossy display projection)",
      "zh-CN": "额外生成 result.csv（有损展示投影）",
    },
  },
} satisfies FlagsDef;
export default defineCommand({
  description: {
    "en-US": "Download original Batch results/errors, optionally export CSV",
    "zh-CN": "下载原始 Batch 结果/错误，可额外导出 CSV",
  },
  auth: "apiKey",
  flags: DOWNLOAD_FLAGS,
  usageArgs: "--batch-id <id> [--out-dir <path>] [--csv] [--force]",
  exampleArgs: [
    "--batch-id batch_xxx --out-dir ./out --csv",
    "--batch-id batch_xxx --out-dir ./out --csv --force",
    "--batch-id batch_xxx --dry-run",
  ],
  notes: [
    batchDataNotes("download"),
    {
      "en-US":
        "JSONL is authoritative; CSV reads only choices[0].message.content, embedding data, response.request_id/status_code, usage and error.code/message (or response.body.error). Unknown envelopes warn. CSV omits tool calls/additional choices and protects formula-like text; import IDs as text to retain leading zeros. No guarantee of original input order. Atomic per file, not per directory; CSV failure preserves downloaded JSONL. Recover by rerunning with --force. Retention is limited; download promptly.",
      "zh-CN":
        "JSONL 是保真产物；CSV 仅读取 choices[0].message.content、向量 data、response.request_id/status_code、usage 与 error.code/message（或 response.body.error）。未知包络告警。CSV 不包含工具调用/其他 choice，防护公式文本；ID 导入请选择文本类型以保留前导零。不保证输入顺序。逐文件原子发布，不承诺目录事务；CSV 失败保留已下载 JSONL，用 --force 重跑恢复。服务保留期有限，请尽早下载。",
    },
    DRY_RUN_NOTE,
  ],
  async run(ctx) {
    const directory = resolve(
      ctx.flags.outDir ??
        join("batch-results", encodeURIComponent(ctx.flags.batchId).replace(/\./g, "%2E")),
    );
    if (ctx.settings.dryRun) {
      emitResult(
        {
          action: "batch.download",
          batch_id: ctx.flags.batchId,
          out_dir: directory,
          planned_files: [
            ctx.localize({
              "en-US": "result.jsonl (if available)",
              "zh-CN": "result.jsonl（若可用）",
            }),
            ctx.localize({
              "en-US": "error.jsonl (if available)",
              "zh-CN": "error.jsonl（若可用）",
            }),
            ...(ctx.flags.csv ? ["result.csv"] : []),
          ],
          csv: ctx.flags.csv,
          force: ctx.flags.force,
        },
        "json",
      );
      return;
    }
    const job = await getBatch(ctx.client, ctx.flags.batchId);
    if (!BATCH_TERMINAL.has(job.status))
      throw new BailianError(
        ctx.localize({
          "en-US": `Batch is not terminal: ${job.status}. Use batch get --follow.`,
          "zh-CN": `Batch 尚未到终态：${job.status}。请先 batch get --follow。`,
        }),
        ExitCode.GENERAL,
      );
    const sources = [
      { id: job.output_file_id, name: "result.jsonl" },
      { id: job.error_file_id, name: "error.jsonl" },
    ].filter((file) => file.id);
    if (!sources.length)
      throw new BailianError(
        ctx.localize({
          "en-US": "No downloadable artifacts are available.",
          "zh-CN": "没有可下载的产物。",
        }),
        ExitCode.GENERAL,
      );
    const saved: string[] = [];
    const counts: Record<string, number> = {};
    let stage = "JSONL";
    let csvReport: Awaited<ReturnType<typeof exportBatchCsv>> | undefined;
    try {
      for (const file of sources) {
        const target = join(directory, file.name);
        stage = file.name;
        let rows = 0;
        let nonblank = false;
        async function* content() {
          const response = await getBatchFileContent(ctx.client, file.id!);
          if (!response.body)
            throw new BailianError(
              ctx.localize({
                "en-US": "File response has no body.",
                "zh-CN": "文件响应缺少正文。",
              }),
              ExitCode.GENERAL,
            );
          const reader = response.body.getReader();
          try {
            while (true) {
              const chunk = await reader.read();
              if (chunk.done) break;
              for (const byte of chunk.value) {
                if (byte === 10) {
                  if (nonblank) rows++;
                  nonblank = false;
                } else if (byte !== 9 && byte !== 13 && byte !== 32) nonblank = true;
              }
              yield chunk.value;
            }
            if (nonblank) rows++;
          } finally {
            await reader.cancel().catch(() => {});
            reader.releaseLock();
          }
        }
        await writeBatchFile(target, content(), ctx.flags.force);
        saved.push(target);
        counts[file.name] = rows;
      }
      if (ctx.flags.csv) {
        stage = "CSV";
        const target = join(directory, "result.csv");
        csvReport = await exportBatchCsv(saved, target, ctx.flags.force);
        saved.push(target);
        if (csvReport.unknown_records)
          console.error(
            ctx.localize({
              "en-US": `${csvReport.unknown_records} unrecognized result envelopes; inspect original JSONL.`,
              "zh-CN": `${csvReport.unknown_records} 条结果包络无法识别，请检查原始 JSONL。`,
            }),
          );
      }
    } catch (error) {
      if (saved.length)
        console.error(
          ctx.localize({
            "en-US": `Failed at ${stage}. Preserved files: ${saved.join(", ")}. Rerun batch download with --force to download and convert again.`,
            "zh-CN": `${stage} 阶段失败。已保留文件：${saved.join("，")}。可用 --force 重跑 batch download 重新下载转换。`,
          }),
        );
      throw error;
    }
    if (ctx.settings.quiet) emitBare(saved.join("\n"));
    else
      emitResult(
        { batch_id: job.id, status: job.status, files: saved, line_counts: counts, csv: csvReport },
        ctx.settings.output === "text" ? "text" : "json",
      );
  },
});

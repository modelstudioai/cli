import { defineCommand, prepareBatch, batchDataNotes, type FlagsDef } from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import { ENDPOINT_FLAGS, FORCE_FLAGS, DRY_RUN_NOTE } from "./shared.ts";
const CONVERT_FLAGS = {
  file: {
    type: "string",
    required: true,
    valueHint: "<csv>",
    description: { "en-US": "UTF-8 CSV with headers", "zh-CN": "带表头的 UTF-8 CSV" },
  },
  outputFile: {
    type: "string",
    required: true,
    valueHint: "<jsonl>",
    description: { "en-US": "Local JSONL output path", "zh-CN": "本地 JSONL 输出路径" },
  },
  model: {
    type: "string",
    required: true,
    valueHint: "<model>",
    description: { "en-US": "Model for every record", "zh-CN": "全部记录统一使用的模型" },
  },
  idColumn: {
    type: "string",
    valueHint: "<name>",
    description: { "en-US": "ID column (default: custom_id)", "zh-CN": "ID 列（默认：custom_id）" },
  },
  inputColumn: {
    type: "string",
    valueHint: "<name>",
    description: { "en-US": "Input column (default: content)", "zh-CN": "输入列（默认：content）" },
  },
  system: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Shared system prompt (Chat only)",
      "zh-CN": "统一系统提示词（仅 Chat）",
    },
  },
  bodyFile: {
    type: "string",
    valueHint: "<json>",
    description: {
      "en-US": "Shared body parameters, excluding model/messages/input",
      "zh-CN": "公共 body 参数，不得包含 model/messages/input",
    },
  },
  ...ENDPOINT_FLAGS,
  ...FORCE_FLAGS,
} satisfies FlagsDef;
export default defineCommand({
  description: {
    "en-US": "Build Batch JSONL from CSV locally",
    "zh-CN": "在本地从 CSV 构造 Batch JSONL",
  },
  auth: "none",
  usageArgs: "--file <csv> --model <model> --output-file <jsonl> [flags]",
  flags: CONVERT_FLAGS,
  exampleArgs: [
    "--file input.csv --model qwen-plus --output-file input.jsonl",
    "--file input.csv --model text-embedding-v4 --endpoint /v1/embeddings --output-file vectors.jsonl",
    "--file input.csv --model qwen-plus --body-file defaults.json --output-file input.jsonl --dry-run",
  ],
  notes: [
    batchDataNotes("convert"),
    {
      "en-US":
        "Text/embedding mapping only; use native JSONL for multimodal or multi-turn input. IDs remain strings; import CSV IDs as text in spreadsheet software.",
      "zh-CN":
        "仅提供文本/向量映射；多模态、多轮输入使用原生 JSONL。ID 保持字符串，表格软件导入 ID 时请选择文本类型。",
    },
    DRY_RUN_NOTE,
  ],
  async run(ctx) {
    const report = await prepareBatch({ ...ctx.flags, dryRun: ctx.settings.dryRun });
    for (const warning of report.warnings) console.error(warning);
    if (ctx.settings.quiet) emitBare(report.output_file);
    else emitResult(report, ctx.settings.output === "text" ? "text" : "json");
  },
});

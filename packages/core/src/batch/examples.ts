import type { BatchRequest } from "./types.ts";
import { stringify } from "csv-stringify/sync";
import { BATCH_CSV_COLUMNS, projectBatchCsv } from "./csv.ts";

// Help 与离线测试共用可执行数据，避免两份示例格式漂移。
export function batchExamples(language: "en-US" | "zh-CN") {
  const content = language === "zh-CN" ? "请介绍一下自己" : "Introduce yourself";
  const chat: BatchRequest = {
    custom_id: "req-001",
    method: "POST",
    url: "/v1/chat/completions",
    body: { model: "qwen-plus", messages: [{ role: "user", content }] },
  };
  const embedding: BatchRequest = {
    custom_id: "req-001",
    method: "POST",
    url: "/v1/embeddings",
    body: { model: "text-embedding-v4", input: content, encoding_format: "float" },
  };
  const vision: BatchRequest = {
    custom_id: "req-001",
    method: "POST",
    url: "/v1/chat/completions",
    body: {
      model: "qwen-vl-plus",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: content },
            { type: "image_url", image_url: { url: "https://example.com/image.jpg" } },
          ],
        },
      ],
    },
  };
  const success = {
    custom_id: "req-001",
    response: {
      request_id: "request-001",
      status_code: 200,
      body: {
        model: "qwen-plus",
        choices: [
          { message: { role: "assistant", content: language === "zh-CN" ? "你好" : "Hello" } },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
      },
    },
    error: null,
  };
  const failure = {
    custom_id: "req-002",
    response: null,
    error: { code: "ExampleError", message: "Example service error" },
  };
  return {
    csv: `custom_id,content\nreq-001,${content}\nreq-002,2+2?`,
    chat,
    embedding,
    vision,
    defaults: { enable_thinking: false, max_tokens: 1024 },
    success,
    failure,
  };
}
export function batchDataNotes(kind: "prepare" | "convert" | "create" | "download"): {
  "en-US": string;
  "zh-CN": string;
} {
  const render = (language: "en-US" | "zh-CN") => {
    const example = batchExamples(language);
    if (kind === "prepare" || kind === "convert")
      return `input.csv:\n${example.csv}\n\ninput.jsonl:\n${JSON.stringify(example.chat)}\n\ndefaults.json (--body-file):\n${JSON.stringify(example.defaults)}`;
    if (kind === "create")
      return `Chat JSONL:\n${JSON.stringify(example.chat)}\n\nEmbedding JSONL:\n${JSON.stringify(example.embedding)}\n\nMultimodal JSONL (${language === "zh-CN" ? "请替换示例公网图片 URL" : "replace the example public image URL"}):\n${JSON.stringify(example.vision)}`;
    const csv = stringify(
      [example.success, example.failure].map((record) => projectBatchCsv(record).row),
      { columns: [...BATCH_CSV_COLUMNS], header: true },
    );
    return `result.jsonl:\n${JSON.stringify(example.success)}\n\nerror.jsonl (${language === "zh-CN" ? "示意包络，真实服务需联调" : "illustrative envelope; verify with the service"}):\n${JSON.stringify(example.failure)}\n\nresult.csv:\n${csv}`;
  };
  return { "en-US": render("en-US"), "zh-CN": render("zh-CN") };
}

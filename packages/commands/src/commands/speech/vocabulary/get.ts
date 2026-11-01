import {
  defineCommand,
  speechVocabularyPath,
  buildVocabularyRequest,
  queryVocabulary,
  type FlagsDef,
  type ParsedFlags,
} from "bailian-cli-core";
import { VOCABULARY_ID_FLAG } from "./shared.ts";

const GET_FLAGS = {
  ...VOCABULARY_ID_FLAG,
} satisfies FlagsDef;
type GetFlags = ParsedFlags<typeof GET_FLAGS>;

export default defineCommand({
  description: {
    "en-US": "Get details of a precompiled hot-word vocabulary",
    "zh-CN": "查看预编译热词表详情",
  },
  auth: "apiKey",
  usageArgs: "--id <id>",
  flags: GET_FLAGS,
  notes: [
    {
      "en-US":
        "Use this command to confirm target_model before calling `speech recognize --vocabulary-id`; a model mismatch causes silent failure.",
      "zh-CN":
        "调用 `speech recognize --vocabulary-id` 前请用本命令确认 target_model；模型不一致会导致静默失效。",
    },
  ],
  exampleArgs: ["--id vocab-demo-xxx", "--id vocab-demo-xxx --quiet"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const vocabularyId = (flags as GetFlags).id;

    if (settings.dryRun) {
      ctx.output.result({
        endpoint: ctx.client.url(speechVocabularyPath()),
        request: buildVocabularyRequest("query_vocabulary", {
          vocabulary_id: vocabularyId,
        }),
      });
      return;
    }

    const response = await queryVocabulary(ctx.client, vocabularyId);
    let text: string | undefined;
    if (settings.output === "text") {
      const output = response.output;
      const lines = [
        `vocabulary_id: ${vocabularyId}`,
        `status: ${output?.status ?? ""}`,
        `target_model: ${output?.target_model ?? ""}`,
        `gmt_create: ${output?.gmt_create ?? ""}`,
        `gmt_modified: ${output?.gmt_modified ?? ""}`,
      ];
      const entries = output?.vocabulary ?? [];
      if (entries.length > 0) {
        lines.push("vocabulary:");
        for (const entry of entries) {
          const langPart = entry.lang ? ` lang=${entry.lang}` : "";
          lines.push(`  ${entry.text} weight=${entry.weight}${langPart}`);
        }
      }
      text = lines.join("\n");
    }
    ctx.output.result(response, { text });
  },
});

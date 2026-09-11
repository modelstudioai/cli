import {
  defineCommand,
  detectOutputFormat,
  speechVocabularyPath,
  buildVocabularyRequest,
  queryVocabulary,
  type FlagsDef,
  type ParsedFlags,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
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
    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult(
        {
          endpoint: ctx.client.url(speechVocabularyPath()),
          request: buildVocabularyRequest("query_vocabulary", {
            vocabulary_id: vocabularyId,
          }),
        },
        format,
      );
      return;
    }

    const response = await queryVocabulary(ctx.client, vocabularyId);
    const output = response.output;

    if (settings.quiet) {
      emitBare(output?.target_model ?? "");
      return;
    }

    if (format === "text") {
      emitBare(`vocabulary_id: ${vocabularyId}`);
      emitBare(`status: ${output?.status ?? ""}`);
      emitBare(`target_model: ${output?.target_model ?? ""}`);
      emitBare(`gmt_create: ${output?.gmt_create ?? ""}`);
      emitBare(`gmt_modified: ${output?.gmt_modified ?? ""}`);
      const entries = output?.vocabulary ?? [];
      if (entries.length > 0) {
        emitBare("vocabulary:");
        for (const entry of entries) {
          const langPart = entry.lang ? ` lang=${entry.lang}` : "";
          emitBare(`  ${entry.text} weight=${entry.weight}${langPart}`);
        }
      }
    } else {
      emitResult(response, format);
    }
  },
});

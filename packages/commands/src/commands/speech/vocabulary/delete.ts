import {
  defineCommand,
  detectOutputFormat,
  speechVocabularyPath,
  buildVocabularyRequest,
  deleteVocabulary,
  type FlagsDef,
  type ParsedFlags,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { VOCABULARY_ID_FLAG } from "./shared.ts";

const DELETE_FLAGS = {
  ...VOCABULARY_ID_FLAG,
} satisfies FlagsDef;
type DeleteFlags = ParsedFlags<typeof DELETE_FLAGS>;

export default defineCommand({
  description: {
    "en-US": "Delete a precompiled hot-word vocabulary",
    "zh-CN": "删除预编译热词表",
  },
  auth: "apiKey",
  risk: {
    level: "high",
    message: {
      "en-US":
        "This permanently deletes the specified hot-word vocabulary and cannot be undone.",
      "zh-CN": "该操作会永久删除指定的热词表，且无法撤销。",
    },
  },
  usageArgs: "--id <id>",
  flags: DELETE_FLAGS,
  exampleArgs: ["--id vocab-demo-xxx --dry-run", "--id vocab-demo-xxx --yes"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const vocabularyId = (flags as DeleteFlags).id;
    const format = detectOutputFormat(settings.output);

    if (settings.dryRun) {
      emitResult(
        {
          endpoint: ctx.client.url(speechVocabularyPath()),
          request: buildVocabularyRequest("delete_vocabulary", {
            vocabulary_id: vocabularyId,
          }),
        },
        format,
      );
      return;
    }

    const response = await deleteVocabulary(ctx.client, vocabularyId);

    if (settings.quiet || format === "text") {
      emitBare(vocabularyId);
    } else {
      emitResult(response, format);
    }
  },
});

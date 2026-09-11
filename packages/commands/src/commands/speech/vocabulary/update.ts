import {
  defineCommand,
  detectOutputFormat,
  speechVocabularyPath,
  buildVocabularyRequest,
  updateVocabulary,
  type FlagsDef,
  type ParsedFlags,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import {
  VOCABULARY_ID_FLAG,
  VOCABULARY_BODY_FLAGS,
  VOCABULARY_LIMIT_NOTES,
  validateVocabularySource,
  readVocabularyEntries,
} from "./shared.ts";

const UPDATE_FLAGS = {
  ...VOCABULARY_ID_FLAG,
  ...VOCABULARY_BODY_FLAGS,
} satisfies FlagsDef;
type UpdateFlags = ParsedFlags<typeof UPDATE_FLAGS>;

export default defineCommand({
  description: {
    "en-US": "Replace the contents of a precompiled hot-word vocabulary",
    "zh-CN": "完全替换预编译热词表的内容",
  },
  auth: "apiKey",
  risk: {
    level: "high",
    message: {
      "en-US":
        "This fully replaces all hot words in the vocabulary. Entries not listed will be discarded and cannot be undone.",
      "zh-CN": "该操作会完全替换热词表中的全部词条。未列出的词将被丢弃，且无法撤销。",
    },
  },
  usageArgs: "--id <id> (--words <json> | --words-file <path>) [flags]",
  flags: UPDATE_FLAGS,
  notes: [
    {
      "en-US":
        "update is a full replace, not an append. Prefer --dry-run first to preview the complete vocabulary that will be written.",
      "zh-CN": "update 是完全替换，不是增量追加。建议先用 --dry-run 预览将要写入的完整词表。",
    },
    ...VOCABULARY_LIMIT_NOTES,
  ],
  exampleArgs: [
    {
      "en-US": "--id vocab-demo-xxx --words '{\"Fendouzhe\":4}' --dry-run",
      "zh-CN": "--id vocab-demo-xxx --words '{\"奋斗者\":4}' --dry-run",
    },
    {
      "en-US": '--id vocab-demo-xxx --words \'{"Fendouzhe":4,"Jingluo":4}\' --yes',
      "zh-CN": '--id vocab-demo-xxx --words \'{"奋斗者":4,"鲸落":4}\' --yes',
    },
  ],
  validate: (flags: UpdateFlags) => validateVocabularySource(flags),
  async run(ctx) {
    const { settings, flags } = ctx;
    const vocabularyId = flags.id;
    const vocabulary = readVocabularyEntries(flags);
    const format = detectOutputFormat(settings.output);

    const request = buildVocabularyRequest("update_vocabulary", {
      vocabulary_id: vocabularyId,
      vocabulary,
    });

    if (settings.dryRun) {
      emitResult(
        {
          endpoint: ctx.client.url(speechVocabularyPath()),
          request,
        },
        format,
      );
      return;
    }

    const response = await updateVocabulary(ctx.client, vocabularyId, vocabulary);

    if (settings.quiet || format === "text") {
      emitBare(vocabularyId);
    } else {
      emitResult(response, format);
    }
  },
});

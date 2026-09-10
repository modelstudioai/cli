import {
  defineCommand,
  detectOutputFormat,
  speechVocabularyPath,
  buildVocabularyRequest,
  createVocabulary,
  type FlagsDef,
  type ParsedFlags,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";
import {
  VOCABULARY_BODY_FLAGS,
  VOCABULARY_LIMIT_NOTES,
  validateVocabularySource,
  readVocabularyEntries,
} from "./shared.ts";

const CREATE_FLAGS = {
  model: {
    type: "string",
    valueHint: "<model>",
    description: {
      "en-US":
        "ASR model this vocabulary is built for (required). Must exactly match the --model passed to `speech recognize` later, otherwise the vocabulary is silently ignored",
      "zh-CN":
        "该热词表服务的 ASR 模型（必填）。必须与后续 `speech recognize` 的 --model 完全一致，否则热词表静默失效",
    },
    required: true,
  },
  prefix: {
    type: "string",
    valueHint: "<prefix>",
    description: {
      "en-US":
        "Custom vocabulary prefix (required). Digits and lowercase letters only, max 10 chars",
      "zh-CN": "热词表自定义前缀（必填）。仅允许数字和小写字母，最长 10 个字符",
    },
    required: true,
  },
  ...VOCABULARY_BODY_FLAGS,
} satisfies FlagsDef;
type CreateFlags = ParsedFlags<typeof CREATE_FLAGS>;

export default defineCommand({
  description: {
    "en-US": "Create a precompiled hot-word vocabulary for ASR",
    "zh-CN": "创建用于语音识别的预编译热词表",
  },
  auth: "apiKey",
  usageArgs: "--model <model> --prefix <prefix> (--words <json> | --words-file <path>) [flags]",
  flags: CREATE_FLAGS,
  notes: [
    {
      "en-US":
        "The --model must exactly match the --model used later with `speech recognize --vocabulary-id`; a mismatch causes silent failure with no error.",
      "zh-CN":
        "--model 必须与后续 `speech recognize --vocabulary-id` 使用的 --model 完全一致；不一致时热词表会静默失效且无报错。",
    },
    ...VOCABULARY_LIMIT_NOTES,
  ],
  exampleArgs: [
    {
      "en-US": '--model fun-asr --prefix demo --words \'{"Fendouzhe":4,"Jingluo":4}\'',
      "zh-CN": '--model fun-asr --prefix demo --words \'{"奋斗者":4,"鲸落":4}\'',
    },
    {
      "en-US":
        '--model paraformer-v2 --prefix demo --words \'[{"text":"Fendouzhe","weight":4,"lang":"zh"}]\'',
      "zh-CN":
        '--model paraformer-v2 --prefix demo --words \'[{"text":"奋斗者","weight":4,"lang":"zh"}]\'',
    },
    {
      "en-US": "--model fun-asr --prefix demo --words '{\"Fendouzhe\":4}' --lang zh",
      "zh-CN": "--model fun-asr --prefix demo --words '{\"奋斗者\":4}' --lang zh",
    },
    "--model fun-asr --prefix demo --words-file ./hotwords.json",
    {
      "en-US": "--model fun-asr --prefix demo --words '{\"Fendouzhe\":4}' --quiet",
      "zh-CN": "--model fun-asr --prefix demo --words '{\"奋斗者\":4}' --quiet",
    },
  ],
  validate: (flags: CreateFlags) => validateVocabularySource(flags),
  async run(ctx) {
    const { settings, flags } = ctx;
    const vocabulary = readVocabularyEntries(flags);
    const format = detectOutputFormat(settings.output);

    const request = buildVocabularyRequest("create_vocabulary", {
      target_model: flags.model,
      prefix: flags.prefix,
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

    const response = await createVocabulary(ctx.client, {
      targetModel: flags.model,
      prefix: flags.prefix,
      vocabulary,
    });

    if (settings.quiet || format === "text") {
      emitBare(response.output?.vocabulary_id ?? "");
    } else {
      emitResult(response, format);
    }
  },
});

import {
  readTextFromPathOrStdin,
  parseVocabularyEntries,
  type FlagsDef,
  type ParsedFlags,
  type VocabularyEntry,
} from "bailian-cli-core";

/** Shared --id flag for get / update / delete. */
export const VOCABULARY_ID_FLAG = {
  id: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US": "Hot-word vocabulary ID (required)",
      "zh-CN": "热词表 ID（必填）",
    },
    required: true,
  },
} satisfies FlagsDef;

/** Shared hot-word body flags for create / update. */
export const VOCABULARY_BODY_FLAGS = {
  words: {
    type: "string",
    valueHint: "<json>",
    description: {
      "en-US":
        "Hot words as JSON object of word→weight, e.g. '{\"Fendouzhe\":4}'; or the API entry array for per-entry lang. Weight 1-5 (4 recommended); when the vocabulary target_model is a Qwen-Audio-3.0-ASR-Flash series model, 50 is also allowed as super hot word. Or use --words-file",
      "zh-CN":
        "热词，JSON 对象「热词→权重」，例如 '{\"奋斗者\":4}'；需要逐条指定语言时可传 API 的条目数组。权重 1-5（推荐 4）；当热词表的 target_model 为 Qwen-Audio-3.0-ASR-Flash 系列时还可使用 50（超级热词）。也可使用 --words-file",
    },
  },
  wordsFile: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "JSON file with the hot words (use - for stdin)",
      "zh-CN": "包含热词的 JSON 文件（使用 - 从 stdin 读取）",
    },
  },
  lang: {
    type: "string",
    valueHint: "<code>",
    description: {
      "en-US":
        "Language code applied to every hot word when using object form (optional; ignored for array form). Paraformer: zh/en/ja/yue/ko/de/fr/ru; Fun-ASR: zh/en/ja",
      "zh-CN":
        "对象形态时应用到所有热词的语言代码（选填；数组形态忽略）。Paraformer 支持 zh/en/ja/yue/ko/de/fr/ru；Fun-ASR 支持 zh/en/ja",
    },
  },
} satisfies FlagsDef;

type VocabularySourceFlags = ParsedFlags<typeof VOCABULARY_BODY_FLAGS>;

/** Cross-flag validation for --words / --words-file. */
export function validateVocabularySource(flags: VocabularySourceFlags): string | undefined {
  if (!flags.words && !flags.wordsFile) {
    return "Provide --words or --words-file.";
  }
  if (flags.words && flags.wordsFile) {
    return "Use either --words or --words-file, not both.";
  }
  return undefined;
}

/** Read and parse vocabulary entries from flag or file. */
export function readVocabularyEntries(flags: VocabularySourceFlags): VocabularyEntry[] {
  const raw = flags.wordsFile ? readTextFromPathOrStdin(flags.wordsFile) : (flags.words as string);
  return parseVocabularyEntries(raw, flags.lang);
}

/** Shared notes covering account limits and silent-failure pitfalls. */
export const VOCABULARY_LIMIT_NOTES = [
  {
    "en-US":
      "Each account may have at most 10 vocabularies; updates must be at least 5 minutes apart. See improve-asr-accuracy for full limits.",
    "zh-CN": "每个账号最多 10 个热词表；两次更新间隔至少 5 分钟。完整限制见 improve-asr-accuracy。",
  },
  {
    "en-US":
      "Hot-word vocabularies are not supported in Singapore sub-workspaces; the server error is passed through as-is.",
    "zh-CN": "新加坡子业务空间不支持热词表；服务端错误会原样透传。",
  },
  {
    "en-US":
      "Weight 1-5 (4 recommended); when the vocabulary target_model is a Qwen-Audio-3.0-ASR-Flash series model, 50 is also allowed as super hot word.",
    "zh-CN":
      "权重 1-5（推荐 4）；当热词表的 target_model 为 Qwen-Audio-3.0-ASR-Flash 系列时还可使用 50（超级热词）。",
  },
] as const;

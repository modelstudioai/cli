import { buildChatMessages, parseTextMessages, runChatCompletions } from "./run-chat.ts";
import {
  defineCommand,
  chatPath,
  BailianError,
  ExitCode,
  type ChatMessage,
  type ChatRequest,
  type FlagsDef,
  type LocalizedText,
  type ParsedFlags,
  type TranslationOptions,
} from "bailian-cli-core";
import { parseTermPairs } from "../shared/translation.ts";

/** Text Qwen-MT family: plus/flash/lite, including optional dated suffixes. */
const QWEN_MT_TEXT_MODEL = /^qwen-mt-(plus|flash|lite)(-|$)/;

/** qwen-mt-plus family streams cumulative snapshots; flash/lite stream incremental deltas. */
const QWEN_MT_SNAPSHOT_MODEL = /^qwen-mt-plus(-|$)/;

const DEFAULT_MODEL = "qwen-mt-flash";

function isQwenMtTextModel(model: string): boolean {
  return QWEN_MT_TEXT_MODEL.test(model);
}

function usesSnapshotStream(model: string): boolean {
  return QWEN_MT_SNAPSHOT_MODEL.test(model);
}

const TRANSLATE_FLAGS = {
  model: {
    type: "string",
    valueHint: "<model>",
    description: {
      "en-US":
        "Qwen-MT model ID (default: qwen-mt-flash; qwen-mt-plus|flash|lite, optional dated suffix)",
      "zh-CN": "Qwen-MT 模型 ID（默认：qwen-mt-flash；qwen-mt-plus|flash|lite，可带日期后缀）",
    },
  },
  message: {
    type: "array",
    valueHint: "<text>",
    description: {
      "en-US": "Text to translate (repeatable user messages; or use --messages-file)",
      "zh-CN": "待翻译文本（可重复的 user 消息；也可使用 --messages-file）",
    },
  },
  messagesFile: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Messages array for one request (use - for stdin; user role only)",
      "zh-CN": "同一请求的 messages 数组（使用 - 从 stdin 读取；仅 user 角色）",
    },
  },
  sourceLang: {
    type: "string",
    valueHint: "<name>",
    description: {
      "en-US": "Translation source language (English name; default: auto)",
      "zh-CN": "翻译源语言（英文全称；默认：auto）",
    },
  },
  targetLang: {
    type: "string",
    valueHint: "<name>",
    description: {
      "en-US": "Translation target language (English name)",
      "zh-CN": "翻译目标语言（英文全称）",
    },
    required: true,
  },
  term: {
    type: "array",
    valueHint: "<source=target>",
    description: {
      "en-US": "Terminology pair source=target (repeatable)",
      "zh-CN": "术语对 source=target（可重复）",
    },
  },
  domainHint: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US": "Translation domain hint in English (maps to domains)",
      "zh-CN": "翻译领域提示（英文；映射为 domains）",
    },
  },
  maxTokens: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Maximum tokens to generate (default: 4096)",
      "zh-CN": "最大生成 Token 数（默认：4096）",
    },
  },
  temperature: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Sampling temperature (0.0, 2.0]", "zh-CN": "采样温度 (0.0, 2.0]" },
  },
  topP: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Nucleus sampling threshold", "zh-CN": "核采样阈值" },
  },
  stream: {
    type: "switch",
    description: {
      "en-US": "Stream response tokens (default: on in TTY)",
      "zh-CN": "流式输出响应 Token（TTY 中默认开启）",
    },
  },
} satisfies FlagsDef;
type TranslateFlags = ParsedFlags<typeof TRANSLATE_FLAGS>;

function assertUserOnlyTextMessages(
  messages: ChatMessage[],
  localize: (text: LocalizedText) => string,
): void {
  if (messages.length === 0) {
    throw new BailianError(
      localize({
        "en-US":
          "Qwen-MT translation requires at least one non-empty user message (--message or --messages-file).",
        "zh-CN": "Qwen-MT 翻译至少需要一条非空 user 消息（--message 或 --messages-file）。",
      }),
      ExitCode.USAGE,
    );
  }
  for (const message of messages) {
    if (message.role !== "user") {
      throw new BailianError(
        localize({
          "en-US":
            "Qwen-MT translation accepts only user messages (no system/assistant/tool roles).",
          "zh-CN": "Qwen-MT 翻译仅接受 user 消息（不能包含 system/assistant/tool 角色）。",
        }),
        ExitCode.USAGE,
      );
    }
    if (typeof message.content !== "string" || !message.content) {
      throw new BailianError(
        localize({
          "en-US": "Qwen-MT translation requires non-empty text content on every user message.",
          "zh-CN": "Qwen-MT 翻译要求每条 user 消息的 content 为非空文本。",
        }),
        ExitCode.USAGE,
      );
    }
  }
}

function buildTranslationOptions(
  flags: TranslateFlags,
  localize: (text: LocalizedText) => string,
): TranslationOptions {
  const targetLang = flags.targetLang;
  if (targetLang === undefined || targetLang === "") {
    throw new BailianError(
      localize({
        "en-US":
          "--target-lang is required and must be a non-empty English language name (not auto).",
        "zh-CN": "--target-lang 必填，且必须为非空英文全称（不能为 auto）。",
      }),
      ExitCode.USAGE,
    );
  }
  if (targetLang.toLowerCase() === "auto") {
    throw new BailianError(
      localize({
        "en-US": "--target-lang cannot be auto.",
        "zh-CN": "--target-lang 不能为 auto。",
      }),
      ExitCode.USAGE,
    );
  }

  const options: TranslationOptions = {
    source_lang:
      flags.sourceLang === undefined || flags.sourceLang === "" ? "auto" : flags.sourceLang,
    target_lang: targetLang,
  };

  const terms = parseTermPairs(flags.term, localize);
  if (terms !== undefined) options.terms = terms;
  if (flags.domainHint !== undefined) options.domains = flags.domainHint;
  return options;
}

export default defineCommand({
  description: {
    "en-US": "Translate text with Qwen-MT (Chat Completions translation_options)",
    "zh-CN": "使用 Qwen-MT 翻译文本（Chat Completions translation_options）",
  },
  auth: "apiKey",
  usageArgs: "(--message <text> | --messages-file <path>) --target-lang <name> [flags]",
  flags: TRANSLATE_FLAGS,
  exampleArgs: [
    {
      "en-US":
        '--message "欢迎使用百炼。" --source-lang Chinese --target-lang English --term "百炼=Bailian" --dry-run --output json',
      "zh-CN":
        '--message "欢迎使用百炼。" --source-lang Chinese --target-lang English --term "百炼=Bailian" --dry-run --output json',
    },
    {
      "en-US":
        '--model qwen-mt-plus --message "欢迎使用百炼。" --target-lang English --stream --output json',
      "zh-CN":
        '--model qwen-mt-plus --message "欢迎使用百炼。" --target-lang English --stream --output json',
    },
  ],
  notes: [
    {
      "en-US":
        "Language names use English full names (Chinese/English), not zh/en codes. Only user messages are accepted. Does not support --api responses, --batch, --prime, --tool, --enable-search, or thinking flags. For general chat use `text chat`.",
      "zh-CN":
        "语言名用英文全称（Chinese/English），不用 zh/en 代码。仅接受 user 消息。不支持 --api responses、--batch、--prime、--tool、--enable-search 及 thinking 参数。普通对话请用 `text chat`。",
    },
  ],
  validate: (flags) => {
    if (!flags.message && !flags.messagesFile) return "Provide --message or --messages-file.";
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const localize = ctx.localize;
    const model = flags.model || DEFAULT_MODEL;

    if (!isQwenMtTextModel(model)) {
      throw new BailianError(
        localize({
          "en-US": `Unsupported model "${model}". Use qwen-mt-flash, qwen-mt-plus, or qwen-mt-lite (optional dated suffix).`,
          "zh-CN": `不支持的模型 "${model}"。请使用 qwen-mt-flash、qwen-mt-plus 或 qwen-mt-lite（可带日期后缀）。`,
        }),
        ExitCode.USAGE,
      );
    }

    const allMessages = buildChatMessages(parseTextMessages(flags));
    assertUserOnlyTextMessages(allMessages, localize);

    const shouldStream = flags.stream || process.stdout.isTTY;
    const body: ChatRequest = {
      model,
      messages: allMessages,
      max_tokens: flags.maxTokens ?? 4096,
      stream: shouldStream,
      translation_options: buildTranslationOptions(flags, localize),
    };
    if (flags.temperature !== undefined) body.temperature = flags.temperature;
    if (flags.topP !== undefined) body.top_p = flags.topP;

    const contentMode = usesSnapshotStream(model) ? "snapshot" : "delta";
    await runChatCompletions({
      client: ctx.client,
      output: ctx.output,
      localize,
      settings,
      path: chatPath(),
      body,
      shouldStream,
      contentMode,
    });
  },
});

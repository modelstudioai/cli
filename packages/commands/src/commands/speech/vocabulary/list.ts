import {
  defineCommand,
  detectOutputFormat,
  speechVocabularyPath,
  buildVocabularyRequest,
  listVocabularies,
  type FlagsDef,
  type ParsedFlags,
} from "bailian-cli-core";
import { emitResult, emitBare } from "bailian-cli-runtime";

const LIST_FLAGS = {
  prefix: {
    type: "string",
    valueHint: "<prefix>",
    description: {
      "en-US": "Filter by vocabulary prefix",
      "zh-CN": "按热词表前缀过滤",
    },
  },
  page: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US":
        "Page number, 1-based (default: 1). Mapped to API page_index (0-based) as page - 1",
      "zh-CN": "页码，从 1 开始（默认：1）。映射为 API 的 page_index（从 0 开始）：page - 1",
    },
  },
  pageSize: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Results per page (default: 10)",
      "zh-CN": "每页结果数（默认：10）",
    },
  },
} satisfies FlagsDef;
type ListFlags = ParsedFlags<typeof LIST_FLAGS>;

export default defineCommand({
  description: {
    "en-US": "List precompiled hot-word vocabularies",
    "zh-CN": "列出预编译热词表",
  },
  auth: "apiKey",
  usageArgs: "[--prefix <prefix>] [--page <n>] [--page-size <n>]",
  flags: LIST_FLAGS,
  notes: [
    {
      "en-US":
        "List responses do not include target_model; use `speech vocabulary get` to inspect the model a vocabulary was built for.",
      "zh-CN":
        "list 响应不含 target_model；要对齐模型请使用 `speech vocabulary get`。",
    },
    {
      "en-US":
        "Vocabularies with status UNDEPLOYED are silently ignored by ASR.",
      "zh-CN": "status 为 UNDEPLOYED 的热词表会被 ASR 静默忽略。",
    },
  ],
  exampleArgs: ["", "--prefix demo", "--page 2 --page-size 20"],
  validate: (flags: ListFlags) => {
    if (flags.page !== undefined && flags.page < 1) {
      return "--page must be >= 1.";
    }
    return undefined;
  },
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);

    const pageIndex = flags.page !== undefined ? flags.page - 1 : undefined;
    const input: Record<string, unknown> = {};
    if (flags.prefix !== undefined) input.prefix = flags.prefix;
    if (pageIndex !== undefined) input.page_index = pageIndex;
    if (flags.pageSize !== undefined) input.page_size = flags.pageSize;

    if (settings.dryRun) {
      emitResult(
        {
          endpoint: ctx.client.url(speechVocabularyPath()),
          request: buildVocabularyRequest("list_vocabulary", input),
        },
        format,
      );
      return;
    }

    const response = await listVocabularies(ctx.client, {
      prefix: flags.prefix,
      pageIndex,
      pageSize: flags.pageSize,
    });

    if (settings.quiet || format === "text") {
      const items = response.output?.vocabulary_list ?? [];
      if (items.length === 0) {
        emitBare("No vocabularies found.");
      } else {
        let hasUndeployed = false;
        for (const item of items) {
          const id = item.vocabulary_id ?? "";
          const status = item.status ?? "";
          const modified = item.gmt_modified ?? "";
          if (status === "UNDEPLOYED") hasUndeployed = true;
          emitBare(`[${id}] ${status} ${modified}`.trimEnd());
        }
        if (hasUndeployed) {
          emitBare(
            "Note: UNDEPLOYED vocabularies are silently ignored by ASR. Use `speech vocabulary get` to inspect them.",
          );
        }
      }
    } else {
      emitResult(response, format);
    }
  },
});

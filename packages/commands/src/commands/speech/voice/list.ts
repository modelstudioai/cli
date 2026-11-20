import {
  buildVoiceRequest,
  defineCommand,
  listVoices,
  speechVoiceCustomizationPath,
  type FlagsDef,
  type ParsedFlags,
} from "bailian-cli-core";
import { validatePositiveIntPage, validateVoicePrefix, VOICE_PREFIX_FLAG } from "./shared.ts";

const LIST_FLAGS = {
  ...VOICE_PREFIX_FLAG,
  page: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Page number, 1-based (default: 1). Mapped to API page_index as page - 1",
      "zh-CN": "页码，从 1 开始（默认：1）。映射为 API 的 page_index：page - 1",
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
    "en-US": "List custom voices",
    "zh-CN": "列出自定义音色",
  },
  auth: "apiKey",
  usageArgs: "[--prefix <text>] [--page <n>] [--page-size <n>]",
  flags: LIST_FLAGS,
  notes: [
    {
      "en-US":
        "Lists one page only (CLI defaults: page=1, page-size=10). Status values: DEPLOYING / OK / UNDEPLOYED.",
      "zh-CN":
        "只查询指定页（CLI 默认：page=1，page-size=10）。状态值：DEPLOYING / OK / UNDEPLOYED。",
    },
  ],
  exampleArgs: ["", "--prefix demo", "--page 2 --page-size 20"],
  validate: (flags: ListFlags) => {
    const prefixError = validateVoicePrefix(flags.prefix);
    if (prefixError) return prefixError;
    return validatePositiveIntPage(flags.page, flags.pageSize);
  },
  async run(ctx) {
    const { settings, flags } = ctx;

    const page = flags.page ?? 1;
    const pageSize = flags.pageSize ?? 10;
    const pageIndex = page - 1;

    const input: Record<string, unknown> = {
      page_index: pageIndex,
      page_size: pageSize,
    };
    if (flags.prefix !== undefined) input.prefix = flags.prefix;

    if (settings.dryRun) {
      ctx.output.result({
        endpoint: ctx.client.url(speechVoiceCustomizationPath()),
        request: buildVoiceRequest("list_voice", input),
      });
      return;
    }

    const response = await listVoices(ctx.client, {
      prefix: flags.prefix,
      pageIndex,
      pageSize,
    });

    let text: string | undefined;
    if (settings.output === "text") {
      const items = response.output?.voice_list ?? [];
      const lines: string[] = [];
      if (items.length === 0) {
        lines.push(
          ctx.localize({
            "en-US": "No voices found.",
            "zh-CN": "未找到音色。",
          }),
        );
      } else {
        for (const item of items) {
          const id = item.voice_id ?? "";
          const status = item.status ?? "";
          const targetModel = item.target_model ?? "";
          const modified = item.gmt_modified ?? "";
          lines.push(`[${id}] ${status} ${targetModel} ${modified}`.trimEnd());
        }
      }
      text = lines.join("\n");
    }
    ctx.output.result(response, { text });
  },
});

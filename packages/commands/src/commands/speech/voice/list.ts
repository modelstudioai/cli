import {
  buildOmniVoiceRequest,
  buildVoiceRequest,
  defineCommand,
  isOmniVoiceTargetModel,
  listOmniVoices,
  listVoices,
  speechVoiceCustomizationPath,
  type FlagsDef,
  type ParsedFlags,
} from "bailian-cli-core";
import { validatePositiveIntPage, validateVoicePrefix, VOICE_PREFIX_FLAG } from "./shared.ts";

const LIST_FLAGS = {
  ...VOICE_PREFIX_FLAG,
  targetModel: {
    type: "string",
    valueHint: "<model>",
    description: {
      "en-US":
        "Protocol switch only (not a filter): any qwen3.x-omni* id selects qwen-voice-enrollment and lists all Omni voices; omit for CosyVoice/Qwen-Audio voice-enrollment",
      "zh-CN":
        "仅用于选择协议（不做按模型过滤）：任意 qwen3.x-omni* 走 qwen-voice-enrollment 并列出全部 Omni 音色；省略则走 CosyVoice/Qwen-Audio voice-enrollment",
    },
  },
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
  usageArgs: "[--prefix <text>] [--target-model <model>] [--page <n>] [--page-size <n>]",
  flags: LIST_FLAGS,
  notes: [
    {
      "en-US":
        "Lists one page only (CLI defaults: page=1, page-size=10). CosyVoice/Qwen-Audio status: DEPLOYING / OK / UNDEPLOYED. Omni --target-model only switches protocol (returns all Omni voices; no server-side model filter; no --prefix).",
      "zh-CN":
        "只查询指定页（CLI 默认：page=1，page-size=10）。CosyVoice/Qwen-Audio 状态：DEPLOYING / OK / UNDEPLOYED。Omni 的 --target-model 只切换协议（返回全部 Omni 音色，服务端不按模型过滤；不支持 --prefix）。",
    },
  ],
  exampleArgs: [
    "",
    "--prefix demo",
    "--page 2 --page-size 20",
    "--target-model qwen3.5-omni-flash --dry-run --output json",
  ],
  validate: (flags: ListFlags) => {
    if (flags.targetModel !== undefined && !isOmniVoiceTargetModel(flags.targetModel)) {
      return {
        "en-US":
          "--target-model on list only selects the Omni enrollment protocol (pass any qwen3.x-omni* id). Omit it for CosyVoice/Qwen-Audio.",
        "zh-CN":
          "list 的 --target-model 仅用于选择 Omni 复刻协议（传入任意 qwen3.x-omni* 即可）。CosyVoice/Qwen-Audio 请省略。",
      };
    }
    const omni = flags.targetModel !== undefined && isOmniVoiceTargetModel(flags.targetModel);
    if (omni) {
      if (flags.prefix !== undefined) {
        return {
          "en-US": "--prefix is not supported when listing Omni voices (qwen-voice-enrollment).",
          "zh-CN": "列出 Omni 音色（qwen-voice-enrollment）时不支持 --prefix。",
        };
      }
    } else {
      const prefixError = validateVoicePrefix(flags.prefix);
      if (prefixError) return prefixError;
    }
    return validatePositiveIntPage(flags.page, flags.pageSize);
  },
  async run(ctx) {
    const { settings, flags } = ctx;

    const page = flags.page ?? 1;
    const pageSize = flags.pageSize ?? 10;
    const pageIndex = page - 1;
    const omni = flags.targetModel !== undefined && isOmniVoiceTargetModel(flags.targetModel);

    if (omni) {
      const input: Record<string, unknown> = {
        page_index: pageIndex,
        page_size: pageSize,
      };

      if (settings.dryRun) {
        ctx.output.result({
          endpoint: ctx.client.url(speechVoiceCustomizationPath()),
          request: buildOmniVoiceRequest("list", input),
        });
        return;
      }

      const response = await listOmniVoices(ctx.client, { pageIndex, pageSize });

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
            const voice = item.voice ?? "";
            const targetModel = item.target_model ?? "";
            const created = item.gmt_create ?? "";
            lines.push(`[${voice}] ${targetModel} ${created}`.trimEnd());
          }
        }
        text = lines.join("\n");
      }
      ctx.output.result(response, { text });
      return;
    }

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

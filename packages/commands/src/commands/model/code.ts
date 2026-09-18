import {
  BailianError,
  ExitCode,
  anonymousConsoleCall,
  defineCommand,
  detectOutputFormat,
  fetchModelDetail,
  type ModelGroupItem,
  type ModelSampleCodeV2,
  type ModelSampleSnippet,
} from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import { pickTrunkItems } from "./shared.ts";

/** `--api` values map onto the API-style keys used inside `sampleCodeV2`. */
const API_STYLE_KEYS: Record<string, string> = {
  completions: "completionsAPI",
  responses: "responsesAPI",
};

/**
 * The Node.js snippet key is published as `node` on some models and `nodejs` on
 * others, so accept either spelling regardless of which one a model uses.
 */
const LANG_ALIASES: Record<string, string> = { node: "nodejs", nodejs: "node" };

const PREFERRED_SDK = "openai";
const PREFERRED_API_STYLE = "completionsAPI";
const PREFERRED_LANG = "python";

export interface ResolvedSample {
  sdk: string;
  apiStyle: string;
  lang: string;
  code: string;
}

/** Human-readable inventory of what the payload actually offers. */
export function describeSampleAvailability(sampleCode: ModelSampleCodeV2): string {
  return Object.entries(sampleCode)
    .map(([sdk, apiStyles]) => {
      const styles = Object.entries(apiStyles ?? {})
        .map(([apiStyle, languages]) => `${apiStyle}: ${Object.keys(languages ?? {}).join(",")}`)
        .join(" | ");
      return `${sdk} (${styles})`;
    })
    .join("; ");
}

function firstKey(keys: string[], preferred: string): string | undefined {
  return keys.includes(preferred) ? preferred : keys[0];
}

/** Honour the requested language, falling back to its alias spelling if published. */
function resolveLangKey(languages: Record<string, ModelSampleSnippet>, requested: string): string {
  if (languages[requested]) return requested;
  const alias = LANG_ALIASES[requested];
  return alias && languages[alias] ? alias : requested;
}

/**
 * Pick one snippet out of the `sdk → apiStyle → lang` tree. Every requested
 * level is validated against the payload, and a miss reports what *is*
 * available rather than silently substituting a different language.
 */
export function resolveSample(
  sampleCode: ModelSampleCodeV2,
  requested: { sdk?: string; api?: string; lang?: string },
): ResolvedSample {
  const availability = describeSampleAvailability(sampleCode);
  const sdkKeys = Object.keys(sampleCode);
  if (sdkKeys.length === 0) {
    throw new BailianError("This model publishes no SDK sample code.", ExitCode.GENERAL);
  }

  const sdk = requested.sdk ?? firstKey(sdkKeys, PREFERRED_SDK) ?? sdkKeys[0]!;
  if (!sampleCode[sdk]) {
    throw new BailianError(
      `Unknown --sdk "${requested.sdk}". Available: ${availability}`,
      ExitCode.USAGE,
    );
  }

  const apiStyles = sampleCode[sdk]!;
  const styleKeys = Object.keys(apiStyles);
  let apiStyle: string;
  if (requested.api) {
    apiStyle = API_STYLE_KEYS[requested.api] ?? requested.api;
    if (!apiStyles[apiStyle]) {
      throw new BailianError(
        `Unknown --api "${requested.api}" for sdk "${sdk}". Available: ${availability}`,
        ExitCode.USAGE,
      );
    }
  } else {
    apiStyle = firstKey(styleKeys, PREFERRED_API_STYLE) ?? styleKeys[0]!;
  }

  const languages = apiStyles[apiStyle]!;
  const langKeys = Object.keys(languages);
  const lang = requested.lang
    ? resolveLangKey(languages, requested.lang)
    : (firstKey(langKeys, PREFERRED_LANG) ?? langKeys[0]!);
  if (!languages[lang]) {
    throw new BailianError(
      `Unknown --lang "${requested.lang}" for ${sdk}/${apiStyle}. Available: ${availability}`,
      ExitCode.USAGE,
    );
  }

  const code = languages[lang]?.code;
  if (!code) {
    throw new BailianError(
      `No snippet published for ${sdk}/${apiStyle}/${lang}. Available: ${availability}`,
      ExitCode.GENERAL,
    );
  }

  return { sdk, apiStyle, lang, code };
}

/** Prefer the exact model asked for, then any trunk item that carries samples. */
function pickSampleBearingItem(
  items: ModelGroupItem[],
  modelKey: string,
): ModelGroupItem | undefined {
  const exact = items.find((item) => item.model === modelKey);
  if (exact?.sampleCodeV2) return exact;
  const trunk = pickTrunkItems(items).find((item) => item.sampleCodeV2);
  return trunk ?? items.find((item) => item.sampleCodeV2);
}

export default defineCommand({
  description: {
    "en-US": "Print a ready-to-run SDK sample for calling a model",
    "zh-CN": "打印调用指定模型的 SDK 示例代码",
  },
  auth: "none",
  usageArgs: "--model <model> [--sdk <sdk>] [--api <style>] [--lang <lang>]",
  flags: {
    model: {
      type: "string",
      valueHint: "<model>",
      required: true,
      description: {
        "en-US": "Model to generate a sample for",
        "zh-CN": "要生成示例代码的模型",
      },
    },
    sdk: {
      type: "string",
      valueHint: "<sdk>",
      description: {
        "en-US": "SDK flavour: openai (default) or dashscope",
        "zh-CN": "SDK 类型：openai（默认）或 dashscope",
      },
    },
    api: {
      type: "string",
      valueHint: "<style>",
      description: {
        "en-US":
          "API style: completions (default) or responses; ignored when the SDK has one style",
        "zh-CN": "API 形态：completions（默认）或 responses；SDK 只有一种形态时忽略",
      },
    },
    lang: {
      type: "string",
      valueHint: "<lang>",
      description: {
        "en-US":
          "Language of the snippet (default: python). Published per model — pass an unsupported value to list them",
        "zh-CN": "示例代码语言（默认：python）。可选值按模型发布，传入不支持的值即可列出",
      },
    },
  },
  exampleArgs: [
    "--model qwen-max",
    "--model qwen-max --lang curl",
    "--model qwen-max --sdk dashscope --lang java",
    "--model qwen-max --api responses --lang node",
    "--model qwen-max --output json",
  ],
  notes: [
    {
      "en-US":
        "Text output is the snippet alone, so it can be redirected straight into a file. Use --output json for the snippet plus its metadata.",
      "zh-CN": "text 模式只输出代码本身，可直接重定向到文件；需要元信息请用 --output json。",
    },
    {
      "en-US":
        "Samples use a `[workspace-id]` placeholder in the base URL — replace it, or set BAILIAN_WORKSPACE_ID and use the DashScope endpoint.",
      "zh-CN":
        "示例中的 base URL 含 `[workspace-id]` 占位符，请替换为实际 Workspace ID，或设置 BAILIAN_WORKSPACE_ID 后使用 DashScope 域名。",
    },
    {
      "en-US":
        "Available combinations are published per model; pass an unknown value to see the list for that model.",
      "zh-CN": "可用组合按模型发布；传入不支持的取值即可看到该模型的可用列表。",
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = settings.outputExplicit ? detectOutputFormat(settings.output) : "text";
    const call = anonymousConsoleCall(settings);

    if (settings.dryRun) {
      emitResult(
        {
          action: "model.code",
          model: flags.model,
          sdk: flags.sdk,
          api: flags.api,
          lang: flags.lang,
        },
        format,
      );
      return;
    }

    const detail = await fetchModelDetail(call, flags.model);
    if (!detail) {
      throw new BailianError(
        `Model "${flags.model}" not found.`,
        ExitCode.GENERAL,
        `Run "model list" to browse the catalog.`,
      );
    }

    const item = pickSampleBearingItem(detail.items ?? [], flags.model);
    if (!item?.sampleCodeV2) {
      throw new BailianError(
        `Model "${flags.model}" publishes no SDK sample code.`,
        ExitCode.GENERAL,
        "Speech, image and video models are called through their own command groups.",
      );
    }

    const sample = resolveSample(item.sampleCodeV2, {
      sdk: flags.sdk,
      api: flags.api,
      lang: flags.lang,
    });

    if (format === "json") {
      emitResult(
        {
          model: item.model,
          requestedModel: flags.model,
          sdk: sample.sdk,
          apiStyle: sample.apiStyle,
          lang: sample.lang,
          available: describeSampleAvailability(item.sampleCodeV2),
          code: sample.code,
        },
        format,
      );
      return;
    }

    emitBare(sample.code);
  },
});

import { httpTransport } from "bailian-cli-core";
import { writeFileSync } from "fs";
import {
  BailianError,
  defineCommand,
  ExitCode,
  type CommandOutput,
  type Client,
  type Settings,
  type DashScopeASRRequest,
  type DashScopeASRTaskResult,
  type DashScopeAsyncResponse,
  stripUndefined,
  taskPath,
  speechRecognizePath,
  resolveAsrApi,
  buildAsrFlashRequest,
  buildAsrContextMessages,
  buildAsyncAsrLanguageFields,
  collectAsrTranscriptionItems,
  extractAsrFlashText,
  parseInstantVocabulary,
  type AsrApiRoute,
  type AsrFlashFamily,
  type FlagsDef,
  type ParsedFlags,
  ASYNC_FLAG,
  redactDataUri,
  bailianMcpPath,
  AIGC_MCP_SERVER,
  AIGC_MCP_TOOL,
  buildSpeechToTextArgs,
  parseAigcAsrTexts,
} from "bailian-cli-core";
import { poll } from "bailian-cli-runtime";
import {
  isAutoModel,
  assertAutoMcpAvailable,
  assertMcpCompatible,
  withAigcMcpSession,
  resolveAutoAsrInput,
  type Localize,
} from "../shared/aigc-mcp.ts";

const RECOGNIZE_FLAGS = {
  url: {
    type: "array",
    valueHint: "<url>",
    description: {
      "en-US": "Audio file URL or local file path (repeatable, max 100)",
      "zh-CN": "音频文件 URL 或本地文件路径（可重复，最多 100 个）",
    },
    required: true,
  },
  model: {
    type: "string",
    valueHint: "<model>",
    description: {
      "en-US":
        "Model ID (default: configured Profile ASR model, otherwise fun-asr). Async: fun-asr / *-filetrans / paraformer-*; sync: qwen3-asr-flash* / fun-asr-flash* / qwen-audio-*-asr-flash",
      "zh-CN":
        "模型 ID（默认：Profile 配置的 ASR 模型，否则为 fun-asr）。异步：fun-asr / *-filetrans / paraformer-*；同步：qwen3-asr-flash* / fun-asr-flash* / qwen-audio-*-asr-flash",
    },
  },
  language: {
    type: "string",
    valueHint: "<lang>",
    description: {
      "en-US":
        "Language hint (e.g. zh, en, ja). Classic async/input-audio: language_hints; qwen3-filetrans: language; qwen3 sync: asr_options.language",
      "zh-CN":
        "语言提示（例如 zh、en、ja）。传统异步/input-audio：language_hints；qwen3-filetrans：language；qwen3 同步：asr_options.language",
    },
  },
  diarization: {
    type: "switch",
    description: { "en-US": "Enable automatic speaker diarization", "zh-CN": "启用自动说话人分离" },
  },
  speakerCount: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Expected number of speakers (requires --diarization)",
      "zh-CN": "预期的说话人数量（需启用 --diarization）",
    },
  },
  vocabularyId: {
    type: "string",
    valueHint: "<id>",
    description: {
      "en-US":
        "Pre-built hot-word vocabulary ID (create it via `speech vocabulary create`). Its target_model must exactly match --model, otherwise it is silently ignored. Wider model support than --vocabulary, including Fun-ASR and Paraformer",
      "zh-CN":
        "预编译热词列表 ID（可用 `speech vocabulary create` 创建）。其 target_model 必须与 --model 完全一致，否则静默失效且无报错。支持模型比 --vocabulary 更广，含 Fun-ASR 与 Paraformer 系列",
    },
  },
  vocabulary: {
    type: "string",
    valueHint: "<json>",
    description: {
      "en-US":
        "Instant hot words as JSON object of word→weight, e.g. '{\"Fendouzhe\":4}'. Weight 1-5 (4 recommended; higher values can hurt other words), 50 for super hot word. No pre-built vocabulary needed. Takes effect only on Qwen-Audio-3.0-ASR-Flash models",
      "zh-CN":
        "即时热词，JSON 对象「热词→权重」，例如 '{\"奋斗者\":4}'。权重 1-5（推荐 4，过高会拖累其他词），50 表示超级热词。无需预先创建热词表。仅 Qwen-Audio-3.0-ASR-Flash 系列模型生效",
    },
  },
  context: {
    type: "string",
    valueHint: "<text>",
    description: {
      "en-US":
        "Context enhancement word list to improve accuracy on proper nouns; must contain the target words themselves (a topic description alone has little effect); max 400 chars. Takes effect only on Qwen-Audio-3.0-ASR-Flash and Fun-ASR-Flash models",
      "zh-CN":
        "上下文增强词表，提升专有名词准确率；须包含待识别的原词本身（只写主题描述效果有限），最长 400 字符。仅 Qwen-Audio-3.0-ASR-Flash 系列与 Fun-ASR-Flash 模型生效",
    },
  },
  channelId: {
    type: "number",
    valueHint: "<n>",
    description: { "en-US": "Audio channel ID (default: 0)", "zh-CN": "音频声道 ID（默认：0）" },
  },
  out: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Save full transcription result to JSON file",
      "zh-CN": "将完整转写结果保存到 JSON 文件",
    },
  },
  ...ASYNC_FLAG,
  pollInterval: {
    type: "number",
    valueHint: "<seconds>",
    description: {
      "en-US": "Polling interval in seconds (default: 2)",
      "zh-CN": "轮询间隔，单位为秒（默认：2）",
    },
  },
} satisfies FlagsDef;
type RecognizeFlags = ParsedFlags<typeof RECOGNIZE_FLAGS>;

function assertSyncFlashFlagsAllowed(
  flags: RecognizeFlags,
  model: string,
  flashFamily: AsrFlashFamily,
): void {
  const unsupported: string[] = [];
  if (flags.diarization === true) unsupported.push("--diarization");
  if (flags.speakerCount !== undefined) unsupported.push("--speaker-count");
  // qwen3 sync Flash has no place for vocabulary_id / vocabulary / context in its body shape
  if (flashFamily === "qwen3") {
    if (flags.vocabularyId !== undefined) unsupported.push("--vocabulary-id");
    if (flags.vocabulary !== undefined) unsupported.push("--vocabulary");
    if (flags.context !== undefined) unsupported.push("--context");
  }
  if (flags.channelId !== undefined) unsupported.push("--channel-id");
  if (flags.async === true) unsupported.push("--async");
  if (flags.pollInterval !== undefined) unsupported.push("--poll-interval");

  if (unsupported.length > 0) {
    throw new BailianError(
      `Model "${model}" uses sync Flash ASR and does not support: ${unsupported.join(", ")}.\n` +
        syncFlashUnsupportedHint(unsupported),
      ExitCode.USAGE,
    );
  }
}

/** Pick a hint that matches the rejected flags (vocab/context vs diarization/async/…). */
function syncFlashUnsupportedHint(unsupported: string[]): string {
  const vocabularyRelated = new Set(["--vocabulary", "--vocabulary-id", "--context"]);
  const hasVocabularyRelated = unsupported.some((flag) => vocabularyRelated.has(flag));
  const hasOtherFlags = unsupported.some((flag) => !vocabularyRelated.has(flag));

  if (hasVocabularyRelated && !hasOtherFlags) {
    return (
      "Hint: Use qwen-audio-3.0-asr-flash (or an async filetrans model such as " +
      "qwen-audio-3.0-asr-flash-filetrans) for vocabulary/context flags."
    );
  }
  if (hasVocabularyRelated && hasOtherFlags) {
    return (
      "Hint: For vocabulary/context flags use qwen-audio-3.0-asr-flash or " +
      "qwen-audio-3.0-asr-flash-filetrans; for the other flags use an async filetrans model " +
      "(e.g. fun-asr)."
    );
  }
  return "Hint: Use an async filetrans model (e.g. fun-asr, qwen3-asr-flash-filetrans) for those flags.";
}

export default defineCommand({
  description: {
    "en-US": "Recognize speech from audio files (FunAudio-ASR / Qwen-ASR Flash)",
    "zh-CN": "识别音频文件中的语音（FunAudio-ASR / Qwen-ASR Flash）",
  },
  auth: "apiKey",
  usageArgs: "--url <audio-url> [flags]",
  flags: RECOGNIZE_FLAGS,
  exampleArgs: [
    "--url https://example.com/audio.mp3",
    "--url https://example.com/a.mp3 --url https://example.com/b.mp3",
    "--url https://example.com/meeting.wav --diarization --speaker-count 3",
    "--url https://example.com/audio.mp3 --language zh",
    "--url https://example.com/audio.mp3 --vocabulary-id vocab-abc123",
    '--url https://example.com/audio.mp3 --model qwen-audio-3.0-asr-flash-filetrans --vocabulary \'{"奋斗者":4,"鲸落":4}\'',
    '--url https://example.com/audio.mp3 --model qwen-audio-3.0-asr-flash-filetrans --context "奋斗者号 鲸落 深海勇士"',
    "--url https://example.com/audio.mp3 --out result.json",
    "--url https://example.com/audio.mp3 --async --quiet",
    "--url https://example.com/audio.mp3 --model qwen-audio-3.0-asr-flash --language en",
  ],
  notes: [
    {
      "en-US":
        'Model "auto" (via --model auto or a config default model of "auto") routes to the official Bailian MCP with a reduced parameter set and simplified text output; MCP-incompatible flags fail fast with a usage error instead of falling back to REST.',
      "zh-CN":
        '模型 "auto"（通过 --model auto 或将配置默认模型设为 "auto"）改走百炼官方 MCP，参数面更小、输出为简化文本；MCP 不支持的参数会直接报用法错误，而不回退 REST。',
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    // Normalize --url to string[] (supports both single and repeated flags)
    let rawUrls: string[] = [];
    if (Array.isArray(flags.url)) {
      rawUrls = flags.url;
    } else if (typeof flags.url === "string") {
      rawUrls = [flags.url];
    }

    const resolvedModel = flags.model || settings.defaultSpeechRecognitionModel;
    if (isAutoModel(resolvedModel)) {
      await handleAutoMcpMode(ctx.client, ctx.output, ctx.localize, settings, flags, rawUrls);
      return;
    }

    // Strict validation: --speaker-count requires --diarization
    const speakerCount = flags.speakerCount;
    const diarization = flags.diarization === true;
    if (speakerCount !== undefined && !diarization) {
      throw new BailianError(
        "--speaker-count requires --diarization to be enabled.\nHint: Add --diarization flag to enable speaker separation.",
        ExitCode.USAGE,
      );
    }

    const model = resolvedModel || "fun-asr";
    const route = resolveAsrApi(model);
    if (route.kind === "unsupported") {
      throw new BailianError(
        route.unsupportedReason ?? `Unsupported ASR model: ${model}`,
        ExitCode.USAGE,
      );
    }

    if (route.kind === "sync-flash") {
      assertSyncFlashFlagsAllowed(flags, model, route.flashFamily!);
      if (rawUrls.length !== 1) {
        throw new BailianError(
          `Model "${model}" is a sync Flash ASR model and accepts exactly one --url (got ${rawUrls.length}).\n` +
            `Hint: Pass a single audio URL, or use an async filetrans model for batch files.`,
          ExitCode.USAGE,
        );
      }
    }
    if (
      route.kind === "async-filetrans" &&
      route.asyncInputStyle === "file_url" &&
      rawUrls.length !== 1
    ) {
      throw new BailianError(
        `Model "${model}" accepts exactly one --url (got ${rawUrls.length}).\n` +
          "Hint: qwen3-asr-flash-filetrans* requires a single file_url.",
        ExitCode.USAGE,
      );
    }

    const vocabulary =
      flags.vocabulary !== undefined ? parseInstantVocabulary(flags.vocabulary) : undefined;

    // Auto-upload local files in parallel
    const resolvedUrls = await Promise.all(rawUrls.map((url) => ctx.client.uploadFile(url, model)));

    if (route.kind === "sync-flash") {
      await handleSyncFlashMode(
        ctx.client,
        ctx.output,
        settings,
        flags,
        model,
        route,
        resolvedUrls[0]!,
        vocabulary,
      );
      return;
    }

    const channelId = flags.channelId;
    const vocabularyId = flags.vocabularyId;
    const languageFields = buildAsyncAsrLanguageFields(
      route.asyncLanguageStyle ?? "language_hints",
      flags.language,
    );

    const body: DashScopeASRRequest = {
      model,
      input: {
        ...(route.asyncInputStyle === "file_url"
          ? { file_url: resolvedUrls[0]! }
          : { file_urls: resolvedUrls }),
        ...(flags.context !== undefined ? { context: buildAsrContextMessages(flags.context) } : {}),
      },
      parameters: {
        channel_id: channelId !== undefined ? [channelId] : [0],
        ...languageFields,
        diarization_enabled: diarization ? true : undefined,
        speaker_count: speakerCount,
        vocabulary_id: vocabularyId,
        vocabulary,
      },
    };

    // Remove undefined parameter fields
    stripUndefined(body.parameters as Record<string, unknown>);

    if (settings.dryRun) {
      ctx.output.result({ request: body, mode: "async", path: speechRecognizePath() });
      return;
    }

    ctx.output.info({
      "en-US": `[Model: ${model}] [Mode: async] [Files: ${resolvedUrls.length}]`,
      "zh-CN": `[模型：${model}] [模式：异步] [文件数：${resolvedUrls.length}]`,
    });

    await handleAsyncMode(ctx.client, ctx.output, settings, body, flags, resolvedUrls.length);
  },
});

async function handleAutoMcpMode(
  client: Client,
  commandOutput: CommandOutput,
  localize: Localize,
  settings: Settings,
  flags: RecognizeFlags,
  rawUrls: string[],
): Promise<void> {
  assertAutoMcpAvailable(client, localize);
  assertMcpCompatible("asr", flags, localize);

  if (rawUrls.length === 0) {
    throw new BailianError("Provide at least one --url to recognize.", ExitCode.USAGE);
  }

  // The live MCP ASR server only transcribes public http(s) URLs; local files
  // and data URIs are rejected up front instead of silently empty results.
  const fileUrls = rawUrls.map((source) => resolveAutoAsrInput(source, localize));
  const args = buildSpeechToTextArgs(fileUrls);

  if (settings.dryRun) {
    commandOutput.result({
      server: AIGC_MCP_SERVER.asr,
      url: client.url(bailianMcpPath(AIGC_MCP_SERVER.asr)),
      tool: AIGC_MCP_TOOL.speechToText,
      arguments: { ...args, file_urls: fileUrls.map((fileUrl) => redactDataUri(fileUrl)) },
      mode: "mcp",
    });
    return;
  }

  commandOutput.info({
    "en-US": `[Model: auto] [Mode: mcp] [Files: ${fileUrls.length}]`,
    "zh-CN": `[模型：auto] [模式：mcp] [文件：${fileUrls.length}]`,
  });

  // bailian_speech_to_text is synchronous: one tools/call returns all transcripts.
  const result = await withAigcMcpSession(client, AIGC_MCP_SERVER.asr, localize, (callTool) =>
    callTool(AIGC_MCP_TOOL.speechToText, args),
  );

  const texts = parseAigcAsrTexts(result);

  if (flags.out) {
    writeFileSync(flags.out, JSON.stringify(texts, null, 2) + "\n");
    commandOutput.info({
      "en-US": `Full result saved to: ${flags.out}`,
      "zh-CN": `完整结果已保存至：${flags.out}`,
    });
  }
  commandOutput.result(result, {
    text: texts.map((text) => (text.endsWith("\n") ? text.slice(0, -1) : text)).join("\n"),
  });
}

async function handleSyncFlashMode(
  client: Client,
  commandOutput: CommandOutput,
  settings: Settings,
  flags: RecognizeFlags,
  model: string,
  route: AsrApiRoute,
  audioUrl: string,
  vocabulary: Record<string, number> | undefined,
): Promise<void> {
  const flashFamily = route.flashFamily as AsrFlashFamily;
  const body = buildAsrFlashRequest({
    model,
    audioUrl,
    language: flags.language,
    vocabularyId: flags.vocabularyId,
    vocabulary,
    context: flags.context,
    flashFamily,
  });

  if (settings.dryRun) {
    commandOutput.result({ request: body, mode: "sync", path: route.path });
    return;
  }

  commandOutput.info({
    "en-US": `[Model: ${model}] [Mode: sync] [Files: 1]`,
    "zh-CN": `[模型：${model}] [模式：同步] [文件数：1]`,
  });

  const response = await client.requestJson<Record<string, unknown>>({
    path: route.path,
    method: "POST",
    headers: { "X-DashScope-SSE": "disable" },
    body,
  });

  if (flags.out) {
    writeFileSync(flags.out, JSON.stringify(response, null, 2) + "\n");
  }

  const text = settings.output === "text" ? extractAsrFlashText(response, flashFamily) : "";
  commandOutput.result(
    response,
    settings.output === "text"
      ? { text: text ? text.replace(/\n$/, "") : JSON.stringify(response) }
      : undefined,
  );
  if (flags.out) {
    commandOutput.info({
      "en-US": `Full result saved to: ${flags.out}`,
      "zh-CN": `完整结果已保存至：${flags.out}`,
    });
  }
}

async function handleAsyncMode(
  client: Client,
  commandOutput: CommandOutput,
  settings: Settings,
  body: DashScopeASRRequest,
  flags: RecognizeFlags,
  fileCount: number,
): Promise<void> {
  // Submit async task (always required for fun-asr)
  const response = await client.requestJson<DashScopeAsyncResponse>({
    path: speechRecognizePath(),
    method: "POST",
    body,
    async: true,
  });

  const taskId = response.output.task_id;

  // --async: return task ID immediately
  if (flags.async) {
    commandOutput.result({ task_id: taskId });
    return;
  }

  // Poll until completion
  const pollInterval = flags.pollInterval ?? 2;
  const pollUrl = client.url(taskPath(taskId));

  const result = await poll<DashScopeASRTaskResult>(client, {
    output: commandOutput,
    url: pollUrl,
    intervalSec: pollInterval,
    timeoutSec: settings.timeout,
    isComplete: (data) => (data as DashScopeASRTaskResult).output.task_status === "SUCCEEDED",
    isFailed: (data) => (data as DashScopeASRTaskResult).output.task_status === "FAILED",
    getStatus: (data) => (data as DashScopeASRTaskResult).output.task_status,
    getErrorMessage: (data) => {
      const output = (data as DashScopeASRTaskResult).output;
      return (output as unknown as Record<string, unknown>).message as string | undefined;
    },
  });

  const results = collectAsrTranscriptionItems(result.output);

  if (results.length === 0) {
    commandOutput.result({ task_id: taskId, status: result.output.task_status });
    return;
  }

  // Collect all transcription data for --out
  const allTransData: Record<string, unknown>[] = [];
  const textParts: string[] = [];

  for (let index = 0; index < results.length; index++) {
    const subResult = results[index]!;
    const isMulti = fileCount > 1;

    if (settings.output === "text" && isMulti) {
      textParts.push(`=== [${index + 1}/${results.length}] ${subResult.file_url ?? ""} ===\n`);
    }

    if (subResult.subtask_status === "FAILED") {
      const errMsg = subResult.message ?? subResult.code ?? "unknown error";
      if (settings.output === "text") {
        textParts.push(`[FAILED] ${subResult.file_url ?? ""} — ${errMsg}\n`);
        if (isMulti) textParts.push("\n");
      }
      continue;
    }

    if (!subResult.transcription_url) {
      if (settings.output === "text" && isMulti) textParts.push("\n");
      continue;
    }

    // Fetch transcription JSON
    const transRes = await httpTransport.fetch(subResult.transcription_url);
    if (!transRes.ok) {
      throw new BailianError(
        `Failed to download transcription: HTTP ${transRes.status}`,
        ExitCode.GENERAL,
      );
    }
    const transData = (await transRes.json()) as Record<string, unknown>;
    allTransData.push(transData);

    if (settings.output === "text") {
      // Extract and output text from transcripts[]
      const transcripts = transData.transcripts as
        | Array<{
            text?: string;
            sentences?: Array<{ text: string; speaker_id?: number }>;
          }>
        | undefined;

      if (transcripts && transcripts.length > 0) {
        for (const transcript of transcripts) {
          if (transcript.sentences && transcript.sentences.length > 0) {
            for (const sentence of transcript.sentences) {
              const speakerTag =
                sentence.speaker_id !== undefined ? ` [Speaker ${sentence.speaker_id}]` : "";
              textParts.push(`${sentence.text}${speakerTag}\n`);
            }
          } else if (transcript.text) {
            textParts.push(transcript.text + "\n");
          }
        }
      } else {
        textParts.push(JSON.stringify(transData) + "\n");
      }

      if (isMulti) textParts.push("\n");
    }
  }

  // Save to --out file
  if (flags.out) {
    const outPath = flags.out;
    const outData = allTransData.length === 1 ? allTransData[0] : allTransData;
    writeFileSync(outPath, JSON.stringify(outData, null, 2) + "\n");
  }

  if (settings.output === "json" || textParts.length > 0) {
    commandOutput.result(
      { ...result, transcriptions: allTransData },
      { text: textParts.join("").replace(/\n$/, "") },
    );
  }
  if (flags.out) {
    commandOutput.info({
      "en-US": `Full result saved to: ${flags.out}`,
      "zh-CN": `完整结果已保存至：${flags.out}`,
    });
  }
}

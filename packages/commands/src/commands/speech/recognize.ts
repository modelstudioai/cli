import { writeFileSync } from "fs";
import {
  BailianError,
  defineCommand,
  ExitCode,
  detectOutputFormat,
  type Client,
  type Settings,
  type DashScopeASRRequest,
  type DashScopeASRTaskResult,
  type DashScopeAsyncResponse,
  stripUndefined,
  taskPath,
  speechRecognizePath,
  type OutputFormat,
  type FlagsDef,
  type ParsedFlags,
  ASYNC_FLAG,
} from "bailian-cli-core";
import { poll } from "bailian-cli-runtime";
import { emitResult, emitBare } from "bailian-cli-runtime";

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
      "en-US": "Model ID (default: fun-asr)",
      "zh-CN": "模型 ID（默认：fun-asr）",
    },
  },
  language: {
    type: "string",
    valueHint: "<lang>",
    description: {
      "en-US": "Language hint (e.g. zh, en, ja)",
      "zh-CN": "语言提示（例如 zh、en、ja）",
    },
  },
  diarization: {
    type: "switch",
    description: {
      "en-US": "Enable automatic speaker diarization",
      "zh-CN": "启用自动说话人分离",
    },
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
      "en-US": "Hot-word vocabulary ID for improved accuracy",
      "zh-CN": "用于提升识别准确率的热词表 ID",
    },
  },
  channelId: {
    type: "number",
    valueHint: "<n>",
    description: {
      "en-US": "Audio channel ID (default: 0)",
      "zh-CN": "音频声道 ID（默认：0）",
    },
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

export default defineCommand({
  description: {
    "en-US": "Recognize speech from audio files (FunAudio-ASR)",
    "zh-CN": "识别音频文件中的语音（FunAudio-ASR）",
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
    "--url https://example.com/audio.mp3 --out result.json",
    "--url https://example.com/audio.mp3 --async --quiet",
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

    // Strict validation: --speaker-count requires --diarization
    const speakerCount = flags.speakerCount;
    const diarization = flags.diarization === true;
    if (speakerCount !== undefined && !diarization) {
      throw new BailianError(
        "--speaker-count requires --diarization to be enabled.\nHint: Add --diarization flag to enable speaker separation.",
        ExitCode.USAGE,
      );
    }

    const model = flags.model || "fun-asr";
    const format = detectOutputFormat(settings.output);

    // Auto-upload local files in parallel
    const resolvedUrls = await Promise.all(rawUrls.map((u) => ctx.client.uploadFile(u, model)));
    const channelId = flags.channelId;
    const language = flags.language;
    const vocabularyId = flags.vocabularyId;

    const body: DashScopeASRRequest = {
      model,
      input: {
        file_urls: resolvedUrls,
      },
      parameters: {
        channel_id: channelId !== undefined ? [channelId] : [0],
        language_hints: language ? [language] : undefined,
        diarization_enabled: diarization ? true : undefined,
        speaker_count: speakerCount,
        vocabulary_id: vocabularyId,
      },
    };

    // Remove undefined parameter fields
    stripUndefined(body.parameters as Record<string, unknown>);

    if (settings.dryRun) {
      emitResult({ request: body, mode: "async" }, format);
      return;
    }

    if (!settings.quiet) {
      process.stderr.write(`[Model: ${model}] [Mode: async] [Files: ${resolvedUrls.length}]\n`);
    }

    await handleAsyncMode(ctx.client, settings, body, flags, format, resolvedUrls.length);
  },
});

async function handleAsyncMode(
  client: Client,
  settings: Settings,
  body: DashScopeASRRequest,
  flags: RecognizeFlags,
  format: OutputFormat,
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
    emitResult({ task_id: taskId }, format);
    return;
  }

  // Poll until completion
  const pollInterval = flags.pollInterval ?? 2;
  const pollUrl = client.url(taskPath(taskId));

  const result = await poll<DashScopeASRTaskResult>(client, settings, {
    url: pollUrl,
    intervalSec: pollInterval,
    timeoutSec: settings.timeout,
    isComplete: (d) => (d as DashScopeASRTaskResult).output.task_status === "SUCCEEDED",
    isFailed: (d) => (d as DashScopeASRTaskResult).output.task_status === "FAILED",
    getStatus: (d) => (d as DashScopeASRTaskResult).output.task_status,
    getErrorMessage: (d) => {
      const o = (d as DashScopeASRTaskResult).output;
      return (o as unknown as Record<string, unknown>).message as string | undefined;
    },
  });

  const results = result.output.results ?? [];

  if (results.length === 0) {
    emitResult({ task_id: taskId, status: result.output.task_status }, format);
    return;
  }

  // Collect all transcription data for --out
  const allTransData: Record<string, unknown>[] = [];

  for (let i = 0; i < results.length; i++) {
    const subResult = results[i]!;
    const isMulti = fileCount > 1;

    if (isMulti) {
      process.stdout.write(`=== [${i + 1}/${results.length}] ${subResult.file_url ?? ""} ===\n`);
    }

    if (subResult.subtask_status === "FAILED") {
      const errMsg = subResult.message ?? subResult.code ?? "unknown error";
      process.stdout.write(`[FAILED] ${subResult.file_url ?? ""} — ${errMsg}\n`);
      if (isMulti) process.stdout.write("\n");
      continue;
    }

    if (!subResult.transcription_url) {
      if (isMulti) process.stdout.write("\n");
      continue;
    }

    // Fetch transcription JSON
    const transRes = await fetch(subResult.transcription_url);
    if (!transRes.ok) {
      throw new BailianError(
        `Failed to download transcription: HTTP ${transRes.status}`,
        ExitCode.GENERAL,
      );
    }
    const transData = (await transRes.json()) as Record<string, unknown>;
    allTransData.push(transData);

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
            process.stdout.write(`${sentence.text}${speakerTag}\n`);
          }
        } else if (transcript.text) {
          process.stdout.write(transcript.text + "\n");
        }
      }
    } else {
      emitBare(JSON.stringify(transData));
    }

    if (isMulti) process.stdout.write("\n");
  }

  // Save to --out file
  if (flags.out) {
    const outPath = flags.out;
    const outData = allTransData.length === 1 ? allTransData[0] : allTransData;
    writeFileSync(outPath, JSON.stringify(outData, null, 2) + "\n");
    if (!settings.quiet) {
      process.stderr.write(`Full result saved to: ${outPath}\n`);
    }
  }
}

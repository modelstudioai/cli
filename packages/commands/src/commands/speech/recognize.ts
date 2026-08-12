import { writeFileSync } from "fs";
import { extname } from "node:path";
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
  speechRecognizeFlashPath,
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
    description: "Audio URL or local path (repeatable for async models, max 100)",
    required: true,
  },
  model: { type: "string", valueHint: "<model>", description: "Model ID (default: fun-asr)" },
  language: { type: "string", valueHint: "<lang>", description: "Language hint (e.g. zh, en, ja)" },
  diarization: { type: "switch", description: "Enable automatic speaker diarization" },
  speakerCount: {
    type: "number",
    valueHint: "<n>",
    description: "Expected number of speakers (requires --diarization)",
  },
  vocabularyId: {
    type: "string",
    valueHint: "<id>",
    description: "Hot-word vocabulary ID for improved accuracy",
  },
  channelId: { type: "number", valueHint: "<n>", description: "Audio channel ID (default: 0)" },
  out: {
    type: "string",
    valueHint: "<path>",
    description: "Save full transcription result to JSON file",
  },
  ...ASYNC_FLAG,
  pollInterval: {
    type: "number",
    valueHint: "<seconds>",
    description: "Polling interval in seconds (default: 2)",
  },
} satisfies FlagsDef;
type RecognizeFlags = ParsedFlags<typeof RECOGNIZE_FLAGS>;

interface DashScopeFlashASRResponse {
  output?: {
    text?: string;
    sentence?: { text?: string };
    output?: { sentence?: { text?: string } };
  };
  request_id?: string;
  usage?: Record<string, unknown>;
}

function isSynchronousFlashModel(model: string): boolean {
  return /^(?:fun-asr-flash|qwen-audio-3\.0-asr-flash)(?:-\d{4}-\d{2}-\d{2})?$/.test(model);
}

function inferAudioFormat(source: string): string {
  const dataType = /^data:audio\/([^;,]+)/i.exec(source)?.[1]?.toLowerCase();
  if (dataType) {
    if (dataType === "mpeg") return "mp3";
    if (dataType === "x-wav") return "wav";
    return dataType;
  }

  const pathPart = source.split(/[?#]/, 1)[0] ?? source;
  return extname(pathPart).slice(1).toLowerCase() || "wav";
}

export default defineCommand({
  description: "Recognize speech from audio files (FunAudio-ASR)",
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
    "--model fun-asr-flash-2026-06-15 --url ./meeting.wav --language zh",
    "--model qwen-audio-3.0-asr-flash --url ./meeting.wav --out result.json",
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

    if (isSynchronousFlashModel(model)) {
      if (rawUrls.length !== 1) {
        throw new BailianError(
          `${model} accepts exactly one audio file per request.`,
          ExitCode.USAGE,
        );
      }
      if (
        diarization ||
        flags.channelId !== undefined ||
        flags.async ||
        flags.pollInterval !== undefined
      ) {
        throw new BailianError(
          `${model} uses synchronous recognition and does not support --diarization, --channel-id, --async, or --poll-interval. Use fun-asr or a filetrans model for those options.`,
          ExitCode.USAGE,
        );
      }

      const resolvedUrl = await ctx.client.uploadFile(rawUrls[0]!, model);
      const body = {
        model,
        input: {
          messages: [
            {
              role: "user",
              content: [{ type: "input_audio", input_audio: { data: resolvedUrl } }],
            },
          ],
        },
        parameters: {
          format: inferAudioFormat(rawUrls[0]!),
          language_hints: flags.language ? [flags.language] : undefined,
          vocabulary_id: flags.vocabularyId,
        },
      };
      stripUndefined(body.parameters as Record<string, unknown>);
      const path = speechRecognizeFlashPath();

      if (settings.dryRun) {
        emitResult({ request: body, mode: "sync", path }, format);
        return;
      }

      if (!settings.quiet) {
        process.stderr.write(`[Model: ${model}] [Mode: sync] [Files: 1]\n`);
      }
      await handleSyncFlashMode(ctx.client, settings, path, body, flags, format);
      return;
    }

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
      emitResult({ request: body, mode: "async", path: speechRecognizePath() }, format);
      return;
    }

    if (!settings.quiet) {
      process.stderr.write(`[Model: ${model}] [Mode: async] [Files: ${resolvedUrls.length}]\n`);
    }

    await handleAsyncMode(ctx.client, settings, body, flags, format, resolvedUrls.length);
  },
});

async function handleSyncFlashMode(
  client: Client,
  settings: Settings,
  path: string,
  body: Record<string, unknown>,
  flags: RecognizeFlags,
  format: OutputFormat,
): Promise<void> {
  const response = await client.requestJson<DashScopeFlashASRResponse>({
    path,
    method: "POST",
    headers: { "X-DashScope-SSE": "disable" },
    body,
  });

  const text =
    response.output?.text ??
    response.output?.sentence?.text ??
    response.output?.output?.sentence?.text;
  if (text) {
    emitBare(text);
  } else {
    emitResult(response, format);
  }

  if (flags.out) {
    writeFileSync(flags.out, JSON.stringify(response, null, 2) + "\n");
    if (!settings.quiet) {
      process.stderr.write(`Full result saved to: ${flags.out}\n`);
    }
  }
}

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

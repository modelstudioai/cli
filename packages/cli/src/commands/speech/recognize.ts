import { writeFileSync } from "fs";
import {
  BailianError,
  defineCommand,
  ExitCode,
  detectOutputFormat,
  type Config,
  type GlobalFlags,
  type DashScopeASRRequest,
  type DashScopeASRTaskResult,
  type DashScopeAsyncResponse,
  resolveFileUrl,
  resolveCredential,
  trackingHeaders,
  stripUndefined,
  taskEndpoint,
  requestJson,
  type OutputFormat,
  speechRecognizeEndpoint,
} from "bailian-cli-core";
import { poll } from "../../utils/polling.ts";
import { failIfMissing } from "../../output/prompt.ts";
import { emitResult, emitBare } from "../../output/output.ts";

export default defineCommand({
  name: "speech recognize",
  description: "Recognize speech from audio files (FunAudio-ASR)",
  usage: "bl speech recognize --url <audio-url> [flags]",
  options: [
    {
      flag: "--url <url>",
      description: "Audio file URL or local file path (repeatable, max 100)",
      required: true,
      type: "array",
    },
    { flag: "--model <model>", description: "Model ID (default: fun-asr)" },
    { flag: "--language <lang>", description: "Language hint (e.g. zh, en, ja)" },
    { flag: "--diarization", description: "Enable automatic speaker diarization" },
    {
      flag: "--speaker-count <n>",
      description: "Expected number of speakers (requires --diarization)",
      type: "number",
    },
    { flag: "--vocabulary-id <id>", description: "Hot-word vocabulary ID for improved accuracy" },
    { flag: "--channel-id <n>", description: "Audio channel ID (default: 0)", type: "number" },
    { flag: "--out <path>", description: "Save full transcription result to JSON file" },
    { flag: "--no-wait", description: "Return task ID immediately without polling" },
    {
      flag: "--poll-interval <seconds>",
      description: "Polling interval in seconds (default: 2)",
      type: "number",
    },
  ],
  examples: [
    "bl speech recognize --url https://example.com/audio.mp3",
    "bl speech recognize --url https://example.com/a.mp3 --url https://example.com/b.mp3",
    "bl speech recognize --url https://example.com/meeting.wav --diarization --speaker-count 3",
    "bl speech recognize --url https://example.com/audio.mp3 --language zh",
    "bl speech recognize --url https://example.com/audio.mp3 --vocabulary-id vocab-abc123",
    "bl speech recognize --url https://example.com/audio.mp3 --out result.json",
    "bl speech recognize --url https://example.com/audio.mp3 --no-wait --quiet",
  ],
  async run(config: Config, flags: GlobalFlags) {
    // Normalize --url to string[] (supports both single and repeated flags)
    let rawUrls: string[] = [];
    if (Array.isArray(flags.url)) {
      rawUrls = flags.url as string[];
    } else if (typeof flags.url === "string") {
      rawUrls = [flags.url];
    }
    if (rawUrls.length === 0) {
      failIfMissing("url", "bl speech recognize --url <audio-url>");
    }

    // Strict validation: --speaker-count requires --diarization
    const speakerCount = flags.speakerCount as number | undefined;
    const diarization = flags.diarization === true;
    if (speakerCount !== undefined && !diarization) {
      throw new BailianError(
        "--speaker-count requires --diarization to be enabled.\nHint: Add --diarization flag to enable speaker separation.",
        ExitCode.USAGE,
      );
    }

    const model = (flags.model as string) || "fun-asr";
    const format = detectOutputFormat(config.output);

    // Auto-upload local files in parallel
    const credential = await resolveCredential(config);
    const resolvedUrls = await Promise.all(
      rawUrls.map((u) => resolveFileUrl(u, credential.token, model)),
    );
    const channelId = flags.channelId as number | undefined;
    const language = flags.language as string | undefined;
    const vocabularyId = flags.vocabularyId as string | undefined;

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

    if (config.dryRun) {
      emitResult({ request: body, mode: "async" }, format);
      return;
    }

    if (!config.quiet) {
      process.stderr.write(`[Model: ${model}] [Mode: async] [Files: ${resolvedUrls.length}]\n`);
    }

    const url = speechRecognizeEndpoint(config.baseUrl);
    await handleAsyncMode(config, url, body, flags, format, resolvedUrls.length);
  },
});

async function handleAsyncMode(
  config: Config,
  url: string,
  body: DashScopeASRRequest,
  flags: GlobalFlags,
  format: OutputFormat,
  fileCount: number,
): Promise<void> {
  // Submit async task (always required for fun-asr)
  const response = await requestJson<DashScopeAsyncResponse>(config, {
    url,
    method: "POST",
    body,
    async: true,
  });

  const taskId = response.output.task_id;

  // --no-wait: return task ID immediately
  if (flags.noWait || config.async) {
    emitResult({ task_id: taskId }, format);
    return;
  }

  // Poll until completion
  const pollInterval = (flags.pollInterval as number) ?? 2;
  const pollUrl = taskEndpoint(config.baseUrl, taskId);

  const result = await poll<DashScopeASRTaskResult>(config, {
    url: pollUrl,
    intervalSec: pollInterval,
    timeoutSec: config.timeout,
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
    const transRes = await fetch(subResult.transcription_url, {
      headers: trackingHeaders(),
    });
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
    const outPath = flags.out as string;
    const outData = allTransData.length === 1 ? allTransData[0] : allTransData;
    writeFileSync(outPath, JSON.stringify(outData, null, 2) + "\n");
    if (!config.quiet) {
      process.stderr.write(`Full result saved to: ${outPath}\n`);
    }
  }
}

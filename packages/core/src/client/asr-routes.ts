import { imageSyncPath, speechRecognizePath } from "./endpoints.ts";

/**
 * DashScope ASR APIs differ by model family:
 *
 * - async file transcription (`.../audio/asr/transcription`):
 *   fun-asr*, paraformer* (non-realtime), *-filetrans, sensevoice*
 *   language via `parameters.language_hints`
 * - sync multimodal (`.../aigc/multimodal-generation/generation`):
 *   - qwen3: `{ content: [{ audio }] }` + optional `asr_options.language`
 *     (qwen3-asr-flash*)
 *   - input-audio: `{ type: input_audio, input_audio.data }` +
 *     `format`/`sample_rate` + optional `language_hints`
 *     (fun-asr-flash*, qwen-audio-*-asr-flash*)
 * - realtime / streaming: WebSocket — not supported by `speech recognize`
 */

export type AsrApiKind = "async-filetrans" | "sync-flash" | "unsupported";

/** Sync-flash request body shape differs by Flash protocol family. */
export type AsrFlashFamily = "qwen3" | "input-audio";

export interface AsrApiRoute {
  kind: AsrApiKind;
  path: string;
  /** True when the call is synchronous (no X-DashScope-Async / task poll). */
  useSync: boolean;
  /**
   * Async transcription request input style.
   * - `file_urls`: classic async models (fun-asr / paraformer / qwen-audio filetrans...)
   * - `file_url`: qwen3-asr-flash-filetrans family
   */
  asyncInputStyle?: "file_urls" | "file_url";
  /**
   * Async transcription language field style.
   * - `language_hints`: fun-asr / paraformer / qwen-audio filetrans...
   * - `language`: qwen3-asr-flash-filetrans*
   */
  asyncLanguageStyle?: "language_hints" | "language";
  flashFamily?: AsrFlashFamily;
  /** Human-readable reason when kind is unsupported. */
  unsupportedReason?: string;
}

function isRealtimeOrStreaming(model: string): boolean {
  return /realtime|streaming/i.test(model);
}

function isFiletransModel(model: string): boolean {
  return /filetrans/i.test(model);
}

function isQwen3FiletransModel(model: string): boolean {
  return /^qwen3-asr-flash-filetrans(?:-|$)/i.test(model);
}

const INPUT_AUDIO_FLASH_PREFIXES = ["fun-asr-flash", "qwen-audio"] as const;

/**
 * Fun-ASR-Flash / Qwen-Audio-*-ASR-Flash share the input_audio + format protocol.
 * Examples: fun-asr-flash-2026-06-15, qwen-audio-3.0-asr-flash
 */
function isInputAudioFlashModel(model: string): boolean {
  if (isRealtimeOrStreaming(model) || isFiletransModel(model)) return false;
  if (model.startsWith(INPUT_AUDIO_FLASH_PREFIXES[0])) return true;
  if (model.startsWith(INPUT_AUDIO_FLASH_PREFIXES[1]) && /asr-flash/i.test(model)) return true;
  return false;
}

/**
 * Qwen3-ASR-Flash sync models use content.audio + asr_options.
 * Examples: qwen3-asr-flash, qwen3-asr-flash-2025-09-08, qwen3-asr-flash-us
 */
function isQwen3AsrFlashModel(model: string): boolean {
  if (!/^qwen3-asr-flash(?:-|$)/i.test(model)) return false;
  if (isFiletransModel(model) || isRealtimeOrStreaming(model)) return false;
  if (isInputAudioFlashModel(model)) return false;
  return true;
}

/**
 * Resolve which DashScope ASR API a model should use for file recognition.
 * Unknown models default to async-filetrans (preserves existing CLI behavior).
 */
export function resolveAsrApi(model: string): AsrApiRoute {
  if (isRealtimeOrStreaming(model)) {
    return {
      kind: "unsupported",
      path: "",
      useSync: false,
      unsupportedReason:
        `Model "${model}" is a realtime/streaming ASR model and requires a WebSocket API. ` +
        `Use an async filetrans model (e.g. fun-asr, qwen3-asr-flash-filetrans) or a sync flash model ` +
        `(e.g. qwen3-asr-flash, qwen-audio-3.0-asr-flash) with this command.`,
    };
  }

  if (isFiletransModel(model)) {
    const isQwen3Filetrans = isQwen3FiletransModel(model);
    return {
      kind: "async-filetrans",
      path: speechRecognizePath(),
      useSync: false,
      asyncInputStyle: isQwen3Filetrans ? "file_url" : "file_urls",
      asyncLanguageStyle: isQwen3Filetrans ? "language" : "language_hints",
    };
  }

  if (isInputAudioFlashModel(model)) {
    return {
      kind: "sync-flash",
      path: imageSyncPath(),
      useSync: true,
      flashFamily: "input-audio",
    };
  }

  if (isQwen3AsrFlashModel(model)) {
    return {
      kind: "sync-flash",
      path: imageSyncPath(),
      useSync: true,
      flashFamily: "qwen3",
    };
  }

  // fun-asr / paraformer / sensevoice / unknown → keep legacy async path
  return {
    kind: "async-filetrans",
    path: speechRecognizePath(),
    useSync: false,
    asyncInputStyle: "file_urls",
    asyncLanguageStyle: "language_hints",
  };
}

/** Infer audio container hint for input-audio Flash `parameters.format`. */
export function inferAudioFormatHint(audioUrl: string): string {
  // data URI: data:audio/mpeg;base64,... → mp3; data:audio/x-wav;... → wav
  const dataType = /^data:audio\/([^;,]+)/i.exec(audioUrl)?.[1]?.toLowerCase();
  if (dataType) {
    if (dataType === "mpeg") return "mp3";
    if (dataType === "x-wav" || dataType === "wave") return "wav";
    return dataType;
  }

  const pathPart = audioUrl.split(/[?#]/, 1)[0] ?? audioUrl;
  const match = pathPart.match(/\.([a-zA-Z0-9]+)$/);
  const extension = match?.[1]?.toLowerCase();
  if (!extension) return "wav";
  if (extension === "mpeg") return "mp3";
  return extension;
}

export interface BuildAsrFlashRequestOpts {
  model: string;
  audioUrl: string;
  language?: string;
  /** Precompiled hotword vocabulary ID; supported for input-audio Flash (fun-asr-flash* / qwen-audio-*-asr-flash). */
  vocabularyId?: string;
  flashFamily: AsrFlashFamily;
}

/**
 * Build language fields for async ASR routes.
 * qwen3-asr-flash-filetrans* → `language`; other async models → `language_hints`.
 */
export function buildAsyncAsrLanguageFields(
  languageStyle: "language_hints" | "language",
  language?: string,
): { language_hints?: string[]; language?: string } {
  if (!language) return {};
  if (languageStyle === "language") {
    return { language };
  }
  return { language_hints: [language] };
}

/** Build a sync multimodal ASR request body for Flash models. */
export function buildAsrFlashRequest(opts: BuildAsrFlashRequestOpts): Record<string, unknown> {
  const { model, audioUrl, language, vocabularyId, flashFamily } = opts;

  if (flashFamily === "input-audio") {
    // Match official Qwen-Audio / Fun-ASR-Flash docs: language_hints + vocabulary_id
    const parameters: Record<string, unknown> = {
      format: inferAudioFormatHint(audioUrl),
      sample_rate: "16000",
    };
    if (language) {
      parameters.language_hints = [language];
    }
    if (vocabularyId) {
      parameters.vocabulary_id = vocabularyId;
    }
    return {
      model,
      input: {
        messages: [
          {
            role: "user",
            content: [
              {
                type: "input_audio",
                input_audio: { data: audioUrl },
              },
            ],
          },
        ],
      },
      parameters,
    };
  }

  const asrOptions: Record<string, unknown> = {};
  if (language) {
    asrOptions.language = language;
  }

  const parameters: Record<string, unknown> = {};
  if (Object.keys(asrOptions).length > 0) {
    parameters.asr_options = asrOptions;
  }

  const body: Record<string, unknown> = {
    model,
    input: {
      messages: [
        {
          role: "user",
          content: [{ audio: audioUrl }],
        },
      ],
    },
  };
  if (Object.keys(parameters).length > 0) {
    body.parameters = parameters;
  }
  return body;
}

/**
 * Extract recognition text from a sync Flash ASR response.
 * Qwen3 uses choices[].message.content; input-audio Flash uses output.text /
 * output.sentence.text / output.output.sentence.text.
 */
export function extractAsrFlashText(
  response: Record<string, unknown>,
  flashFamily: AsrFlashFamily,
): string {
  const output = response.output as Record<string, unknown> | undefined;
  if (!output) return "";

  if (flashFamily === "input-audio") {
    if (typeof output.text === "string" && output.text.length > 0) {
      return output.text;
    }
    const topSentence = output.sentence as Record<string, unknown> | undefined;
    if (typeof topSentence?.text === "string" && topSentence.text.length > 0) {
      return topSentence.text;
    }
    const nested = output.output as Record<string, unknown> | undefined;
    const nestedSentence = nested?.sentence as Record<string, unknown> | undefined;
    if (typeof nestedSentence?.text === "string") {
      return nestedSentence.text;
    }
    return "";
  }

  const choices = output.choices as Array<Record<string, unknown>> | undefined;
  if (!choices?.length) return "";

  const texts: string[] = [];
  for (const choice of choices) {
    const message = choice.message as Record<string, unknown> | undefined;
    if (!message) continue;
    const content = message.content;
    if (typeof content === "string") {
      texts.push(content);
      continue;
    }
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      if (typeof item === "string") {
        texts.push(item);
        continue;
      }
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        if (typeof record.text === "string") {
          texts.push(record.text);
        }
      }
    }
  }
  return texts.join("");
}

/**
 * Normalize async ASR task transcription items:
 * - classic models: `output.results[]`
 * - qwen3-asr-flash-filetrans*: `output.result.transcription_url`
 */
export function collectAsrTranscriptionItems(output: {
  results?: Array<{
    file_url?: string;
    transcription_url?: string;
    subtask_status?: string;
    code?: string;
    message?: string;
  }>;
  result?: { transcription_url?: string };
}): Array<{
  file_url?: string;
  transcription_url?: string;
  subtask_status?: string;
  code?: string;
  message?: string;
}> {
  if (output.results && output.results.length > 0) {
    return output.results;
  }
  const transcriptionUrl = output.result?.transcription_url;
  if (typeof transcriptionUrl === "string" && transcriptionUrl.length > 0) {
    return [{ transcription_url: transcriptionUrl, subtask_status: "SUCCEEDED" }];
  }
  return [];
}

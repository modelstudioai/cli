import { writeFileSync } from "fs";
import { extname } from "path";
import {
  defineCommand,
  request,
  chatEndpoint,
  parseSSE,
  detectOutputFormat,
  BailianError,
  ExitCode,
  type ChatMessage,
  type ChatMessageContent,
  type ChatRequest,
  type StreamChunk,
  resolveFileUrl,
} from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import { resolveOutputDir, resolveCredential } from "bailian-cli-core";

const OMNI_VOICES = ["Chelsie", "Cherry", "Ethan", "Serena", "Sunny", "Tina"];

/**
 * Extension to input audio format.
 */
const OMNI_INPUT_AUDIO_EXT: Record<string, string> = {
  wav: "wav",
  mp3: "mp3",
  amr: "amr",
  aac: "aac",
  m4a: "aac",
  ogg: "ogg",
  "3gp": "3gp",
  "3gpp": "3gpp",
};

const audioExts = Object.keys(OMNI_INPUT_AUDIO_EXT);

/**
 * Infer the input audio format from the source URL or local file path.
 */
function inferInputAudioFormat(source: string): string {
  const pathPart = source.split("?")[0].split("#")[0];
  const ext = extname(pathPart).slice(1).toLowerCase();
  if (!ext) {
    throw new BailianError(
      `Cannot infer audio format from "${source}". ` +
        `Use a file/URL whose path ends with: ${audioExts.join(", ")}.`,
      ExitCode.USAGE,
    );
  }
  const format = OMNI_INPUT_AUDIO_EXT[ext];
  if (!format) {
    throw new BailianError(
      `Unsupported audio extension ".${ext}" for "${source}". ` +
        `Supported extensions: ${audioExts.join(", ")}.`,
      ExitCode.USAGE,
    );
  }
  return format;
}

/**
 * Build a standard WAV file header for PCM 16-bit mono 24kHz audio.
 */
function buildWavHeader(dataLength: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // format = PCM
  header.writeUInt16LE(1, 22); // channels = 1 (mono)
  header.writeUInt32LE(24000, 24); // sample rate
  header.writeUInt32LE(48000, 28); // byte rate (24000 * 1 * 2)
  header.writeUInt16LE(2, 32); // block align (channels * bitsPerSample / 8)
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(dataLength, 40);
  return header;
}

export default defineCommand({
  description: "Multimodal chat with text + audio output (Qwen-Omni)",
  auth: "apiKey",
  usageArgs: "--message <text> [flags]",
  flags: {
    message: {
      type: "array",
      valueHint: "<text>",
      description: "Message text (repeatable, prefix role: to set role)",
      required: true,
    },
    model: {
      type: "string",
      valueHint: "<model>",
      description: "Model ID (default: qwen3.5-omni-plus)",
    },
    system: { type: "string", valueHint: "<text>", description: "System prompt" },
    image: {
      type: "array",
      valueHint: "<url>",
      description: "Image URL or local file (repeatable)",
    },
    audio: {
      type: "array",
      valueHint: "<url>",
      description: "Audio URL or local file (.wav/.mp3/.amr/.aac/.m4a/.ogg/.3gp/.3gpp)",
    },
    video: {
      type: "array",
      valueHint: "<url>",
      description: "Video file URL / local path, or comma-separated frame URLs",
    },
    voice: {
      type: "string",
      valueHint: "<voice>",
      description: `Output voice (default: Cherry). Options: ${OMNI_VOICES.join(", ")}`,
    },
    audioFormat: {
      type: "string",
      valueHint: "<fmt>",
      description: "Audio output format (default: wav)",
    },
    audioOut: {
      type: "string",
      valueHint: "<path>",
      description: "Save audio to file (default: auto-generate)",
    },
    textOnly: { type: "switch", description: "Output text only, no audio generation" },
    maxTokens: { type: "number", valueHint: "<n>", description: "Maximum tokens to generate" },
    temperature: {
      type: "number",
      valueHint: "<n>",
      description: "Sampling temperature (0.0, 2.0]",
    },
  },
  exampleArgs: [
    '--message "Hello, who are you?"',
    '--message "Describe this image" --image ./photo.jpg',
    '--message "What is this audio saying?" --audio https://example.com/audio.wav',
    '--message "Summarize this video" --video https://example.com/video.mp4',
    '--message "What is this video about?" --video ./local-video.mp4 --text-only',
    '--message "Answer in Sichuan dialect: How\'s the weather today?" --voice Sunny',
    '--message "Hello" --text-only --output json',
    '--message "Read this passage aloud" --audio-out greeting.wav',
  ],
  async run(config, flags) {
    // --- Parse messages ---
    const userMessages = flags.message;

    const model = flags.model || config.defaultOmniModel || "qwen3.5-omni-plus";
    const voice = flags.voice || "Cherry";
    const audioFormat = flags.audioFormat || "wav";
    const textOnly = flags.textOnly === true;
    const format = detectOutputFormat(config.output);

    // --- Build messages array ---
    const allMessages: ChatMessage[] = [];
    if (flags.system) {
      allMessages.push({ role: "system", content: flags.system });
    }

    // Build multimodal content for user messages
    const validRoles = new Set(["system", "user", "assistant"]);
    for (const m of userMessages) {
      const colonIdx = m.indexOf(":");
      const maybeRole = colonIdx !== -1 ? m.slice(0, colonIdx) : "";

      if (validRoles.has(maybeRole)) {
        const content = m.slice(colonIdx + 1);
        if (maybeRole === "system") {
          allMessages.push({ role: "system", content });
        } else {
          allMessages.push({ role: maybeRole as "user" | "assistant", content });
        }
      } else {
        allMessages.push({ role: "user", content: m });
      }
    }

    // Attach multimodal inputs to the last user message
    const rawImageUrls = flags.image || [];
    const rawAudioUrls = flags.audio || [];
    const rawVideoUrls = flags.video || [];

    // Auto-upload local files
    const imageUrls: string[] = [];
    const audioInputs: Array<{ source: string; data: string }> = [];
    const videoUrls: string[] = [];

    const needsResolve =
      rawImageUrls.length > 0 || rawAudioUrls.length > 0 || rawVideoUrls.length > 0;
    if (needsResolve) {
      const credential = await resolveCredential(config);
      for (const u of rawImageUrls) {
        const resolved = await resolveFileUrl(u, credential.token, model);
        imageUrls.push(resolved);
      }
      for (const u of rawAudioUrls) {
        const resolved = await resolveFileUrl(u, credential.token, model);
        audioInputs.push({ source: u, data: resolved });
      }
      for (const u of rawVideoUrls) {
        // Detect: comma-separated = frame list, otherwise single video URL/file
        if (u.includes(",")) {
          // Legacy frame list mode
          const frames = u
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          // Resolve each frame URL
          for (const f of frames) {
            const resolved = await resolveFileUrl(f, credential.token, model);
            videoUrls.push(`frame:${resolved}`);
          }
        } else {
          const resolved = await resolveFileUrl(u, credential.token, model);
          videoUrls.push(resolved);
        }
      }
    }

    if (imageUrls.length > 0 || audioInputs.length > 0 || videoUrls.length > 0) {
      // Find last user message and convert to multimodal content array
      for (let i = allMessages.length - 1; i >= 0; i--) {
        if (allMessages[i].role === "user") {
          const existingContent = allMessages[i].content;
          const contentArray: ChatMessageContent[] = [];

          // Keep existing text
          if (typeof existingContent === "string") {
            contentArray.push({ type: "text", text: existingContent });
          } else if (Array.isArray(existingContent)) {
            contentArray.push(...existingContent);
          }

          // Add image URLs
          for (const url of imageUrls) {
            contentArray.push({ type: "image_url", image_url: { url } });
          }

          for (const { source, data } of audioInputs) {
            contentArray.push({
              type: "input_audio",
              input_audio: { data, format: inferInputAudioFormat(source) },
            });
          }

          // Add video URLs: frame:xxx are frame list items, others are direct video URLs
          const frameItems = videoUrls.filter((v) => v.startsWith("frame:")).map((v) => v.slice(6));
          const directVideoUrls = videoUrls.filter((v) => !v.startsWith("frame:"));

          if (frameItems.length > 0) {
            contentArray.push({ type: "video", video: frameItems });
          }
          for (const url of directVideoUrls) {
            contentArray.push({ type: "video_url", video_url: { url } });
          }

          allMessages[i] = { role: "user", content: contentArray };
          break;
        }
      }
    }

    // --- Build request body ---
    const body: ChatRequest = {
      model,
      messages: allMessages,
      stream: true,
      stream_options: { include_usage: true },
    };

    if (!textOnly) {
      body.modalities = ["text", "audio"];
      body.audio = { voice, format: audioFormat };
    }

    if (flags.maxTokens !== undefined) body.max_tokens = flags.maxTokens;
    if (flags.temperature !== undefined) body.temperature = flags.temperature;

    if (config.dryRun) {
      emitResult({ request: body }, format);
      return;
    }

    if (!config.quiet) {
      const modeLabel = textOnly ? "text-only" : `text+audio, voice: ${voice}`;
      process.stderr.write(`[Model: ${model}] [${modeLabel}]\n`);
    }

    // --- Stream request ---
    const url = chatEndpoint(config.baseUrl);
    const res = await request(config, {
      url,
      method: "POST",
      body,
      stream: true,
    });

    let textContent = "";
    let audioBase64 = "";
    const isTTY = process.stdout.isTTY;
    const resultOut = process.stdout;

    for await (const event of parseSSE(res)) {
      if (event.data === "[DONE]") break;
      try {
        const parsed = JSON.parse(event.data) as StreamChunk;

        for (const choice of parsed.choices) {
          const delta = choice.delta;

          // Collect text content
          if (delta.content) {
            textContent += delta.content;
            if (isTTY) {
              resultOut.write(delta.content);
            }
          }

          // Collect audio data
          if (delta.audio?.data) {
            audioBase64 += delta.audio.data;
          }
        }
      } catch {
        // Skip unparseable chunks
      }
    }

    if (isTTY && textContent) {
      resultOut.write("\n");
    }

    // --- Save audio ---
    let audioSaved: string | undefined;
    if (audioBase64 && !textOnly) {
      const pcmBuffer = Buffer.from(audioBase64, "base64");
      const wavHeader = buildWavHeader(pcmBuffer.length);
      const wavBuffer = Buffer.concat([wavHeader, pcmBuffer]);

      let destPath = flags.audioOut;
      if (!destPath) {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const { join } = await import("path");
        const destDir = resolveOutputDir(config, { subDir: "omni" });
        const timestamp = Date.now();
        destPath = join(destDir, `omni_${timestamp}.wav`);
      }

      writeFileSync(destPath, wavBuffer);
      audioSaved = destPath;

      if (!config.quiet) {
        process.stderr.write(`Audio saved: ${destPath}\n`);
      }
    }

    // --- Emit structured result ---
    if (!isTTY || format === "json") {
      const result: Record<string, unknown> = { content: textContent };
      if (audioSaved) {
        result.audio_saved = audioSaved;
        result.voice = voice;
      }
      emitResult(result, format);
    }
  },
});

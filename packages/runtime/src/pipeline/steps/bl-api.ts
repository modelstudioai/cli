/**
 * Direct in-process API call implementations for pipeline steps.
 * Bypasses the CLI command handler layer and calls requestJson/request directly.
 */
import {
  chatPath,
  resolveImageEditApi,
  resolveImageGenerateApi,
  videoGeneratePath,
  taskPath,
  speechSynthesizePath,
  speechRecognizePath,
  stripUndefined,
  resolveBooleanFlag,
  resolveWatermark,
  type ChatRequest,
  type ChatResponse,
  type DashScopeImageRequest,
  type DashScopeImageSyncResponse,
  type DashScopeAsyncResponse,
  type DashScopeTaskResponse,
  type DashScopeVideoRequest,
  type DashScopeTTSRequest,
  type DashScopeTTSResponse,
  type DashScopeASRRequest,
  type ChatMessageContent,
  isLocalFile,
} from "bailian-cli-core";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { PipelineError } from "../errors.ts";
import type { PipelineEnv } from "../bl-config.ts";
import type { StepContext } from "../types.ts";
import { resolveImageSize } from "../../utils/image-size.ts";
import { downloadFile } from "../../utils/download.ts";

// --- text/chat ---

export interface TextChatInput {
  message?: string;
  model?: string;
  system?: string;
  "max-tokens"?: number;
  temperature?: number;
  "top-p"?: number;
  "enable-thinking"?: boolean;
  "thinking-budget"?: number;
}

export async function textChat(
  env: PipelineEnv,
  input: TextChatInput,
  ctx: StepContext,
): Promise<ChatResponse> {
  if (!input.message) {
    throw new PipelineError("missing_input", "text/chat requires 'message' input", {
      step: "text/chat",
    });
  }

  const model = input.model || "qwen3.8-max";
  const messages: Array<{ role: string; content: string }> = [];
  if (input.system) messages.push({ role: "system", content: input.system });
  messages.push({ role: "user", content: input.message });

  const body: ChatRequest = {
    model,
    messages: messages as ChatRequest["messages"],
    max_tokens: input["max-tokens"] ?? 4096,
    stream: false,
  };
  if (input.temperature !== undefined) body.temperature = input.temperature;
  if (input["top-p"] !== undefined) body.top_p = input["top-p"];
  if (input["enable-thinking"]) {
    body.enable_thinking = true;
    if (input["thinking-budget"] !== undefined) {
      body.thinking_budget = input["thinking-budget"];
    }
  }

  const url = chatPath();
  const response = await env.client.requestJson<ChatResponse>({
    path: url,
    method: "POST",
    body,
    timeout: ctx.blRequestTimeoutSeconds,
    signal: ctx.signal,
  });
  return response;
}

// --- vision/describe ---

export interface VisionDescribeInput {
  image?: string | string[];
  video?: string;
  prompt?: string;
  model?: string;
}

export async function visionDescribe(
  env: PipelineEnv,
  input: VisionDescribeInput,
  ctx: StepContext,
): Promise<ChatResponse> {
  const model = input.model || "qwen3-vl-plus";
  const images = Array.isArray(input.image) ? input.image : input.image ? [input.image] : [];
  const hasVideo = !!input.video;
  const defaultPrompt = hasVideo ? "Describe the video." : "Describe the image.";
  const prompt = input.prompt || defaultPrompt;

  const contentArray: ChatMessageContent[] = [];

  // Handle video
  if (input.video) {
    let videoUrl = input.video;
    if (isLocalFile(videoUrl)) {
      videoUrl = await env.client.uploadFile(videoUrl, model, { signal: ctx.signal });
    }
    contentArray.push({ type: "video_url", video_url: { url: videoUrl } });
  }

  // Handle images
  for (const img of images) {
    let imageUrl = img;
    if (isLocalFile(img)) {
      imageUrl = await env.client.uploadFile(img, model, { signal: ctx.signal });
    }
    contentArray.push({ type: "image_url", image_url: { url: imageUrl } });
  }

  contentArray.push({ type: "text", text: prompt });

  const body: ChatRequest = {
    model,
    messages: [{ role: "user", content: contentArray }],
  };

  const url = chatPath();
  return await env.client.requestJson<ChatResponse>({
    path: url,
    method: "POST",
    body,
    signal: ctx.signal,
  });
}

// --- image/generate ---

export interface ImageGenerateInput {
  prompt?: string;
  model?: string;
  size?: string;
  n?: number;
  seed?: number;
  "negative-prompt"?: string;
  "prompt-extend"?: boolean | string;
  watermark?: boolean | string;
  "out-dir"?: string;
  "out-prefix"?: string;
}

export async function imageGenerate(
  env: PipelineEnv,
  input: ImageGenerateInput,
  ctx: StepContext,
): Promise<unknown> {
  if (!input.prompt) {
    throw new PipelineError("missing_input", "image/generate requires 'prompt' input", {
      step: "image/generate",
    });
  }

  const model = input.model || "qwen-image-3.0";
  const route = resolveImageGenerateApi(model);
  const n = input.n ?? 1;

  const promptExtend = resolveBooleanFlag(
    input["prompt-extend"],
    route.promptExtendDefault,
    "prompt-extend",
  );

  const parameters: NonNullable<DashScopeImageRequest["parameters"]> = {
    size: resolveImageSize(input.size, route.sizeProfile),
    n,
    seed: input.seed,
    prompt_extend: promptExtend,
    watermark: resolveWatermark(input.watermark),
  };

  const body: DashScopeImageRequest =
    route.inputStyle === "prompt"
      ? {
          model,
          input: {
            prompt: input.prompt,
            negative_prompt: input["negative-prompt"] || undefined,
          },
          parameters,
        }
      : {
          model,
          input: {
            messages: [{ role: "user", content: [{ text: input.prompt }] }],
          },
          parameters: {
            ...parameters,
            negative_prompt: input["negative-prompt"] || undefined,
          },
        };

  if (route.useSync) {
    const response = await env.client.requestJson<DashScopeImageSyncResponse>({
      path: route.path,
      method: "POST",
      body,
      signal: ctx.signal,
    });
    const urls = response.output.choices
      .flatMap((choice) => choice.message?.content || [])
      .map((item) => item.image)
      .filter(Boolean);
    const saved = await maybeDownloadImages(urls, input["out-dir"], input["out-prefix"]);
    return { urls, request_id: response.request_id, ...(saved ? { saved } : {}) };
  }

  const asyncResp = await env.client.requestJson<DashScopeAsyncResponse>({
    path: route.path,
    method: "POST",
    body,
    async: true,
    signal: ctx.signal,
  });
  const taskId = asyncResp.output.task_id;
  const result = await pollTask(env, taskId, ctx);
  const urls = Array.isArray(result.urls) ? (result.urls as string[]) : [];
  const saved = await maybeDownloadImages(urls, input["out-dir"], input["out-prefix"]);
  if (saved) result.saved = saved;
  return result;
}

// --- image/edit ---

export interface ImageEditInput {
  image?: string | string[];
  prompt?: string;
  model?: string;
  size?: string;
  n?: number;
  seed?: number;
  "negative-prompt"?: string;
  "prompt-extend"?: boolean | string;
  watermark?: boolean | string;
  function?: string;
  "out-dir"?: string;
  "out-prefix"?: string;
}

export async function imageEdit(
  env: PipelineEnv,
  input: ImageEditInput,
  ctx: StepContext,
): Promise<unknown> {
  if (!input.prompt) {
    throw new PipelineError("missing_input", "image/edit requires 'prompt' input", {
      step: "image/edit",
    });
  }

  const images = Array.isArray(input.image) ? input.image : input.image ? [input.image] : [];
  const model = input.model || "qwen-image-3.0";
  const route = resolveImageEditApi(model);
  const n = input.n ?? 1;

  const promptExtend = resolveBooleanFlag(
    input["prompt-extend"],
    route.promptExtendDefault,
    "prompt-extend",
  );

  const resolvedImages: string[] = [];
  for (const image of images) {
    let imageUrl = image;
    if (isLocalFile(image)) {
      imageUrl = await env.client.uploadFile(image, model, { signal: ctx.signal });
    }
    resolvedImages.push(imageUrl);
  }

  const parameters: NonNullable<DashScopeImageRequest["parameters"]> = {
    size: resolveImageSize(input.size, route.sizeProfile),
    n,
    seed: input.seed,
    prompt_extend: promptExtend,
    watermark: resolveWatermark(input.watermark),
  };

  let body: DashScopeImageRequest;
  if (route.inputStyle === "function-base-image") {
    const baseImageUrl = resolvedImages[0];
    if (!baseImageUrl) {
      throw new PipelineError(
        "missing_input",
        "image/edit with wanx*-imageedit requires at least one image",
        { step: "image/edit" },
      );
    }
    body = {
      model,
      input: {
        function: input.function || "description_edit",
        prompt: input.prompt,
        base_image_url: baseImageUrl,
      },
      parameters,
    };
  } else if (route.inputStyle === "prompt-images") {
    body = {
      model,
      input: {
        prompt: input.prompt,
        images: resolvedImages,
        negative_prompt: input["negative-prompt"] || undefined,
      },
      parameters,
    };
  } else {
    const content: Array<{ text?: string; image?: string }> = resolvedImages.map((imageUrl) => ({
      image: imageUrl,
    }));
    content.push({ text: input.prompt });
    body = {
      model,
      input: {
        messages: [{ role: "user", content }],
      },
      parameters: {
        ...parameters,
        negative_prompt: input["negative-prompt"] || undefined,
      },
    };
  }

  if (route.useSync) {
    const response = await env.client.requestJson<DashScopeImageSyncResponse>({
      path: route.path,
      method: "POST",
      body,
      signal: ctx.signal,
    });
    const urls = response.output.choices
      .flatMap((choice) => choice.message?.content || [])
      .map((item) => item.image)
      .filter(Boolean);
    const saved = await maybeDownloadImages(urls, input["out-dir"], input["out-prefix"]);
    return { urls, request_id: response.request_id, ...(saved ? { saved } : {}) };
  }

  const asyncResp = await env.client.requestJson<DashScopeAsyncResponse>({
    path: route.path,
    method: "POST",
    body,
    async: true,
    signal: ctx.signal,
  });
  const taskId = asyncResp.output.task_id;
  const result = await pollTask(env, taskId, ctx);
  const urls = Array.isArray(result.urls) ? (result.urls as string[]) : [];
  const saved = await maybeDownloadImages(urls, input["out-dir"], input["out-prefix"]);
  if (saved) result.saved = saved;
  return result;
}

/**
 * If `outDir` is provided, download each URL to disk under `outDir/`.
 * Naming: single image -> `<prefix>.png`; multiple -> `<prefix>_001.png`, ...
 * Default prefix is `image`.
 */
async function maybeDownloadImages(
  urls: string[],
  outDir: string | undefined,
  outPrefix: string | undefined,
): Promise<string[] | undefined> {
  if (!outDir || urls.length === 0) return undefined;
  await mkdir(outDir, { recursive: true });
  const prefix = outPrefix && outPrefix.length > 0 ? outPrefix : "image";
  const items =
    urls.length === 1
      ? [{ url: urls[0], destPath: join(outDir, `${prefix}.png`) }]
      : urls.map((url, i) => ({
          url,
          destPath: join(outDir, `${prefix}_${String(i + 1).padStart(3, "0")}.png`),
        }));
  const saved: string[] = [];
  for (const { url, destPath } of items) {
    await downloadFile(url, destPath, { quiet: true });
    saved.push(destPath);
  }
  return saved;
}

// --- video/generate (async) ---

export interface VideoGenerateInput {
  prompt?: string;
  model?: string;
  image?: string;
  "negative-prompt"?: string;
  resolution?: string;
  ratio?: string;
  duration?: number;
  "prompt-extend"?: boolean | string;
  watermark?: boolean | string;
  seed?: number;
  "poll-interval"?: number;
}

export async function videoGenerate(
  env: PipelineEnv,
  input: VideoGenerateInput,
  ctx: StepContext,
): Promise<unknown> {
  if (!input.prompt) {
    throw new PipelineError("missing_input", "video/generate requires 'prompt' input", {
      step: "video/generate",
    });
  }

  const model = input.model || (input.image ? "happyhorse-1.1-i2v" : "happyhorse-1.1-t2v");

  let resolvedImageUrl: string | undefined;
  if (input.image) {
    if (isLocalFile(input.image)) {
      resolvedImageUrl = await env.client.uploadFile(input.image, model, {
        signal: ctx.signal,
      });
    } else {
      resolvedImageUrl = input.image;
    }
  }

  const body: DashScopeVideoRequest = {
    model,
    input: {
      prompt: input.prompt,
      negative_prompt: input["negative-prompt"] || undefined,
      ...(resolvedImageUrl
        ? { media: [{ type: "first_frame" as const, url: resolvedImageUrl }] }
        : {}),
    },
    parameters: {
      resolution: input.resolution || undefined,
      ratio: input.ratio || undefined,
      duration: input.duration,
      prompt_extend: resolveBooleanFlag(input["prompt-extend"], undefined, "prompt-extend"),
      watermark: resolveWatermark(input.watermark),
      seed: input.seed,
    },
  };
  stripUndefined(body.parameters as Record<string, unknown>);

  const url = videoGeneratePath();
  const asyncResp = await env.client.requestJson<DashScopeAsyncResponse>({
    path: url,
    method: "POST",
    body,
    async: true,
    signal: ctx.signal,
  });
  const taskId = asyncResp.output.task_id;

  const pollIntervalMs = (input["poll-interval"] ?? 10) * 1000;
  const timeoutMs = (ctx.timeoutSeconds ?? 900) * 1000;

  return await pollTaskWithOptions(env, taskId, pollIntervalMs, timeoutMs, ctx);
}

// --- speech/synthesize ---

export interface SpeechSynthesizeInput {
  text?: string;
  "text-file"?: string;
  model?: string;
  voice?: string;
  format?: string;
  "sample-rate"?: number;
  volume?: number;
  rate?: number;
  pitch?: number;
  seed?: number;
  language?: string;
  instruction?: string;
  "enable-ssml"?: boolean;
  out?: string;
}

export async function speechSynthesize(
  env: PipelineEnv,
  input: SpeechSynthesizeInput,
  ctx: StepContext,
): Promise<unknown> {
  let text = input.text;
  if (!text && input["text-file"]) {
    const { readFileSync } = await import("node:fs");
    text = readFileSync(input["text-file"], "utf-8").trim();
  }
  if (!text) {
    throw new PipelineError("missing_input", "speech/synthesize requires 'text' input", {
      step: "speech/synthesize",
    });
  }

  const model = input.model || "cosyvoice-v3-flash";

  const body: DashScopeTTSRequest = {
    model,
    input: {
      text,
      voice: input.voice,
      format: input.format as DashScopeTTSRequest["input"]["format"],
      sample_rate: input["sample-rate"],
      volume: input.volume,
      rate: input.rate,
      pitch: input.pitch,
      seed: input.seed,
      language_hints: input.language ? [input.language] : undefined,
      instruction: input.instruction,
      enable_ssml: input["enable-ssml"],
    },
  };
  stripUndefined(body.input as Record<string, unknown>);

  const url = speechSynthesizePath();
  const response = await env.client.requestJson<DashScopeTTSResponse>({
    path: url,
    method: "POST",
    body,
    signal: ctx.signal,
  });

  return {
    audio_url: response.output.audio.url,
    url_expires_at: response.output.audio.expires_at,
    model,
    voice: input.voice,
    request_id: response.request_id,
  };
}

// --- speech/recognize ---

export interface SpeechRecognizeInput {
  url?: string | string[];
  model?: string;
  language?: string;
  diarization?: boolean;
  "speaker-count"?: number;
  "vocabulary-id"?: string;
  "channel-id"?: number;
  "poll-interval"?: number;
}

export async function speechRecognize(
  env: PipelineEnv,
  input: SpeechRecognizeInput,
  ctx: StepContext,
): Promise<unknown> {
  const rawUrls = Array.isArray(input.url) ? input.url : input.url ? [input.url] : [];
  if (rawUrls.length === 0) {
    throw new PipelineError("missing_input", "speech/recognize requires 'url' input", {
      step: "speech/recognize",
    });
  }

  // Resolve local files to upload URLs
  const fileUrls: string[] = [];
  for (const u of rawUrls) {
    if (isLocalFile(u)) {
      fileUrls.push(
        await env.client.uploadFile(u, input.model || "fun-asr", {
          signal: ctx.signal,
        }),
      );
    } else {
      fileUrls.push(u);
    }
  }

  const model = input.model || "fun-asr";
  const body: DashScopeASRRequest = {
    model,
    input: { file_urls: fileUrls },
    parameters: {
      channel_id: input["channel-id"] !== undefined ? [input["channel-id"]] : undefined,
      language_hints: input.language ? [input.language] : undefined,
      diarization_enabled: input.diarization,
      speaker_count: input["speaker-count"],
      vocabulary_id: input["vocabulary-id"],
    },
  };
  stripUndefined(body.parameters as Record<string, unknown>);

  const url = speechRecognizePath();
  const asyncResp = await env.client.requestJson<DashScopeAsyncResponse>({
    path: url,
    method: "POST",
    body,
    async: true,
    signal: ctx.signal,
  });
  const taskId = asyncResp.output.task_id;

  const pollIntervalMs = (input["poll-interval"] ?? 2) * 1000;
  const timeoutMs = (ctx.timeoutSeconds ?? 300) * 1000;

  return await pollTaskWithOptions(env, taskId, pollIntervalMs, timeoutMs, ctx);
}

// --- Shared: task polling ---

/**
 * Flatten DashScopeTaskResponse into a top-level object for artifact extraction.
 * The CLI `--output json` used to emit output fields at the top level;
 * we replicate that shape so artifactsFromBlData works correctly.
 */
function flattenTaskResponse(resp: DashScopeTaskResponse): Record<string, unknown> {
  const { output, request_id, usage } = resp;
  const flat: Record<string, unknown> = {
    task_id: output.task_id,
    task_status: output.task_status,
    request_id,
  };
  if (output.video_url) flat.video_url = output.video_url;
  if (output.choices) {
    const urls = output.choices
      .flatMap((c) => c.message?.content || [])
      .map((item) => item.image)
      .filter(Boolean);
    if (urls.length > 0) flat.urls = urls;
  }
  if (output.results) {
    const urls = output.results.map((r) => r.url).filter(Boolean);
    if (urls.length > 0 && !flat.urls) flat.urls = urls;
  }
  if (output.task_metrics) flat.task_metrics = output.task_metrics;
  if (usage) flat.usage = usage;
  return flat;
}

async function pollTask(
  env: PipelineEnv,
  taskId: string,
  ctx?: StepContext,
): Promise<Record<string, unknown>> {
  const pollIntervalMs = 3000;
  const timeoutMs = env.settings.timeout * 1000;
  return await pollTaskWithOptions(env, taskId, pollIntervalMs, timeoutMs, ctx);
}

async function pollTaskWithOptions(
  env: PipelineEnv,
  taskId: string,
  pollIntervalMs: number,
  timeoutMs: number,
  ctx?: StepContext,
): Promise<Record<string, unknown>> {
  const started = Date.now();
  let attempt = 0;

  while (true) {
    if (ctx?.signal?.aborted) {
      throw new PipelineError("aborted", "Task polling was aborted", {
        details: { taskId },
      });
    }

    await delay(pollIntervalMs, ctx?.signal);
    attempt++;

    const url = taskPath(taskId);
    const result = await env.client.requestJson<DashScopeTaskResponse>({
      path: url,
      method: "GET",
      signal: ctx?.signal,
    });
    const status = result.output.task_status;

    if (status === "SUCCEEDED") {
      return flattenTaskResponse(result);
    }

    if (status === "FAILED") {
      const msg = result.output.message || result.output.code || "Task failed";
      throw new PipelineError("async_task_failed", msg, {
        details: { taskId, data: result },
      });
    }

    const elapsedMs = Date.now() - started;
    await ctx?.emitEvent?.({
      type: "step.polling",
      timestamp: new Date().toISOString(),
      status: "running",
      taskId,
      taskStatus: status,
      elapsedMs,
      pollAttempt: attempt,
    });

    if (elapsedMs > timeoutMs) {
      throw new PipelineError(
        "async_poll_timeout",
        `Task ${taskId} timed out after ${Math.round(timeoutMs / 1000)}s`,
        { details: { taskId, timeoutMs, pollAttempts: attempt } },
      );
    }
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return new Promise((resolve) => setTimeout(resolve, ms));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const abort = () => {
      cleanup();
      reject(new PipelineError("aborted", "Poll delay was aborted"));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
    };
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

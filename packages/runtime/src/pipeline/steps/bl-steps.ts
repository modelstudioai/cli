import { registerStep } from "../dispatcher.ts";
import { buildPipelineEnv, type PipelineEnv } from "../bl-config.ts";
import { isRecord } from "../utils.ts";
import {
  textChat,
  visionDescribe,
  imageGenerate,
  imageEdit,
  videoGenerate,
  speechSynthesize,
  speechRecognize,
} from "./bl-api.ts";
import type { StepDispatcher } from "../dispatcher.ts";
import type { StepArtifact, StepContext, StepOutputSchema, StepResult } from "../types.ts";

// --- Direct API call dispatch ---

type DirectApiHandler = (
  env: PipelineEnv,
  input: Record<string, unknown>,
  ctx: StepContext,
) => Promise<unknown>;

const DIRECT_API_HANDLERS: Record<string, DirectApiHandler> = {
  "text/chat": (env, input, ctx) => textChat(env, input, ctx),
  "vision/describe": (env, input, ctx) => visionDescribe(env, input, ctx),
  "image/generate": (env, input, ctx) => imageGenerate(env, input, ctx),
  "image/edit": (env, input, ctx) => imageEdit(env, input, ctx),
  "video/generate": (env, input, ctx) => videoGenerate(env, input, ctx),
  "speech/synthesize": (env, input, ctx) => speechSynthesize(env, input, ctx),
  "speech/recognize": (env, input, ctx) => speechRecognize(env, input, ctx),
};

// Build result with artifact extraction from the raw API data
const RESULT_BUILDERS: Record<string, (data: unknown) => StepResult> = {
  "image/generate": (data) => ({
    data,
    artifacts: artifactsFromBlData(data),
    warnings: [],
    metadata: {},
  }),
  "image/edit": (data) => ({
    data,
    artifacts: artifactsFromBlData(data),
    warnings: [],
    metadata: {},
  }),
  "video/generate": (data) => ({
    data,
    artifacts: artifactsFromBlData(data),
    warnings: [],
    metadata: {},
  }),
  "speech/synthesize": (data) => ({
    data,
    artifacts: speechArtifactsFromBlData(data, "audio"),
    warnings: [],
    metadata: {},
  }),
  "speech/recognize": (data) => ({
    data,
    artifacts: speechArtifactsFromBlData(data, "transcript"),
    warnings: [],
    metadata: {},
  }),
};

// --- Output schemas ---

const OUTPUT_SCHEMAS: Record<string, StepOutputSchema> = {
  "text/chat": {
    description: "LLM text completion via chat API",
    paths: [
      { path: "/data/choices/0/message/content", description: "Generated text content" },
      { path: "/data/choices/0/message/role", description: "Message role (assistant)" },
      { path: "/data/usage/total_tokens", description: "Total token usage" },
    ],
  },
  "vision/describe": {
    description: "Multimodal vision understanding (image/video to text)",
    paths: [
      { path: "/data/choices/0/message/content", description: "Generated description text" },
      { path: "/data/choices/0/message/role", description: "Message role (assistant)" },
      { path: "/data/usage/total_tokens", description: "Total token usage" },
    ],
  },
  "image/generate": {
    description: "Text-to-image generation",
    paths: [
      { path: "/data/urls", description: "Array of generated image URLs" },
      { path: "/data/urls/0", description: "First generated image URL" },
      { path: "/data/task_id", description: "Async task ID (if applicable)" },
      { path: "/artifacts/0/url", description: "First artifact URL" },
      { path: "/artifacts/0/path", description: "First artifact local path (if saved)" },
    ],
  },
  "image/edit": {
    description: "Image editing with reference image(s)",
    paths: [
      { path: "/data/urls", description: "Array of generated image URLs" },
      { path: "/data/urls/0", description: "First generated image URL" },
      { path: "/data/task_id", description: "Async task ID (if applicable)" },
      { path: "/artifacts/0/url", description: "First artifact URL" },
      { path: "/artifacts/0/path", description: "First artifact local path (if saved)" },
    ],
  },
  "video/generate": {
    description: "Video generation (text-to-video or image-to-video)",
    paths: [
      { path: "/data/video_url", description: "Generated video URL" },
      { path: "/data/task_id", description: "Async task ID" },
      { path: "/artifacts/0/url", description: "First artifact URL" },
      { path: "/artifacts/0/path", description: "First artifact local path (if saved)" },
    ],
  },
  "speech/synthesize": {
    description: "Text-to-speech synthesis",
    paths: [
      { path: "/data/audio_url", description: "Generated audio URL" },
      { path: "/data/url_expires_at", description: "Audio URL expiration time" },
      { path: "/artifacts/0/url", description: "First artifact URL" },
    ],
  },
  "speech/recognize": {
    description: "Speech recognition (ASR)",
    paths: [
      { path: "/data/text", description: "Full transcribed text" },
      { path: "/data/task_id", description: "Async task ID" },
      { path: "/artifacts/0/taskId", description: "Task ID from artifact" },
    ],
  },
};

// --- Registration ---

export function registerBlSteps(dispatcher?: StepDispatcher): void {
  for (const id of Object.keys(DIRECT_API_HANDLERS)) {
    registerStep(
      id,
      async (input, ctx) => {
        return await executeDirectBlStep(id, input, ctx);
      },
      dispatcher,
      OUTPUT_SCHEMAS[id],
    );
  }
}

// --- Execution ---

async function executeDirectBlStep(
  id: string,
  input: Record<string, unknown>,
  ctx: StepContext,
): Promise<StepResult> {
  if (ctx.dryRun) {
    return {
      metadata: { dryRun: true, step: id, plannedInput: input },
      warnings: [
        { code: "dry_run_skipped", message: `Step ${id} was not executed in dry-run mode` },
      ],
    };
  }

  const handler = DIRECT_API_HANDLERS[id];
  if (!handler) {
    throw new Error(`No direct API handler registered for step: ${id}`);
  }

  const env = (ctx.blEnv as PipelineEnv | undefined) ?? buildPipelineEnv();
  const data = await handler(env, input, ctx);
  const builder = RESULT_BUILDERS[id];
  if (builder) {
    return builder(data);
  }
  return { data, warnings: [], metadata: {} };
}

// --- Artifact extraction helpers ---

function artifactsFromBlData(data: unknown): StepArtifact[] | undefined {
  if (!isRecord(data)) return undefined;
  const artifacts: StepArtifact[] = [];
  const taskId = stringValue(data.task_id) ?? stringValue(data.taskId);

  for (const url of stringArray(data.urls)) {
    artifacts.push({ url, taskId, kind: mediaKindFromUrl(url) });
  }
  for (const path of stringArray(data.saved)) {
    artifacts.push({ path, taskId, kind: mediaKindFromPath(path) });
  }
  const videoUrl = stringValue(data.video_url) ?? stringValue(data.videoUrl);
  if (videoUrl) {
    artifacts.push({ url: videoUrl, taskId, kind: "video" });
  }
  const savedPath = stringValue(data.saved);
  if (savedPath) {
    artifacts.push({ path: savedPath, taskId, kind: mediaKindFromPath(savedPath) });
  }

  if (Array.isArray(data.videos)) {
    for (const item of data.videos) {
      if (!isRecord(item)) continue;
      const itemTaskId = stringValue(item.task_id) ?? stringValue(item.taskId);
      const itemUrl = stringValue(item.video_url) ?? stringValue(item.videoUrl);
      const itemPath = stringValue(item.saved);
      if (itemUrl) artifacts.push({ url: itemUrl, taskId: itemTaskId, kind: "video" });
      if (itemPath) artifacts.push({ path: itemPath, taskId: itemTaskId, kind: "video" });
    }
  }

  const taskIds = Array.isArray(data.task_ids)
    ? data.task_ids.map(stringValue).filter(isString)
    : [];
  for (const id of taskIds) {
    artifacts.push({ taskId: id, kind: "task" });
  }

  if (artifacts.length === 0 && taskId) {
    artifacts.push({ taskId, kind: "task" });
  }

  return artifacts.length > 0 ? artifacts : undefined;
}

function speechArtifactsFromBlData(
  data: unknown,
  defaultKind: "audio" | "transcript",
): StepArtifact[] | undefined {
  if (!isRecord(data)) return undefined;
  const artifacts: StepArtifact[] = [];
  const taskId = stringValue(data.task_id) ?? stringValue(data.taskId);

  const urls = [
    stringValue(data.url),
    stringValue(data.audio_url),
    stringValue(data.audioUrl),
    stringValue(data.output_url),
    stringValue(data.outputUrl),
  ].filter(isString);
  for (const url of urls) {
    artifacts.push({ url, taskId, kind: defaultKind });
  }

  const paths = [
    stringValue(data.saved),
    stringValue(data.path),
    stringValue(data.output_path),
    stringValue(data.outputPath),
  ].filter(isString);
  for (const path of paths) {
    artifacts.push({ path, taskId, kind: defaultKind });
  }

  if (artifacts.length === 0 && taskId) {
    artifacts.push({ taskId, kind: "task" });
  }

  return artifacts.length > 0 ? uniqueArtifacts(artifacts) : undefined;
}

function uniqueArtifacts(artifacts: StepArtifact[]): StepArtifact[] {
  const seen = new Set<string>();
  const unique: StepArtifact[] = [];
  for (const artifact of artifacts) {
    const key = `${artifact.kind ?? ""}:${artifact.taskId ?? ""}:${artifact.url ?? ""}:${artifact.path ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(artifact);
  }
  return unique;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(stringValue).filter(isString) : [];
}

function mediaKindFromUrl(url: string): string {
  try {
    return mediaKindFromPath(new URL(url).pathname);
  } catch {
    return "artifact";
  }
}

function mediaKindFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".mp4") || lower.endsWith(".mov") || lower.endsWith(".webm")) return "video";
  if (
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".webp")
  )
    return "image";
  return "artifact";
}

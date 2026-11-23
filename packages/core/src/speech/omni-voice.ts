/**
 * Qwen-Omni / Omni-Realtime voice enrollment (qwen-voice-enrollment).
 *
 * Separate from CosyVoice/Qwen-Audio `voice-enrollment` helpers in voice.ts.
 * Official actions are create / list / delete only (no query/update/design).
 */
import type { Client } from "../client/client.ts";
import type { VoiceEnvelope, VoiceRequest } from "./voice.ts";
import { postVoiceRequest } from "./voice.ts";

/** Fixed model id for the Omni voice customization endpoint. */
export const QWEN_VOICE_ENROLLMENT_MODEL = "qwen-voice-enrollment";

/**
 * Official API enrollment bases (includes Realtime). Kept for reference / protocol docs.
 * CLI clone only accepts {@link OMNI_VOICE_CLI_CLONE_TARGET_MODELS}.
 */
export const OMNI_VOICE_TARGET_MODELS = [
  "qwen3.8-omni-flash-realtime",
  "qwen3.5-omni-plus-realtime",
  "qwen3.5-omni-flash-realtime",
  "qwen3.5-omni-plus",
  "qwen3.5-omni-flash",
] as const;

/**
 * Omni clone targets supported by this CLI (non-realtime HTTP → `bl omni --voice`).
 * Dated snapshots like `qwen3.5-omni-flash-2025-06-15` are accepted via prefix+date.
 */
export const OMNI_VOICE_CLI_CLONE_TARGET_MODELS = [
  "qwen3.5-omni-plus",
  "qwen3.5-omni-flash",
] as const;

export type OmniVoiceTargetModel = (typeof OMNI_VOICE_TARGET_MODELS)[number];

export type OmniVoiceAction = "create" | "list" | "delete";

export type OmniVoiceCloneMode = "normal" | "dialect" | "crosslingual";

/** Omni-shaped ids (protocol routing); not all are valid CLI clone targets. */
const OMNI_LOOKING_TARGET_PATTERN = /^qwen3\.\d+-omni/;

export interface OmniVoiceListItem {
  voice?: string;
  gmt_create?: string;
  target_model?: string;
}

export interface OmniVoiceCreateOutput {
  voice?: string;
  target_model?: string;
}

export interface CreateOmniCloneVoiceInput {
  target_model: string;
  preferred_name: string;
  /** Public URL or audio Data URI (wrapped as input.audio.data). */
  audioData: string;
  text?: string;
  language?: string;
}

export interface CreateOmniCloneVoiceParameters {
  voice_clone_mode?: OmniVoiceCloneMode;
  skip_audio_process?: boolean;
}

/** Model id looks like Qwen-Omni (use Omni protocol; never CosyVoice enrollment). */
export function isOmniVoiceTargetModel(model: string): boolean {
  return OMNI_LOOKING_TARGET_PATTERN.test(model);
}

/** Realtime Omni / Omni-Realtime target (CLI has no Realtime consumer). */
export function isOmniRealtimeTargetModel(model: string): boolean {
  return /realtime/i.test(model);
}

function matchesOmniTargetBase(model: string, bases: readonly string[]): boolean {
  for (const base of bases) {
    if (model === base) return true;
    if (model.startsWith(`${base}-`) && /^\d{4}/.test(model.slice(base.length + 1))) {
      return true;
    }
  }
  return false;
}

/** Official API enrollment target (incl. Realtime), or dated snapshot. */
export function isDocumentedOmniVoiceTargetModel(model: string): boolean {
  return matchesOmniTargetBase(model, OMNI_VOICE_TARGET_MODELS);
}

/** CLI-supported Omni clone target (non-realtime only), or dated snapshot. */
export function isCliOmniVoiceCloneTarget(model: string): boolean {
  return matchesOmniTargetBase(model, OMNI_VOICE_CLI_CLONE_TARGET_MODELS);
}

/** Comma-separated CLI Omni clone targets for error/hint text. */
export function omniVoiceCliCloneTargetsHint(): string {
  return OMNI_VOICE_CLI_CLONE_TARGET_MODELS.join(", ");
}

/** Alias of {@link omniVoiceCliCloneTargetsHint}. */
export function omniVoiceEnrollmentTargetsHint(): string {
  return omniVoiceCliCloneTargetsHint();
}

/** qwen3.8-omni series requires parameters.voice_clone_mode (Realtime API path). */
export function isQwen38OmniTargetModel(model: string): boolean {
  return model.startsWith("qwen3.8-omni");
}
/**
 * Official Omni clone voice ids look like
 * `qwen-omni-vc-<preferred_name>-voice-<timestamp>-<suffix>`.
 */
export function looksLikeOmniClonedVoiceId(voiceId: string): boolean {
  return voiceId.startsWith("qwen-omni-vc-");
}

/** Shared request body builder for Omni dry-run and live calls. */
export function buildOmniVoiceRequest(
  action: OmniVoiceAction,
  input: Record<string, unknown>,
  parameters?: Record<string, unknown>,
): VoiceRequest {
  const request: VoiceRequest = {
    model: QWEN_VOICE_ENROLLMENT_MODEL,
    input: { action, ...input },
  };
  if (parameters !== undefined && Object.keys(parameters).length > 0) {
    request.parameters = parameters;
  }
  return request;
}

function omitUndefined(record: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}

export function createOmniCloneVoice(
  client: Client,
  input: CreateOmniCloneVoiceInput,
  parameters?: CreateOmniCloneVoiceParameters,
  signal?: AbortSignal,
): Promise<VoiceEnvelope<OmniVoiceCreateOutput>> {
  const bodyInput = omitUndefined({
    target_model: input.target_model,
    preferred_name: input.preferred_name,
    audio: { data: input.audioData },
    text: input.text,
    language: input.language,
  });
  const params = parameters ? omitUndefined({ ...parameters }) : undefined;
  return postVoiceRequest(
    client,
    buildOmniVoiceRequest(
      "create",
      bodyInput,
      params && Object.keys(params).length > 0 ? params : undefined,
    ),
    signal,
  );
}

export function listOmniVoices(
  client: Client,
  params: { pageIndex?: number; pageSize?: number } = {},
  signal?: AbortSignal,
): Promise<VoiceEnvelope<{ voice_list?: OmniVoiceListItem[] }>> {
  const input = omitUndefined({
    page_index: params.pageIndex,
    page_size: params.pageSize,
  });
  return postVoiceRequest(client, buildOmniVoiceRequest("list", input), signal);
}

export function deleteOmniVoice(
  client: Client,
  voice: string,
  signal?: AbortSignal,
): Promise<VoiceEnvelope<Record<string, never>>> {
  return postVoiceRequest(client, buildOmniVoiceRequest("delete", { voice }), signal);
}

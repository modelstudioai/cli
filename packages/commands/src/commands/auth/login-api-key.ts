import { normalizeModelBaseUrl, type AuthPersistPatch, type AuthStore } from "bailian-cli-core";

interface ApiKeyLoginDeps {
  authStore: AuthStore;
}

interface ApiKeyLoginProfile {
  persistBaseUrl?: string;
  defaultTextModel?: string;
  defaultVideoModel?: string;
  defaultImageToVideoModel?: string;
  defaultReferenceToVideoModel?: string;
  defaultImageModel?: string;
  defaultSpeechModel?: string;
  defaultSpeechRecognitionModel?: string;
  apiKeyCapabilities?: readonly string[];
  persistPatch?: AuthPersistPatch;
}

/**
 * Persist an API key (and optional profile defaults) without a live model probe.
 * Login is credential storage; connectivity is verified on the first API command.
 * A former chat/completions smoke test conflated quota/model-access 403s with bad keys.
 */
export async function persistApiKey(
  deps: ApiKeyLoginDeps,
  key: string,
  profile: ApiKeyLoginProfile,
): Promise<void> {
  const persistBaseUrl = profile.persistBaseUrl
    ? normalizeModelBaseUrl(profile.persistBaseUrl)
    : undefined;
  await deps.authStore.login({
    ...profile.persistPatch,
    api_key: key,
    base_url: persistBaseUrl,
    default_text_model: profile.defaultTextModel,
    default_video_model: profile.defaultVideoModel,
    default_image_to_video_model: profile.defaultImageToVideoModel,
    default_reference_to_video_model: profile.defaultReferenceToVideoModel,
    default_image_model: profile.defaultImageModel,
    default_speech_model: profile.defaultSpeechModel,
    default_speech_recognition_model: profile.defaultSpeechRecognitionModel,
    api_key_capabilities: profile.apiKeyCapabilities ? [...profile.apiKeyCapabilities] : undefined,
  });
}

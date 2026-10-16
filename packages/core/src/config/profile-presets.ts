interface ModelProfilePreset {
  baseUrl: string;
  defaultTextModel: string;
  defaultVideoModel: string;
  defaultImageToVideoModel: string;
  defaultReferenceToVideoModel: string;
  defaultImageModel: string;
  defaultSpeechModel: string;
  defaultSpeechRecognitionModel: string;
  apiKeyCapabilities: readonly string[];
}

export type ApiKeyLoginKind = "token-plan" | "ordinary" | "unknown";

const MODEL_PROFILE_PRESETS: Readonly<Record<string, ModelProfilePreset>> = {
  "token-plan": {
    baseUrl: "https://token-plan.cn-beijing.maas.aliyuncs.com",
    defaultTextModel: "qwen3.8-max",
    defaultVideoModel: "happyhorse-1.1-t2v",
    defaultImageToVideoModel: "happyhorse-1.1-i2v",
    defaultReferenceToVideoModel: "happyhorse-1.1-r2v",
    defaultImageModel: "wan2.7-image",
    defaultSpeechModel: "qwen-audio-3.0-tts-plus",
    defaultSpeechRecognitionModel: "qwen-audio-3.0-asr-flash",
    apiKeyCapabilities: [
      "text.chat",
      "vision.describe",
      "image.generate",
      "image.edit",
      "speech.recognize",
      "speech.synthesize",
      "video.generate",
      "video.ref",
      "video.task.get",
      "video.download",
    ],
  },
};

/** Defaults materialized when logging into a well-known model profile. */
export function getModelProfilePreset(configName?: string): ModelProfilePreset | undefined {
  return configName ? MODEL_PROFILE_PRESETS[configName] : undefined;
}

/** Classify only the key formats that affect automatic Profile routing. */
export function getApiKeyLoginKind(apiKey: string): ApiKeyLoginKind {
  const normalizedApiKey = apiKey.trim();
  if (normalizedApiKey.startsWith("sk-sp-")) return "token-plan";
  if (normalizedApiKey.startsWith("sk-")) return "ordinary";
  return "unknown";
}

/** Resolve only the Profile target; API Key defaults remain owned by the login flow. */
export function resolveApiKeyLoginConfigName(
  apiKey: string,
  selectedConfigName: string | undefined,
  configExplicit: boolean,
): string | undefined {
  if (configExplicit) return selectedConfigName;
  const apiKeyKind = getApiKeyLoginKind(apiKey);
  if (apiKeyKind === "token-plan") return "token-plan";
  if (apiKeyKind === "ordinary" && selectedConfigName === "token-plan") return undefined;
  return selectedConfigName;
}

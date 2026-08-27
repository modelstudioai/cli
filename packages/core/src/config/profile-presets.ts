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

interface ModelProfilePreset {
  baseUrl: string;
  defaultTextModel: string;
  defaultImageModel: string;
}

const MODEL_PROFILE_PRESETS: Readonly<Record<string, ModelProfilePreset>> = {
  "token-plan": {
    baseUrl: "https://token-plan.cn-beijing.maas.aliyuncs.com",
    defaultTextModel: "qwen3.7-max",
    defaultImageModel: "qwen-image-2.0",
  },
};

/** Defaults materialized when logging into a well-known model profile. */
export function getModelProfilePreset(configName?: string): ModelProfilePreset | undefined {
  return configName ? MODEL_PROFILE_PRESETS[configName] : undefined;
}

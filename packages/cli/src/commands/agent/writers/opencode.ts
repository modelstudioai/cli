import { homedir } from "os";
import { join } from "path";
import { backup, readJson, writeJsonAtomic, isAnthropicEndpoint, type AgentDef } from "./utils.ts";

export default {
  label: "OpenCode",
  write({ baseUrl, apiKey, model }) {
    const configPath = join(homedir(), ".config", "opencode", "opencode.json");

    backup(configPath);
    const config = readJson(configPath);

    if (!config.$schema) config.$schema = "https://opencode.ai/config.json";

    const provider = (config.provider ?? {}) as Record<string, unknown>;
    const npm = isAnthropicEndpoint(baseUrl) ? "@ai-sdk/anthropic" : "@ai-sdk/openai-compatible";
    provider.bailian = {
      npm,
      name: "Alibaba Cloud Model Studio",
      options: { baseURL: baseUrl, apiKey },
      models: { [model]: { name: model } },
    };
    config.provider = provider;

    writeJsonAtomic(configPath, config);

    return {
      paths: [configPath],
      nextStep: "Run `opencode` then type `/models` to select your model.",
    };
  },
} satisfies AgentDef;

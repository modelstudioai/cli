import { homedir } from "os";
import { join } from "path";
import { existsSync } from "fs";
import {
  backup,
  readJson,
  writeJsonAtomic,
  isAnthropicEndpoint,
  type AgentDef,
} from "./utils.ts";

/**
 * OpenCode config follows the Alibaba Cloud Model Studio doc: a `provider`
 * entry with the AI SDK `npm` package chosen by endpoint protocol. OpenCode
 * accepts either `opencode.json` or `opencode.jsonc`; we target an existing
 * `.jsonc` when present, else `.json`.
 */
export default {
  label: "OpenCode",
  write({ baseUrl, apiKey, model }) {
    const dir = join(homedir(), ".config", "opencode");
    const jsoncPath = join(dir, "opencode.jsonc");
    const configPath = existsSync(jsoncPath)
      ? jsoncPath
      : join(dir, "opencode.json");

    backup(configPath);
    const config = readJson(configPath);

    if (!config.$schema) config.$schema = "https://opencode.ai/config.json";

    const provider = (config.provider ?? {}) as Record<string, unknown>;
    const npm = isAnthropicEndpoint(baseUrl)
      ? "@ai-sdk/anthropic"
      : "@ai-sdk/openai-compatible";
    provider["bailian-cli"] = {
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

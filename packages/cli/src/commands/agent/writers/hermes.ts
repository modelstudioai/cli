import { homedir } from "os";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from "fs";
import yaml from "yaml";
import { backup, isAnthropicEndpoint, type AgentDef } from "./utils.ts";

export default {
  label: "Hermes Agent",
  write({ baseUrl, apiKey, model }) {
    const configPath = join(homedir(), ".hermes", "config.yaml");

    backup(configPath);

    let config: Record<string, unknown> = {};
    if (existsSync(configPath)) {
      try {
        config = (yaml.parse(readFileSync(configPath, "utf-8")) ?? {}) as Record<string, unknown>;
      } catch {
        config = {};
      }
    }

    const apiMode = isAnthropicEndpoint(baseUrl) ? "anthropic_messages" : "chat_completions";
    config.model = {
      default: model,
      provider: "custom",
      base_url: baseUrl,
      api_mode: apiMode,
      api_key: apiKey,
    };

    mkdirSync(join(configPath, ".."), { recursive: true });
    const tmp = configPath + ".tmp";
    writeFileSync(tmp, yaml.stringify(config), { mode: 0o600 });
    renameSync(tmp, configPath);

    return {
      paths: [configPath],
      nextStep: 'Run `hermes chat -q "hello"` to verify.',
    };
  },
} satisfies AgentDef;

import { homedir } from "os";
import { join } from "path";
import { existsSync, readFileSync } from "fs";
import yaml from "yaml";
import { backup, writeTextAtomic, isAnthropicEndpoint, type AgentDef } from "./utils.ts";

function configPaths(): string[] {
  return [join(homedir(), ".hermes", "config.yaml")];
}

export default {
  label: "Hermes Agent",
  configPaths,
  write({ baseUrl, apiKey, model }) {
    const [configPath] = configPaths();

    backup(configPath);

    let config: Record<string, unknown> = {};
    if (existsSync(configPath)) {
      try {
        config = (yaml.parse(readFileSync(configPath, "utf-8")) ?? {}) as Record<string, unknown>;
      } catch {
        config = {};
      }
    }

    // Official Model Studio doc shape: a single flat `model` block holding the
    // active endpoint + credentials. `api_mode: anthropic_messages` is required
    // for /apps/anthropic endpoints; for the OpenAI-compatible endpoint the
    // doc says to omit api_mode entirely (chat completions is the default).
    const block: Record<string, unknown> = {
      default: model,
      provider: "custom",
      base_url: baseUrl,
      api_key: apiKey,
    };
    if (isAnthropicEndpoint(baseUrl)) block.api_mode = "anthropic_messages";
    config.model = block;

    writeTextAtomic(configPath, yaml.stringify(config));

    return {
      paths: [configPath],
      nextStep: 'Run `hermes chat -q "hello"` to verify.',
    };
  },
} satisfies AgentDef;

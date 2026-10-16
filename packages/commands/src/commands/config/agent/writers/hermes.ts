import { join } from "path";
import { existsSync, readFileSync } from "fs";
import yaml from "yaml";
import { getHermesHome } from "bailian-cli-core";
import { backup, writeTextAtomic, isAnthropicEndpoint, type AgentDef } from "./utils.ts";

export default {
  label: "Hermes Agent",
  write({ baseUrl, apiKey, model }) {
    // Honor HERMES_HOME / the platform-native default so the config lands where
    // Hermes actually reads it (see core getHermesHome); never hard-code ~/.hermes.
    const configPath = join(getHermesHome(), "config.yaml");

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

import { homedir } from "os";
import { join } from "path";
import { existsSync, readFileSync } from "fs";
import yaml from "yaml";
import { backup, writeTextAtomic, isAnthropicEndpoint, type AgentDef } from "./utils.ts";

const PROVIDER_NAME = "bailian-cli";

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
    const providerEntry = {
      name: PROVIDER_NAME,
      base_url: baseUrl,
      api_key: apiKey,
      api_mode: apiMode,
      models: [{ id: model, name: model }],
    };

    // custom_providers — upsert the bailian-cli entry by name.
    const providers = Array.isArray(config.custom_providers)
      ? (config.custom_providers as Array<Record<string, unknown>>)
      : [];
    const index = providers.findIndex((entry) => entry.name === PROVIDER_NAME);
    if (index >= 0) providers[index] = providerEntry;
    else providers.push(providerEntry);
    config.custom_providers = providers;

    // model — select the bailian-cli provider and default model.
    config.model = { default: model, provider: PROVIDER_NAME };

    writeTextAtomic(configPath, yaml.stringify(config));

    return {
      paths: [configPath],
      nextStep: 'Run `hermes chat -q "hello"` to verify.',
    };
  },
} satisfies AgentDef;

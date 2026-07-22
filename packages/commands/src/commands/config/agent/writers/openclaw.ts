import { homedir } from "os";
import { join } from "path";
import { backup, readJson, writeJsonAtomic, isAnthropicEndpoint, type AgentDef } from "./utils.ts";

export default {
  label: "OpenClaw",
  write({ baseUrl, apiKey, model }) {
    const configPath = join(homedir(), ".openclaw", "openclaw.json");

    backup(configPath);
    const config = readJson(configPath);

    // models.providers["bailian-cli"]
    const models = (config.models ?? {}) as Record<string, unknown>;
    models.mode = "merge";
    const providers = (models.providers ?? {}) as Record<string, unknown>;
    const api = isAnthropicEndpoint(baseUrl) ? "anthropic-messages" : "openai-completions";
    providers["bailian-cli"] = {
      baseUrl,
      apiKey,
      api,
      models: [
        {
          id: model,
          name: model,
          contextWindow: 1000000,
          cost: { input: 0, output: 0 },
        },
      ],
    };
    models.providers = providers;
    config.models = models;

    // agents.defaults
    const agents = (config.agents ?? {}) as Record<string, unknown>;
    const defaults = (agents.defaults ?? {}) as Record<string, unknown>;
    defaults.model = { primary: `bailian-cli/${model}` };
    agents.defaults = defaults;
    config.agents = agents;

    writeJsonAtomic(configPath, config);

    return {
      paths: [configPath],
      nextStep: "Run `openclaw` to start using OpenClaw with DashScope.",
    };
  },
} satisfies AgentDef;

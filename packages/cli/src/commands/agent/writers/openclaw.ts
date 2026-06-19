import { homedir } from "os";
import { join } from "path";
import { backup, readJson, writeJsonAtomic, type AgentDef } from "./utils.ts";

export default {
  label: "OpenClaw",
  write({ baseUrl, apiKey, model }) {
    const configPath = join(homedir(), ".openclaw", "openclaw.json");

    backup(configPath);
    const config = readJson(configPath);

    // models.providers.bailian
    const models = (config.models ?? {}) as Record<string, unknown>;
    models.mode = "merge";
    const providers = (models.providers ?? {}) as Record<string, unknown>;
    providers.bailian = {
      baseUrl,
      apiKey,
      api: "anthropic-messages",
      models: [
        {
          id: model,
          name: model,
          reasoning: false,
          input: ["text", "image"],
          contextWindow: 1000000,
          maxTokens: 65536,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        },
      ],
    };
    models.providers = providers;
    config.models = models;

    // agents.defaults
    const agents = (config.agents ?? {}) as Record<string, unknown>;
    const defaults = (agents.defaults ?? {}) as Record<string, unknown>;
    defaults.model = { primary: `bailian/${model}` };
    agents.defaults = defaults;
    config.agents = agents;

    writeJsonAtomic(configPath, config);

    return {
      paths: [configPath],
      nextStep: "Run `openclaw` to start using OpenClaw with DashScope.",
    };
  },
} satisfies AgentDef;

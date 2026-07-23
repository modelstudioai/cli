import { homedir } from "os";
import { join } from "path";
import {
  backup,
  readJson,
  writeJsonAtomic,
  isAnthropicEndpoint,
  type AgentDef,
} from "./utils.ts";

// Safe default when --context-window is not given: most Model Studio models
// offer ≥256K context; users can raise it per model via the flag.
const DEFAULT_CONTEXT_WINDOW = 256000;

export default {
  label: "OpenClaw",
  write({ baseUrl, apiKey, model, contextWindow }) {
    const configPath = join(homedir(), ".openclaw", "openclaw.json");

    backup(configPath);
    const config = readJson(configPath);

    // models.providers["bailian-cli"]
    const models = (config.models ?? {}) as Record<string, unknown>;
    models.mode = "merge";
    const providers = (models.providers ?? {}) as Record<string, unknown>;
    const api = isAnthropicEndpoint(baseUrl)
      ? "anthropic-messages"
      : "openai-completions";
    providers["bailian-cli"] = {
      baseUrl,
      apiKey,
      api,
      models: [
        {
          id: model,
          name: model,
          contextWindow: contextWindow ?? DEFAULT_CONTEXT_WINDOW,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        },
      ],
    };
    models.providers = providers;
    config.models = models;

    // agents.defaults — select the model and register it in the allowlist.
    const agents = (config.agents ?? {}) as Record<string, unknown>;
    const defaults = (agents.defaults ?? {}) as Record<string, unknown>;
    const primary = `bailian-cli/${model}`;
    defaults.model = { primary };
    const allowlist = (defaults.models ?? {}) as Record<string, unknown>;
    allowlist[primary] = allowlist[primary] ?? {};
    defaults.models = allowlist;
    agents.defaults = defaults;
    config.agents = agents;

    writeJsonAtomic(configPath, config);

    return {
      paths: [configPath],
      nextStep:
        "Run `openclaw gateway restart`, then `openclaw` to start using OpenClaw with DashScope.",
    };
  },
} satisfies AgentDef;

import { homedir } from "os";
import { join } from "path";
import {
  backup,
  readJson,
  writeJsonAtomic,
  isAnthropicEndpoint,
  type AgentDef,
} from "./utils.ts";

/**
 * OpenClaw config follows the Alibaba Cloud Model Studio doc: a merged
 * `models.providers` entry plus an `agents.defaults` selection. `contextWindow`
 * is only written when the caller supplies it (`--context-window`); we never
 * fake a value, since an over-large window makes OpenClaw defer compaction and
 * hit server-side limits on smaller-context models.
 */
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
    const modelEntry: Record<string, unknown> = {
      id: model,
      name: model,
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    };
    if (typeof contextWindow === "number")
      modelEntry.contextWindow = contextWindow;
    providers["bailian-cli"] = { baseUrl, apiKey, api, models: [modelEntry] };
    models.providers = providers;
    config.models = models;

    // agents.defaults — primary selection + models map (per Model Studio doc).
    const modelRef = `bailian-cli/${model}`;
    const agents = (config.agents ?? {}) as Record<string, unknown>;
    const defaults = (agents.defaults ?? {}) as Record<string, unknown>;
    const defaultModel = (defaults.model ?? {}) as Record<string, unknown>;
    defaultModel.primary = modelRef;
    defaults.model = defaultModel;
    const defaultModels = (defaults.models ?? {}) as Record<string, unknown>;
    defaultModels[modelRef] = defaultModels[modelRef] ?? {};
    defaults.models = defaultModels;
    agents.defaults = defaults;
    config.agents = agents;

    writeJsonAtomic(configPath, config);

    return {
      paths: [configPath],
      nextStep: "Run `openclaw` to start using OpenClaw with DashScope.",
    };
  },
} satisfies AgentDef;

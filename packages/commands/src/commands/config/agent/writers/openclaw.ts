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

const PROVIDER_ID = "bailian-cli";

function readPrimary(defaults: Record<string, unknown>): string | undefined {
  const model = defaults.model;
  if (!model || typeof model !== "object") return undefined;
  const primary = (model as Record<string, unknown>).primary;
  return typeof primary === "string" && primary.trim() !== "" ? primary.trim() : undefined;
}

export default {
  label: "OpenClaw",
  write({ baseUrl, apiKey, model, contextWindow }) {
    const configPath = join(homedir(), ".openclaw", "openclaw.json");
    const warnings: string[] = [];
    const modelRef = `${PROVIDER_ID}/${model}`;

    backup(configPath);
    const config = readJson(configPath);

    // models.providers["bailian-cli"] — upsert without removing other providers
    // (e.g. an existing working bailian-token-plan setup).
    const models = (config.models ?? {}) as Record<string, unknown>;
    models.mode = "merge";
    const providers = (models.providers ?? {}) as Record<string, unknown>;
    const api = isAnthropicEndpoint(baseUrl) ? "anthropic-messages" : "openai-completions";
    providers[PROVIDER_ID] = {
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

    // agents.defaults — register the model in the allow-list. Only set primary
    // when unset, or when primary already points at bailian-cli (reconfigure).
    // Never steal primary away from another provider such as bailian-token-plan.
    const agents = (config.agents ?? {}) as Record<string, unknown>;
    const defaults = (agents.defaults ?? {}) as Record<string, unknown>;
    const allowedModels = (defaults.models ?? {}) as Record<string, unknown>;
    allowedModels[modelRef] = allowedModels[modelRef] ?? {};
    defaults.models = allowedModels;

    const existingPrimary = readPrimary(defaults);
    if (!existingPrimary) {
      defaults.model = { primary: modelRef };
    } else if (existingPrimary.startsWith(`${PROVIDER_ID}/`)) {
      defaults.model = { primary: modelRef };
    } else {
      warnings.push(
        `Left existing primary model unchanged ("${existingPrimary}"). ` +
          `Added provider "${PROVIDER_ID}" — switch to "${modelRef}" in OpenClaw if you want to use it.`,
      );
    }

    agents.defaults = defaults;
    config.agents = agents;

    writeJsonAtomic(configPath, config);

    return {
      paths: [configPath],
      nextStep:
        "Run `openclaw gateway restart`, then `openclaw` to start using OpenClaw with DashScope.",
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  },
} satisfies AgentDef;

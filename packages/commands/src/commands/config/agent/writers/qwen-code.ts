import { homedir } from "os";
import { join } from "path";
import {
  backup,
  readJson,
  writeJsonAtomic,
  isAnthropicEndpoint,
  type AgentDef,
} from "./utils.ts";

const ENV_KEY = "BAILIAN_API_KEY";

/**
 * Qwen Code keys `modelProviders` and `security.auth.selectedType` by the SDK
 * protocol (an AuthType string), not by a free-form provider id — the runtime
 * resolver indexes credentials/defaults by protocol. Structure follows the
 * Alibaba Cloud Model Studio doc: the API key lives in `env` (read via the
 * provider entry's `envKey`); `security.auth` only records the selected type.
 */
export default {
  label: "Qwen Code",
  write({ baseUrl, apiKey, model }) {
    const settingsPath = join(homedir(), ".qwen", "settings.json");
    const protocol = isAnthropicEndpoint(baseUrl) ? "anthropic" : "openai";

    backup(settingsPath);
    const settings = readJson(settingsPath);

    // env — API key read by the provider entry's envKey.
    const env = (settings.env ?? {}) as Record<string, string>;
    env[ENV_KEY] = apiKey;
    settings.env = env;

    // modelProviders[<protocol>] — upsert the model entry.
    const providers = (settings.modelProviders ?? {}) as Record<
      string,
      Array<Record<string, unknown>>
    >;
    const entries = (providers[protocol] ?? []) as Array<
      Record<string, unknown>
    >;
    const displayName = `[Bailian] ${model}`;
    const existing = entries.find(
      (entry) => entry.id === model && (entry.baseUrl ?? "") === baseUrl,
    );
    if (existing) {
      existing.name = displayName;
      existing.baseUrl = baseUrl;
      existing.envKey = ENV_KEY;
    } else {
      entries.push({ id: model, name: displayName, baseUrl, envKey: ENV_KEY });
    }
    providers[protocol] = entries;
    settings.modelProviders = providers;

    // security.auth — only the selected protocol (no deprecated apiKey/baseUrl).
    const security = (settings.security ?? {}) as Record<string, unknown>;
    const auth = (security.auth ?? {}) as Record<string, unknown>;
    auth.selectedType = protocol;
    security.auth = auth;
    settings.security = security;

    // model + settings version (per Model Studio doc).
    const modelConfig = (settings.model ?? {}) as Record<string, unknown>;
    modelConfig.name = model;
    settings.model = modelConfig;
    settings.$version = 3;

    writeJsonAtomic(settingsPath, settings);

    return {
      paths: [settingsPath],
      nextStep: "Run `qwen` to start using Qwen Code with DashScope.",
    };
  },
} satisfies AgentDef;

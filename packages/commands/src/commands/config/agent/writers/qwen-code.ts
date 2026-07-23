import { homedir } from "os";
import { join } from "path";
import {
  backup,
  readJson,
  writeJsonAtomic,
  isAnthropicEndpoint,
  type AgentDef,
} from "./utils.ts";

const ENV_KEY = "BAILIAN_CLI_API_KEY";

/**
 * Qwen Code keys `modelProviders` and `security.auth.selectedType` by the SDK
 * protocol (an AuthType string), not by a free-form provider id — the runtime
 * resolver indexes credentials/defaults by protocol. The `bailian-cli` brand
 * therefore lives in the model entry `name` and the env var name.
 */
export default {
  label: "Qwen Code",
  write({ baseUrl, apiKey, model }) {
    const settingsPath = join(homedir(), ".qwen", "settings.json");
    const protocol = isAnthropicEndpoint(baseUrl) ? "anthropic" : "openai";

    backup(settingsPath);
    const settings = readJson(settingsPath);

    // $version — Qwen Code v3 settings schema (official Model Studio doc shape).
    settings.$version = 3;

    // env — API key read by the provider entry's envKey.
    const env = (settings.env ?? {}) as Record<string, string>;
    env[ENV_KEY] = apiKey;
    settings.env = env;

    // modelProviders[<protocol>] — upsert the bailian-cli model entry.
    const providers = (settings.modelProviders ?? {}) as Record<
      string,
      Array<Record<string, unknown>>
    >;
    const entries = (providers[protocol] ?? []) as Array<
      Record<string, unknown>
    >;
    const existing = entries.find(
      (entry) => entry.id === model && (entry.baseUrl ?? "") === baseUrl,
    );
    if (existing) {
      existing.name = "bailian-cli";
      existing.baseUrl = baseUrl;
      existing.envKey = ENV_KEY;
    } else {
      entries.push({
        id: model,
        name: "bailian-cli",
        baseUrl,
        envKey: ENV_KEY,
      });
    }
    providers[protocol] = entries;
    settings.modelProviders = providers;

    // security.auth — select the protocol only. Credentials live in env (via
    // each provider entry's envKey); writing apiKey/baseUrl here is not part of
    // the v3 schema.
    const security = (settings.security ?? {}) as Record<string, unknown>;
    security.auth = { selectedType: protocol };
    settings.security = security;

    // model — active model id, resolved inside modelProviders[protocol].
    settings.model = { name: model };

    writeJsonAtomic(settingsPath, settings);

    return {
      paths: [settingsPath],
      nextStep: "Run `qwen` to start using Qwen Code with DashScope.",
    };
  },
} satisfies AgentDef;

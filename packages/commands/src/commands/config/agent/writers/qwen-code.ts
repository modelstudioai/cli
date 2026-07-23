import { homedir } from "os";
import { join } from "path";
import { backup, readJson, writeJsonAtomic, isAnthropicEndpoint, type AgentDef } from "./utils.ts";

const ENV_KEY = "BAILIAN_CLI_API_KEY";

/**
 * Qwen Code keys `modelProviders` and `security.auth.selectedType` by the SDK
 * protocol (an AuthType string), not by a free-form provider id — the runtime
 * resolver indexes credentials/defaults by protocol. The `bailian-cli` brand
 * therefore lives only in the env var name (`BAILIAN_CLI_API_KEY`); each model
 * entry's `name` stays a human display label (Qwen Code keys models by
 * id + baseUrl, never by name).
 *
 * Credentials are written to BOTH `env` (via the entry's `envKey`) and
 * `security.auth` — the resolver reads `security.auth.apiKey/baseUrl` as a
 * lower-priority layer, which stops a stray system `OPENAI_API_KEY` from being
 * picked up when the provider→envKey path does not resolve first. The active
 * `model` also carries its `baseUrl`, as Qwen Code requires to disambiguate
 * same-id providers.
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

    // modelProviders[<protocol>] — upsert this model's entry, keyed by
    // id + baseUrl (the identity Qwen Code's registry uses). `name` is the
    // model's DISPLAY label; keep an existing custom name, and heal the old
    // "bailian-cli" sentinel a previous version wrote (it collided across every
    // configured model in the picker).
    const providers = (settings.modelProviders ?? {}) as Record<
      string,
      Array<Record<string, unknown>>
    >;
    const entries = (providers[protocol] ?? []) as Array<Record<string, unknown>>;
    const displayName = `[Bailian] ${model}`;
    const existing = entries.find(
      (entry) => entry.id === model && (entry.baseUrl ?? "") === baseUrl,
    );
    if (existing) {
      existing.baseUrl = baseUrl;
      existing.envKey = ENV_KEY;
      const currentName = typeof existing.name === "string" ? existing.name.trim() : "";
      if (!currentName || currentName === "bailian-cli") existing.name = displayName;
    } else {
      entries.push({
        id: model,
        name: displayName,
        baseUrl,
        envKey: ENV_KEY,
      });
    }
    providers[protocol] = entries;
    settings.modelProviders = providers;

    // security.auth — select the protocol AND keep credentials as a fallback
    // layer (see the file-level note): without this, a stray system
    // OPENAI_API_KEY can win when the provider→envKey lookup does not resolve.
    const security = (settings.security ?? {}) as Record<string, unknown>;
    security.auth = { selectedType: protocol, apiKey, baseUrl };
    settings.security = security;

    // model — active model. baseUrl MUST be written alongside name; Qwen Code
    // uses it to disambiguate same-id providers, and omitting it can misroute
    // to a different entry (and thus a different credential).
    settings.model = { name: model, baseUrl };

    writeJsonAtomic(settingsPath, settings);

    return {
      paths: [settingsPath],
      nextStep: "Run `qwen` to start using Qwen Code with DashScope.",
    };
  },
} satisfies AgentDef;

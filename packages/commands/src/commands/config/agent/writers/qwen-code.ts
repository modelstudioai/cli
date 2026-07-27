import { homedir } from "os";
import { join } from "path";
import { backup, readJson, writeJsonAtomic, isAnthropicEndpoint, type AgentDef } from "./utils.ts";

const ENV_KEY = "BAILIAN_CLI_API_KEY";

function displayName(model: string): string {
  return `[Bailian] ${model}`;
}

/** Entries we previously wrote, or still own via envKey / display brand. */
function isBailianCliEntry(entry: Record<string, unknown>): boolean {
  if (entry.envKey === ENV_KEY) return true;
  const name = typeof entry.name === "string" ? entry.name : "";
  return name === "bailian-cli" || name.startsWith("[Bailian]");
}

/**
 * Qwen Code keys `modelProviders` and `security.auth.selectedType` by the SDK
 * protocol (an AuthType string), not by a free-form provider id — the runtime
 * resolver indexes credentials/defaults by protocol. The `bailian-cli` brand
 * therefore lives in the env var name (`BAILIAN_CLI_API_KEY`) and the display
 * label (`[Bailian] …`); Qwen Code keys models by id (+ baseUrl), never by name.
 *
 * Qwen Code does not support duplicate model `id`s (only the first loads), so
 * we must never overwrite a pre-existing Token Plan / third-party entry that
 * shares the same id.
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
    const warnings: string[] = [];

    backup(settingsPath);
    const settings = readJson(settingsPath);

    // $version — Qwen Code v3 settings schema (official Model Studio doc shape).
    settings.$version = 3;

    // env — API key read by the provider entry's envKey.
    // Qwen Code treats settings.json `env` as lowest priority; a process/shell
    // value for the same key wins and can make the first launch fail.
    const env = (settings.env ?? {}) as Record<string, string>;
    env[ENV_KEY] = apiKey;
    settings.env = env;

    const processEnvValue = process.env[ENV_KEY];
    if (processEnvValue !== undefined && processEnvValue !== apiKey) {
      warnings.push(
        `Shell/environment ${ENV_KEY} is set and overrides settings.json. ` +
          `Unset it (e.g. \`unset ${ENV_KEY}\`) so the key written here takes effect.`,
      );
    }

    // modelProviders[<protocol>] — upsert only bailian-cli-owned entries.
    const providers = (settings.modelProviders ?? {}) as Record<
      string,
      Array<Record<string, unknown>>
    >;
    const entries = (providers[protocol] ?? []) as Array<Record<string, unknown>>;
    const owned = entries.find((entry) => isBailianCliEntry(entry) && entry.id === model);
    const conflicting = entries.find((entry) => !isBailianCliEntry(entry) && entry.id === model);

    if (owned) {
      owned.baseUrl = baseUrl;
      owned.envKey = ENV_KEY;
      const currentName = typeof owned.name === "string" ? owned.name.trim() : "";
      if (!currentName || currentName === "bailian-cli") owned.name = displayName(model);
    } else if (conflicting) {
      const existingName =
        typeof conflicting.name === "string" && conflicting.name.length > 0
          ? conflicting.name
          : String(conflicting.id);
      warnings.push(
        `Model id "${model}" already exists as "${existingName}"; left unchanged ` +
          `(Qwen Code loads only the first entry per id). Remove or rename that ` +
          `entry if you want bailian-cli to own this model.`,
      );
    } else {
      entries.push({
        id: model,
        name: displayName(model),
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
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  },
} satisfies AgentDef;

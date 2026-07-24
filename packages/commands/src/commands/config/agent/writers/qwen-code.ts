import { homedir } from "os";
import { join } from "path";
import { backup, readJson, writeJsonAtomic, isAnthropicEndpoint, type AgentDef } from "./utils.ts";

const ENV_KEY = "BAILIAN_CLI_API_KEY";

function displayName(model: string): string {
  return `${model} (bailian-cli)`;
}

/** Entries we previously wrote, or still own via envKey. */
function isBailianCliEntry(entry: Record<string, unknown>): boolean {
  return entry.envKey === ENV_KEY || entry.name === "bailian-cli";
}

/**
 * Qwen Code keys `modelProviders` and `security.auth.selectedType` by the SDK
 * protocol (an AuthType string), not by a free-form provider id — the runtime
 * resolver indexes credentials/defaults by protocol. Ownership is tracked via
 * `envKey` (`BAILIAN_CLI_API_KEY`) and a display `name` suffix `(bailian-cli)`.
 *
 * Qwen Code does not support duplicate model `id`s (only the first loads), so
 * we must never overwrite a pre-existing Token Plan / third-party entry that
 * shares the same id.
 */
export default {
  label: "Qwen Code",
  write({ baseUrl, apiKey, model }) {
    const settingsPath = join(homedir(), ".qwen", "settings.json");
    const protocol = isAnthropicEndpoint(baseUrl) ? "anthropic" : "openai";
    const warnings: string[] = [];

    backup(settingsPath);
    const settings = readJson(settingsPath);

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
      owned.name = displayName(model);
      owned.baseUrl = baseUrl;
      owned.envKey = ENV_KEY;
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

    // security.auth — select protocol only. Prefer modelProviders + envKey for
    // credentials; apiKey/baseUrl on auth are deprecated in Qwen Code.
    const security = (settings.security ?? {}) as Record<string, unknown>;
    const previousAuth =
      security.auth && typeof security.auth === "object"
        ? (security.auth as Record<string, unknown>)
        : {};
    security.auth = { ...previousAuth, selectedType: protocol };
    // Drop deprecated inline creds so they cannot disagree with envKey lookup.
    delete (security.auth as Record<string, unknown>).apiKey;
    delete (security.auth as Record<string, unknown>).baseUrl;
    settings.security = security;

    // model — active model id (disambiguated by baseUrl when supported).
    settings.model = { name: model, baseUrl };

    writeJsonAtomic(settingsPath, settings);

    return {
      paths: [settingsPath],
      nextStep: "Run `qwen` to start using Qwen Code with DashScope.",
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  },
} satisfies AgentDef;

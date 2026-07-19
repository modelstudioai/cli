import { join } from "path";
import { existsSync, readFileSync } from "fs";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { BailianError, ExitCode } from "bailian-cli-core";
import {
  backup,
  readJson,
  writeJsonAtomic,
  writeTextAtomic,
  codexHome,
  type AgentDef,
} from "./utils.ts";

const PROVIDER_KEY = "bailian-cli";

/**
 * Codex config follows the Alibaba Cloud Model Studio doc: `config.toml`
 * declares the provider with `env_key = "OPENAI_API_KEY"` and
 * `wire_api = "responses"`; the API key is stored in `auth.json`
 * (Codex's native API-key store, equivalent to exporting OPENAI_API_KEY).
 * Config root respects `$CODEX_HOME`.
 */
export default {
  label: "Codex",
  write({ baseUrl, apiKey, model }) {
    const configPath = join(codexHome(), "config.toml");

    // config.toml — merge so unrelated settings (mcp_servers, approval_policy,
    // other providers, ...) are preserved.
    backup(configPath);
    let config: Record<string, unknown> = {};
    if (existsSync(configPath)) {
      try {
        config = parseToml(readFileSync(configPath, "utf-8")) as Record<
          string,
          unknown
        >;
      } catch (error) {
        throw new BailianError(
          `Failed to parse existing config: ${configPath}`,
          ExitCode.GENERAL,
          `Fix or back up the file, then retry. Underlying error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    config.model_provider = PROVIDER_KEY;
    config.model = model;

    const providers = (config.model_providers ?? {}) as Record<string, unknown>;
    const existing = (providers[PROVIDER_KEY] ?? {}) as Record<string, unknown>;
    providers[PROVIDER_KEY] = {
      ...existing,
      name: PROVIDER_KEY,
      base_url: baseUrl,
      env_key: "OPENAI_API_KEY",
      wire_api: "responses",
    };
    config.model_providers = providers;

    writeTextAtomic(configPath, stringifyToml(config) + "\n");

    // auth.json — Codex reads OPENAI_API_KEY from here.
    const authPath = join(codexHome(), "auth.json");
    backup(authPath);
    const auth = readJson(authPath);
    auth.OPENAI_API_KEY = apiKey;
    writeJsonAtomic(authPath, auth);

    return {
      paths: [configPath, authPath],
      nextStep: "Run `codex` to start using Codex with DashScope.",
    };
  },
} satisfies AgentDef;

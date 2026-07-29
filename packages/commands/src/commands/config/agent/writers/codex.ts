import { homedir } from "os";
import { join } from "path";
import { existsSync, readFileSync } from "fs";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import {
  backup,
  readJson,
  writeJsonAtomic,
  writeTextAtomic,
  type AgentDef,
} from "./utils.ts";

const PROVIDER_KEY = "bailian-cli";

function configPaths(): string[] {
  return [
    join(homedir(), ".codex", "config.toml"),
    join(homedir(), ".codex", "auth.json"),
  ];
}

export default {
  label: "Codex",
  configPaths,
  write({ baseUrl, apiKey, model, wireApi: wireApiParam }) {
    const [configPath, authPath] = configPaths();
    const warnings: string[] = [];

    // config.toml — merge into existing config so unrelated settings
    // (mcp_servers, approval_policy, other providers, ...) are preserved.
    backup(configPath);
    let config: Record<string, unknown> = {};
    if (existsSync(configPath)) {
      try {
        config = parseToml(readFileSync(configPath, "utf-8")) as Record<
          string,
          unknown
        >;
      } catch {
        config = {};
      }
    }

    config.model_provider = PROVIDER_KEY;
    config.model = model;

    // wire_api — current Codex releases only load `wire_api = "responses"`
    // ("chat" is rejected at config load, see openai/codex discussion #7782).
    // "chat" remains an explicit opt-in for users pinned to legacy Codex
    // <= 0.80.0 (the Model Studio path for models without Responses support).
    const wireApi = wireApiParam === "chat" ? "chat" : "responses";
    if (wireApi === "chat") {
      warnings.push(
        'Current Codex releases refuse to load `wire_api = "chat"`; ' +
          "only use --wire-api chat with legacy Codex <= 0.80.0 " +
          "(e.g. `npm install -g @openai/codex@0.80.0`).",
      );
    }

    const providers = (config.model_providers ?? {}) as Record<string, unknown>;
    const existing = (providers[PROVIDER_KEY] ?? {}) as Record<string, unknown>;
    providers[PROVIDER_KEY] = {
      ...existing,
      name: PROVIDER_KEY,
      base_url: baseUrl,
      // env_key is the official-doc credential mechanism: Codex resolves the
      // key from the OPENAI_API_KEY env var, falling back to auth.json below.
      env_key: "OPENAI_API_KEY",
      wire_api: wireApi,
      requires_openai_auth: true,
    };
    config.model_providers = providers;

    writeTextAtomic(configPath, stringifyToml(config) + "\n");

    // auth.json — Codex reads OPENAI_API_KEY from here when the env var is unset.
    backup(authPath);
    const auth = readJson(authPath);
    auth.OPENAI_API_KEY = apiKey;
    writeJsonAtomic(authPath, auth);

    return {
      paths: [configPath, authPath],
      nextStep: "Run `codex` to start using Codex with DashScope.",
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  },
} satisfies AgentDef;

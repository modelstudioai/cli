import { homedir } from "os";
import { join } from "path";
import { existsSync, readFileSync } from "fs";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { backup, readJson, writeJsonAtomic, writeTextAtomic, type AgentDef } from "./utils.ts";

const PROVIDER_KEY = "bailian-cli";

export default {
  label: "Codex",
  write({ baseUrl, apiKey, model }) {
    const configPath = join(homedir(), ".codex", "config.toml");

    // config.toml — merge into existing config so unrelated settings
    // (mcp_servers, approval_policy, other providers, ...) are preserved.
    backup(configPath);
    let config: Record<string, unknown> = {};
    if (existsSync(configPath)) {
      try {
        config = parseToml(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
      } catch {
        config = {};
      }
    }

    config.model_provider = PROVIDER_KEY;
    config.model = model;
    config.model_reasoning_effort = "high";
    config.disable_response_storage = true;

    const providers = (config.model_providers ?? {}) as Record<string, unknown>;
    const existing = (providers[PROVIDER_KEY] ?? {}) as Record<string, unknown>;
    providers[PROVIDER_KEY] = {
      ...existing,
      name: PROVIDER_KEY,
      base_url: baseUrl,
      wire_api: "responses",
      requires_openai_auth: true,
    };
    config.model_providers = providers;

    writeTextAtomic(configPath, stringifyToml(config) + "\n");

    // auth.json — Codex reads OPENAI_API_KEY from here.
    const authPath = join(homedir(), ".codex", "auth.json");
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

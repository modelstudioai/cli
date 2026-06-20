import { homedir } from "os";
import { join } from "path";
import { mkdirSync, writeFileSync, renameSync } from "fs";
import { backup, readJson, writeJsonAtomic, type AgentDef } from "./utils.ts";

export default {
  label: "Codex",
  write({ baseUrl, apiKey, model }) {
    const configPath = join(homedir(), ".codex", "config.toml");

    backup(configPath);

    const toml = [
      `model_provider = "Model_Studio"`,
      `model = "${model}"`,
      ``,
      `[model_providers.Model_Studio]`,
      `name = "Model_Studio"`,
      `base_url = "${baseUrl}"`,
      `env_key = "OPENAI_API_KEY"`,
      `wire_api = "responses"`,
      ``,
    ].join("\n");

    mkdirSync(join(configPath, ".."), { recursive: true });
    const tmp = configPath + ".tmp";
    writeFileSync(tmp, toml, { mode: 0o600 });
    renameSync(tmp, configPath);

    // auth.json — store API key for Codex to read
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

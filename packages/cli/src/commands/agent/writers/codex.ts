import { homedir } from "os";
import { join } from "path";
import { mkdirSync, writeFileSync, renameSync } from "fs";
import { backup, type AgentDef } from "./utils.ts";

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

    // Also hint about OPENAI_API_KEY env var
    const shell = process.platform === "win32" ? "powershell" : "shell";
    const envHint =
      shell === "powershell"
        ? `Set env: [Environment]::SetEnvironmentVariable("OPENAI_API_KEY", "${apiKey}", "User")`
        : `Set env: export OPENAI_API_KEY="${apiKey}"`;

    return {
      paths: [configPath],
      nextStep: `${envHint}\n  Then run \`codex\` to start using Codex with DashScope.`,
    };
  },
} satisfies AgentDef;

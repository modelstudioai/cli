import { homedir } from "os";
import { join } from "path";
import { backup, readJson, writeJsonAtomic, type AgentDef } from "./utils.ts";

export default {
  label: "Qwen Code",
  write({ baseUrl, apiKey, model }) {
    const settingsPath = join(homedir(), ".qwen", "settings.json");

    backup(settingsPath);
    const settings = readJson(settingsPath);

    // env
    const env = (settings.env ?? {}) as Record<string, string>;
    env.BAILIAN_API_KEY = apiKey;
    settings.env = env;

    // modelProviders.openai — append or update
    const providers = (settings.modelProviders ?? {}) as Record<string, unknown[]>;
    const openaiModels = (providers.openai ?? []) as Array<Record<string, unknown>>;
    const existing = openaiModels.find((m) => m.id === model);
    if (existing) {
      existing.baseUrl = baseUrl;
      existing.envKey = "BAILIAN_API_KEY";
      existing.name = `[Bailian] ${model}`;
    } else {
      openaiModels.push({
        id: model,
        name: `[Bailian] ${model}`,
        baseUrl,
        envKey: "BAILIAN_API_KEY",
      });
    }
    providers.openai = openaiModels;
    settings.modelProviders = providers;

    // security & model & version
    settings.security = { auth: { selectedType: "openai" } };
    settings.model = { name: model };
    settings.$version = 3;

    writeJsonAtomic(settingsPath, settings);

    return {
      paths: [settingsPath],
      nextStep: "Run `qwen` to start using Qwen Code with DashScope.",
    };
  },
} satisfies AgentDef;

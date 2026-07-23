import { homedir } from "os";
import { join } from "path";
import { backup, readJson, writeJsonAtomic, type AgentDef } from "./utils.ts";

export default {
  label: "Claude Code",
  write({ baseUrl, apiKey, model }) {
    // Claude Code honors CLAUDE_CONFIG_DIR for its settings location.
    const configDir =
      process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
    const settingsPath = join(configDir, "settings.json");
    const onboardingPath = join(homedir(), ".claude.json");

    // settings.json — merge env. Base URL + auth token connect Claude Code to
    // the endpoint; the model tier vars force every tier onto the chosen model.
    backup(settingsPath);
    const settings = readJson(settingsPath);
    const env = (settings.env ?? {}) as Record<string, string>;
    env.ANTHROPIC_BASE_URL = baseUrl;
    env.ANTHROPIC_AUTH_TOKEN = apiKey;
    // AUTH_TOKEN and API_KEY are mutually exclusive credential fields — drop a
    // stale ANTHROPIC_API_KEY so it cannot shadow the token we just wrote.
    delete env.ANTHROPIC_API_KEY;
    env.ANTHROPIC_MODEL = model;
    env.ANTHROPIC_DEFAULT_HAIKU_MODEL = model;
    env.ANTHROPIC_DEFAULT_SONNET_MODEL = model;
    env.ANTHROPIC_DEFAULT_OPUS_MODEL = model;
    env.CLAUDE_CODE_SUBAGENT_MODEL = model;
    settings.env = env;
    writeJsonAtomic(settingsPath, settings);

    // .claude.json — skip the onboarding prompt on first launch.
    backup(onboardingPath);
    const onboarding = readJson(onboardingPath);
    onboarding.hasCompletedOnboarding = true;
    writeJsonAtomic(onboardingPath, onboarding);

    return {
      paths: [settingsPath, onboardingPath],
      nextStep: "Run `claude` to start using Claude Code with DashScope.",
    };
  },
} satisfies AgentDef;

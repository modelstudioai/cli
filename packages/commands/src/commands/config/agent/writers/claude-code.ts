import { homedir } from "os";
import { join } from "path";
import {
  backup,
  readJson,
  writeJsonAtomic,
  resolveClaudeCodeBaseUrl,
  type AgentDef,
} from "./utils.ts";

/** Fill a tier/default model env only when the user has not set it yet. */
function setModelEnvIfAbsent(env: Record<string, string>, key: string, model: string): void {
  const current = env[key];
  if (current === undefined || current.trim() === "") {
    env[key] = model;
  }
}

function configPaths(): string[] {
  // Claude Code honors CLAUDE_CONFIG_DIR for its settings location.
  const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
  return [join(configDir, "settings.json"), join(homedir(), ".claude.json")];
}

export default {
  label: "Claude Code",
  configPaths,
  write({ baseUrl, apiKey, model }) {
    const [settingsPath, onboardingPath] = configPaths();
    const warnings: string[] = [];

    const resolved = resolveClaudeCodeBaseUrl(baseUrl);
    if (resolved.rewrittenFrom) {
      warnings.push(
        `Rewrote base URL for Claude Code: "${resolved.rewrittenFrom}" → "${resolved.url}" ` +
          `(Claude Code needs /apps/anthropic, not OpenAI compatible-mode).`,
      );
    }

    // settings.json — merge env. Base URL + auth token connect Claude Code to
    // the Anthropic-compatible endpoint; primary model always updates, while
    // tier/subagent defaults are filled only when absent so existing setups
    // (e.g. Token Plan Haiku/Subagent splits) are not wiped.
    backup(settingsPath);
    const settings = readJson(settingsPath);
    const env = (settings.env ?? {}) as Record<string, string>;
    env.ANTHROPIC_BASE_URL = resolved.url;
    env.ANTHROPIC_AUTH_TOKEN = apiKey;
    // AUTH_TOKEN and API_KEY are mutually exclusive credential fields — drop a
    // stale ANTHROPIC_API_KEY so it cannot shadow the token we just wrote.
    delete env.ANTHROPIC_API_KEY;
    env.ANTHROPIC_MODEL = model;
    setModelEnvIfAbsent(env, "ANTHROPIC_DEFAULT_HAIKU_MODEL", model);
    setModelEnvIfAbsent(env, "ANTHROPIC_DEFAULT_SONNET_MODEL", model);
    setModelEnvIfAbsent(env, "ANTHROPIC_DEFAULT_OPUS_MODEL", model);
    setModelEnvIfAbsent(env, "CLAUDE_CODE_SUBAGENT_MODEL", model);
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
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  },
} satisfies AgentDef;

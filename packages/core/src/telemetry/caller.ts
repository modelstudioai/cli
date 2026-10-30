/** Parse BAILIAN_CALLER_*. Only an explicit agent is `agent`; everything else is `unknown`. */

export type CallerAttribution =
  | { callerType: "unknown" }
  | {
      callerType: "agent";
      callerName: string;
      skillName?: string;
      skillVersion?: string;
    };

const CALLER_TYPE_ENV = "BAILIAN_CALLER_TYPE";
const CALLER_NAME_ENV = "BAILIAN_CALLER_NAME";
const SKILL_NAME_ENV = "BAILIAN_SKILL_NAME";
const SKILL_VERSION_ENV = "BAILIAN_SKILL_VERSION";

const NAME_PATTERN = /^[a-z0-9][a-z0-9.-]{0,63}$/;
const SKILL_NAME_PATTERN = /^bailian-[a-z0-9-]{1,64}$/;
const SKILL_VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]{1,20})?$/;

function readTrimmed(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const raw = env[key];
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Normalize host-reported name to a stable id, or `unknown`. */
function normalizeCallerName(raw: string | undefined): string {
  if (!raw) return "unknown";
  const normalized = raw.toLowerCase().replace(/[\s_]+/g, "-");
  return NAME_PATTERN.test(normalized) ? normalized : "unknown";
}

/** Env-only attribution; no TTY or install-path heuristics. */
export function readCaller(env: NodeJS.ProcessEnv): CallerAttribution {
  const callerType = readTrimmed(env, CALLER_TYPE_ENV)?.toLowerCase();
  if (callerType !== "agent" && callerType !== "ai_agent") {
    return { callerType: "unknown" };
  }

  const skillNameRaw = readTrimmed(env, SKILL_NAME_ENV)?.toLowerCase();
  const skillName =
    skillNameRaw !== undefined && SKILL_NAME_PATTERN.test(skillNameRaw) ? skillNameRaw : undefined;
  const skillVersionRaw = readTrimmed(env, SKILL_VERSION_ENV);
  const skillVersion =
    skillName !== undefined &&
    skillVersionRaw !== undefined &&
    SKILL_VERSION_PATTERN.test(skillVersionRaw)
      ? skillVersionRaw
      : undefined;

  return {
    callerType: "agent",
    callerName: normalizeCallerName(readTrimmed(env, CALLER_NAME_ENV)),
    ...(skillName !== undefined ? { skillName } : {}),
    ...(skillVersion !== undefined ? { skillVersion } : {}),
  };
}

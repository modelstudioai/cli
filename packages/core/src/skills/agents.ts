import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { getSkillsDir } from "./lock.ts";

/**
 * Agent fan-out: after a skill lands in the canonical dir (~/.bailian/skills/<name>),
 * symlink it into each detected AI agent's global skills directory so that a single
 * install becomes visible across all agents.
 *
 * Detection semantics: if the agent's config dir exists → agent is installed → create link;
 * otherwise skip (never create ~/.xxx dirs that pollute home). When a new agent is installed
 * later, any subsequent `bl skill add/update` will fill in missing links (self-healing).
 */
export interface AgentTarget {
  id: string;
  displayName: string;
  /** Global directory where this agent reads skills from */
  skillsDir: string;
  /** 任一存在即判定"本机装了该 agent" */
  detectDirs: string[];
}

/**
 * Computed on each call (depends on homedir / XDG_CONFIG_HOME / cwd; easy to override in tests).
 * Registry mirrors the vercel-labs/skills agent list, minus agents that cannot participate in
 * global symlink fan-out (eve: no global dir, upstream forces direct writes; promptscript:
 * project-only). Shared-dir agents (Cline/Warp/Zed/Kimi/… read ~/.agents/skills; Amp/Replit
 * read $XDG_CONFIG_HOME/agents/skills) are folded into the universal pseudo-agents' detectDirs.
 */
export function getAgentTargets(): AgentTarget[] {
  const home = homedir();
  const cwd = process.cwd();
  const xdgConfig = process.env.XDG_CONFIG_HOME || join(home, ".config");
  const simple = (id: string, displayName: string, dir: string): AgentTarget => ({
    id,
    displayName,
    skillsDir: join(home, dir, "skills"),
    detectDirs: [join(home, dir)],
  });
  /** Config base dir that can be relocated via the agent's official env var */
  const envBase = (envValue: string | undefined, fallbackDir: string): string => {
    const trimmed = envValue?.trim();
    return trimmed ? trimmed : join(home, fallbackDir);
  };
  /** Target derived from an absolute base dir (detection and skills dir stay in sync) */
  const fromBase = (id: string, displayName: string, baseDir: string): AgentTarget => ({
    id,
    displayName,
    skillsDir: join(baseDir, "skills"),
    detectDirs: [baseDir],
  });

  // OpenClaw was renamed over time (.openclaw → .clawdbot → .moltbot): link into the first
  // home that actually exists, detect any of them
  const openclawCandidates = [".openclaw", ".clawdbot", ".moltbot"].map((dir) => join(home, dir));
  const openclawHome = openclawCandidates.find((dir) => existsSync(dir)) ?? openclawCandidates[0]!;

  // Zed's config_dir(): XDG on Linux/macOS, %APPDATA% on Windows, Flatpak override
  const zedDetectDirs = [join(xdgConfig, "zed")];
  const zedAppData = process.env.APPDATA?.trim();
  if (zedAppData) zedDetectDirs.push(join(zedAppData, "Zed"));
  const zedFlatpakConfig = process.env.FLATPAK_XDG_CONFIG_HOME?.trim();
  if (zedFlatpakConfig) zedDetectDirs.push(join(zedFlatpakConfig, "zed"));

  const codexHome = envBase(process.env.CODEX_HOME, ".codex");

  return [
    // universal pseudo-agent: ~/.agents/skills is a shared dir read by Cline, Warp, Zed,
    // Kimi Code, Dexto, Firebender, Loaf, …
    {
      id: "universal",
      displayName: "Universal (~/.agents/skills)",
      skillsDir: join(home, ".agents", "skills"),
      detectDirs: [
        join(home, ".agents"),
        join(home, ".cline"),
        join(home, ".dexto"),
        join(home, ".firebender"),
        join(home, ".kimi-code"),
        join(home, ".kimi"),
        join(home, ".loaf"),
        join(home, ".warp"),
        ...zedDetectDirs,
      ],
    },
    // XDG variant: $XDG_CONFIG_HOME/agents/skills, shared dir read by Amp-style agents; Replit
    // also reads it and is detected project-locally via cwd/.replit
    {
      id: "universal-xdg",
      displayName: "Universal (XDG agents/skills)",
      skillsDir: join(xdgConfig, "agents", "skills"),
      detectDirs: [join(xdgConfig, "agents"), join(xdgConfig, "amp"), join(cwd, ".replit")],
    },
    simple("adal", "AdaL", ".adal"),
    simple("aider-desk", "AiderDesk", ".aider-desk"),
    simple("antigravity", "Antigravity", ".gemini/antigravity"),
    simple("antigravity-cli", "Antigravity CLI", ".gemini/antigravity-cli"),
    {
      id: "astrbot",
      displayName: "AstrBot",
      skillsDir: join(home, ".astrbot", "data", "skills"),
      detectDirs: [join(cwd, "data", "skills"), join(home, ".astrbot")],
    },
    fromBase("autohand-code", "Autohand Code CLI", envBase(process.env.AUTOHAND_HOME, ".autohand")),
    simple("augment", "Augment", ".augment"),
    simple("bob", "IBM Bob", ".bob"),
    fromBase("claude-code", "Claude Code", envBase(process.env.CLAUDE_CONFIG_DIR, ".claude")),
    simple("codearts-agent", "CodeArts Agent", ".codeartsdoer"),
    {
      id: "codebuddy",
      displayName: "CodeBuddy",
      skillsDir: join(home, ".codebuddy", "skills"),
      detectDirs: [join(cwd, ".codebuddy"), join(home, ".codebuddy")],
    },
    simple("codemaker", "Codemaker", ".codemaker"),
    simple("codestudio", "Code Studio", ".codestudio"),
    {
      id: "codex",
      displayName: "Codex",
      skillsDir: join(codexHome, "skills"),
      detectDirs: [codexHome, "/etc/codex"],
    },
    simple("command-code", "Command Code", ".commandcode"),
    {
      id: "continue",
      displayName: "Continue",
      skillsDir: join(home, ".continue", "skills"),
      detectDirs: [join(cwd, ".continue"), join(home, ".continue")],
    },
    simple("cortex", "Cortex Code", ".snowflake/cortex"),
    simple("crush", "Crush", ".config/crush"),
    simple("cursor", "Cursor", ".cursor"),
    {
      id: "deepagents",
      displayName: "Deep Agents",
      skillsDir: join(home, ".deepagents", "agent", "skills"),
      detectDirs: [join(home, ".deepagents")],
    },
    {
      id: "devin",
      displayName: "Devin for Terminal",
      skillsDir: join(xdgConfig, "devin", "skills"),
      detectDirs: [join(xdgConfig, "devin")],
    },
    simple("droid", "Droid", ".factory"),
    simple("forgecode", "ForgeCode", ".forge"),
    simple("gemini-cli", "Gemini CLI", ".gemini"),
    simple("github-copilot", "GitHub Copilot", ".copilot"),
    {
      id: "goose",
      displayName: "Goose",
      skillsDir: join(xdgConfig, "goose", "skills"),
      detectDirs: [join(xdgConfig, "goose")],
    },
    fromBase("grok", "Grok Build", envBase(process.env.GROK_HOME, ".grok")),
    fromBase("hermes", "Hermes Agent", envBase(process.env.HERMES_HOME, ".hermes")),
    simple("iflow-cli", "iFlow CLI", ".iflow"),
    simple("inference-sh", "inference.sh", ".inferencesh"),
    {
      id: "jazz",
      displayName: "Jazz",
      skillsDir: join(home, ".jazz", "skills"),
      detectDirs: [join(home, ".jazz"), join(cwd, ".jazz")],
    },
    simple("junie", "Junie", ".junie"),
    simple("kilo", "Kilo Code", ".kilocode"),
    {
      id: "kimchi",
      displayName: "Kimchi",
      skillsDir: join(home, ".config", "kimchi", "harness", "skills"),
      detectDirs: [join(home, ".config", "kimchi")],
    },
    simple("kiro-cli", "Kiro CLI", ".kiro"),
    simple("kode", "Kode", ".kode"),
    simple("lingma", "Lingma", ".lingma"),
    simple("mcpjam", "MCPJam", ".mcpjam"),
    {
      id: "minimax-code",
      displayName: "MiniMax Code",
      skillsDir: join(home, ".minimax", "skills"),
      detectDirs: [join(home, ".minimax"), "/Applications/MiniMax Code.app"],
    },
    fromBase("mistral-vibe", "Mistral Vibe", envBase(process.env.VIBE_HOME, ".vibe")),
    simple("moxby", "Moxby", ".moxby"),
    simple("mux", "Mux", ".mux"),
    simple("neovate", "Neovate", ".neovate"),
    {
      id: "opencode",
      displayName: "OpenCode",
      skillsDir: join(xdgConfig, "opencode", "skills"),
      detectDirs: [join(xdgConfig, "opencode")],
    },
    {
      id: "openclaw",
      displayName: "OpenClaw",
      skillsDir: join(openclawHome, "skills"),
      detectDirs: openclawCandidates,
    },
    simple("openhands", "OpenHands", ".openhands"),
    simple("ona", "Ona", ".ona"),
    simple("pi", "Pi", ".pi/agent"),
    simple("pochi", "Pochi", ".pochi"),
    simple("qoder", "Qoder", ".qoder"),
    simple("qoder-cn", "Qoder CN", ".qoder-cn"),
    simple("qwen-code", "Qwen Code", ".qwen"),
    simple("reasonix", "Reasonix", ".reasonix"),
    simple("rovodev", "Rovo Dev", ".rovodev"),
    simple("roo", "Roo Code", ".roo"),
    {
      id: "tabnine-cli",
      displayName: "Tabnine CLI",
      skillsDir: join(home, ".tabnine", "agent", "skills"),
      detectDirs: [join(home, ".tabnine")],
    },
    simple("terramind", "Terramind", ".terramind"),
    simple("tinycloud", "Tinycloud", ".tinycloud"),
    simple("trae", "Trae", ".trae"),
    simple("trae-cn", "Trae CN", ".trae-cn"),
    simple("windsurf", "Windsurf", ".codeium/windsurf"),
    {
      id: "zcode",
      displayName: "ZCode",
      skillsDir: join(home, ".zcode", "skills"),
      detectDirs: [join(home, ".zcode"), "/Applications/ZCode.app"],
    },
    // Zenflow reads the same ~/.zencoder/skills dir, so one target covers both
    simple("zencoder", "Zencoder", ".zencoder"),
  ];
}

export function detectInstalledAgents(): AgentTarget[] {
  return getAgentTargets().filter((agent) => agent.detectDirs.some((dir) => existsSync(dir)));
}

/** Path equality that respects the host filesystem's case rules (Windows is case-insensitive) */
function samePath(left: string, right: string): boolean {
  if (process.platform === "win32") return left.toLowerCase() === right.toLowerCase();
  return left === right;
}

/** Whether absPath is the canonical skills dir or lives inside it (case-aware on Windows) */
function isUnderCanonicalDir(absPath: string): boolean {
  const skillsDir = getSkillsDir();
  if (process.platform === "win32") {
    const lowerPath = absPath.toLowerCase();
    const lowerDir = skillsDir.toLowerCase();
    return lowerPath === lowerDir || lowerPath.startsWith(lowerDir + sep);
  }
  return absPath === skillsDir || absPath.startsWith(skillsDir + sep);
}

/** Whether linkPath is managed by this tool: a symlink whose resolved target falls within the canonical skills dir */
function isManagedLink(linkPath: string): boolean {
  try {
    if (!lstatSync(linkPath).isSymbolicLink()) return false;
    const target = readlinkSync(linkPath);
    const abs = isAbsolute(target) ? target : resolve(dirname(linkPath), target);
    return isUnderCanonicalDir(abs);
  } catch {
    return false;
  }
}

/**
 * Whether linkPath is a copy-fallback artifact recorded in the lock: a real directory
 * (not a symlink) at a path this tool previously wrote when symlink creation failed
 * (typical: Windows without Developer Mode). Only recorded paths qualify — foreign
 * directories are never touched.
 */
function isRecordedCopy(linkPath: string, recordedLinks: string[]): boolean {
  if (!recordedLinks.some((recorded) => samePath(recorded, linkPath))) return false;
  try {
    return lstatSync(linkPath).isDirectory();
  } catch {
    return false;
  }
}

export interface LinkResult {
  agent: string;
  path: string;
  mode: "symlink" | "copy" | "skipped";
  reason?: string;
}

/** Fixed skip reason for foreign paths; fanOutSkillToAgents keys ledger drops off this value */
const UNMANAGED_SKIP_REASON = "existing file/dir not managed by bl skill";

/**
 * Fan out a skill from canonical to each agent's skills dir.
 * Stale links created by this tool are rebuilt; recorded copy-fallback artifacts
 * (real dirs at paths present in recordedLinks) are replaced with fresh content;
 * any other existing files/dirs are always skipped (never delete user content).
 * Falls back to copy when symlink fails (e.g. Windows without Developer Mode).
 */
export function linkSkillToAgents(
  name: string,
  agents: AgentTarget[] = detectInstalledAgents(),
  recordedLinks: string[] = [],
): LinkResult[] {
  const target = join(getSkillsDir(), name);
  const results: LinkResult[] = [];
  for (const agent of agents) {
    const linkPath = join(agent.skillsDir, name);
    try {
      let existing = false;
      try {
        lstatSync(linkPath); // existsSync returns false for dangling symlinks; must use lstat
        existing = true;
      } catch {
        /* does not exist */
      }
      if (existing) {
        if (isManagedLink(linkPath)) {
          rmSync(linkPath);
        } else if (isRecordedCopy(linkPath, recordedLinks)) {
          // Copy-fallback artifact from a previous install → replace so updates
          // reach agents that have no symlink permission
          rmSync(linkPath, { recursive: true, force: true });
        } else {
          results.push({
            agent: agent.id,
            path: linkPath,
            mode: "skipped",
            reason: UNMANAGED_SKIP_REASON,
          });
          continue;
        }
      }
      mkdirSync(agent.skillsDir, { recursive: true });
      try {
        symlinkSync(target, linkPath, process.platform === "win32" ? "junction" : "dir");
        results.push({ agent: agent.id, path: linkPath, mode: "symlink" });
      } catch {
        // No symlink permission (typical: Windows non-Developer Mode) → fall back to copy
        cpSync(target, linkPath, { recursive: true });
        results.push({ agent: agent.id, path: linkPath, mode: "copy" });
      }
    } catch (err) {
      results.push({
        agent: agent.id,
        path: linkPath,
        mode: "skipped",
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}

/**
 * Fan-out workflow: link to agents AND compute the next lock ledger in one step.
 * Shared by bl skill add/update (fresh install and self-healing) and advisor wiki sync,
 * so every channel applies the same ledger-merge rules.
 */
export interface FanoutOutcome {
  results: LinkResult[];
  /** Agent ids that actually received a link/copy this run (skipped ones excluded) */
  linkedAgents: string[];
  /** Next lock links ledger; see merge rules in fanOutSkillToAgents */
  links: string[];
}

/**
 * Fan out and merge the resulting paths with the previously recorded ledger:
 *   - effective paths from this run are recorded;
 *   - recorded paths NOT visited this run are preserved (agent uninstalled/undetected —
 *     the artifact may still exist and must stay reclaimable by bl skill remove);
 *   - recorded paths that failed transiently this run are preserved for the same reason;
 *   - recorded paths confirmed foreign this run (unmanaged skip) are dropped — the user
 *     replaced our artifact, and keeping the record would let remove delete user content.
 */
export function fanOutSkillToAgents(
  name: string,
  agents: AgentTarget[] = detectInstalledAgents(),
  recordedLinks: string[] = [],
): FanoutOutcome {
  const results = linkSkillToAgents(name, agents, recordedLinks);
  const effective = results.filter((result) => result.mode !== "skipped");
  const effectivePaths = effective.map((result) => result.path);
  const confirmedForeign = results
    .filter((result) => result.mode === "skipped" && result.reason === UNMANAGED_SKIP_REASON)
    .map((result) => result.path);
  const preserved = recordedLinks.filter(
    (recorded) =>
      !effectivePaths.some((path) => samePath(path, recorded)) &&
      !confirmedForeign.some((path) => samePath(path, recorded)),
  );
  return {
    results,
    linkedAgents: effective.map((result) => result.agent),
    links: [...effectivePaths, ...preserved],
  };
}

/**
 * Reclaim fan-out artifacts for a skill across all agent dirs.
 * Symlinks pointing to canonical are removed (including historical links not in lock,
 * via defensive scan of the full registry); real directories are only removed if recorded
 * in lock (copy-fallback artifacts). A single failure does not block the rest.
 */
export function unlinkSkillFromAgents(name: string, recordedLinks: string[] = []): string[] {
  const removed: string[] = [];
  const candidates = new Set(recordedLinks);
  for (const agent of getAgentTargets()) candidates.add(join(agent.skillsDir, name));
  for (const linkPath of candidates) {
    try {
      let stat;
      try {
        stat = lstatSync(linkPath);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) {
        if (isManagedLink(linkPath)) {
          rmSync(linkPath);
          removed.push(linkPath);
        }
      } else if (recordedLinks.some((recorded) => samePath(recorded, linkPath))) {
        rmSync(linkPath, { recursive: true, force: true });
        removed.push(linkPath);
      }
    } catch {
      /* single failure does not block remaining cleanup */
    }
  }
  return removed;
}

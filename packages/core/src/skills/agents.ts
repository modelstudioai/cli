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

/** Computed on each call (depends on homedir / XDG_CONFIG_HOME; easy to override in tests) */
export function getAgentTargets(): AgentTarget[] {
  const home = homedir();
  const xdgConfig = process.env.XDG_CONFIG_HOME || join(home, ".config");
  const simple = (id: string, displayName: string, dir: string): AgentTarget => ({
    id,
    displayName,
    skillsDir: join(home, dir, "skills"),
    detectDirs: [join(home, dir)],
  });
  return [
    // universal pseudo-agent: ~/.agents/skills is a shared dir read by multiple agents (Cline, etc.)
    {
      id: "universal",
      displayName: "Universal (~/.agents/skills)",
      skillsDir: join(home, ".agents", "skills"),
      detectDirs: [join(home, ".agents"), join(home, ".cline")],
    },
    simple("claude-code", "Claude Code", ".claude"),
    simple("openclaw", "OpenClaw", ".openclaw"),
    simple("hermes", "Hermes Agent", ".hermes"),
    {
      id: "opencode",
      displayName: "OpenCode",
      skillsDir: join(xdgConfig, "opencode", "skills"),
      detectDirs: [join(xdgConfig, "opencode")],
    },
    simple("cursor", "Cursor", ".cursor"),
    simple("codex", "Codex", ".codex"),
    simple("qwen-code", "Qwen Code", ".qwen"),
    simple("qoder", "Qoder", ".qoder"),
    simple("qoder-cn", "Qoder CN", ".qoder-cn"),
    simple("kilo", "Kilo Code", ".kilocode"),
  ];
}

export function detectInstalledAgents(): AgentTarget[] {
  return getAgentTargets().filter((agent) => agent.detectDirs.some((dir) => existsSync(dir)));
}

/** Whether linkPath is managed by this tool: a symlink whose resolved target falls within the canonical skills dir */
function isManagedLink(linkPath: string): boolean {
  try {
    if (!lstatSync(linkPath).isSymbolicLink()) return false;
    const target = readlinkSync(linkPath);
    const abs = isAbsolute(target) ? target : resolve(dirname(linkPath), target);
    return abs === getSkillsDir() || abs.startsWith(getSkillsDir() + sep);
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

/**
 * Fan out a skill from canonical to each agent's skills dir.
 * Stale links created by this tool are rebuilt; existing files/dirs NOT managed by this tool
 * are always skipped (never delete user content). Falls back to copy when symlink fails
 * (e.g. Windows without Developer Mode).
 */
export function linkSkillToAgents(
  name: string,
  agents: AgentTarget[] = detectInstalledAgents(),
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
        if (!isManagedLink(linkPath)) {
          results.push({
            agent: agent.id,
            path: linkPath,
            mode: "skipped",
            reason: "existing file/dir not managed by bl skill",
          });
          continue;
        }
        rmSync(linkPath);
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
      } else if (recordedLinks.includes(linkPath)) {
        rmSync(linkPath, { recursive: true, force: true });
        removed.push(linkPath);
      }
    } catch {
      /* single failure does not block remaining cleanup */
    }
  }
  return removed;
}

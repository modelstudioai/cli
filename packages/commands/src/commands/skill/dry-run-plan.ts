import { existsSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { getSkillsDir, type AgentTarget } from "bailian-cli-core";

/** dry-run 用的 agent 摘要（含目标目录） */
export function summarizeAgents(agents: AgentTarget[]): Array<{ id: string; skillsDir: string }> {
  return agents.map((agent) => ({
    id: agent.id,
    skillsDir: agent.skillsDir,
  }));
}

export type PathKind = "absent" | "symlink" | "directory" | "file";

/** 预计 fan-out 路径及当前存在性（只读 lstat，不预测 replace/skip） */
export interface PlannedLink {
  agent: string;
  path: string;
  exists: boolean;
  kind: PathKind;
  hasSkillMd: boolean;
}

function inspectPath(path: string): Pick<PlannedLink, "exists" | "kind" | "hasSkillMd"> {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      return { exists: true, kind: "symlink", hasSkillMd: false };
    }
    if (stat.isDirectory()) {
      return {
        exists: true,
        kind: "directory",
        hasSkillMd: existsSync(join(path, "SKILL.md")),
      };
    }
    return { exists: true, kind: "file", hasSkillMd: false };
  } catch {
    return { exists: false, kind: "absent", hasSkillMd: false };
  }
}

/** 按 agent skillsDir 拼出预计链接路径，并标注是否已存在 */
export function planFanoutLinks(skillName: string, agents: AgentTarget[]): PlannedLink[] {
  return agents.map((agent) => {
    const path = join(agent.skillsDir, skillName);
    return { agent: agent.id, path, ...inspectPath(path) };
  });
}

/** Canonical skill 目录路径 */
export function canonicalSkillPath(skillName: string): string {
  return join(getSkillsDir(), skillName);
}

import { existsSync, lstatSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  BailianError,
  computeDirContentHash,
  detectInstalledAgents,
  getSkillsDir,
  installationRoots,
  isSafeSkillName,
  parseSkillNames,
  readSkillLock,
  type SkillLockEntry,
  type SkillLockFile,
  type FlagsDef,
  type LocalizedText,
} from "bailian-cli-core";

export const sourceFlag = {
  type: "string",
  choices: ["oss", "cloud"],
  valueHint: "<oss|cloud>",
  description: {
    "en-US": "Skill source (default cloud). Use oss for the public registry.",
    "zh-CN": "Skill 来源默认为云端 OpenAPI；使用 oss 选择公开 Registry。",
  },
} as const;
export const targetFlags = {
  agent: {
    type: "string",
    valueHint: "<agent|all>",
    description: {
      "en-US": "Target agent ID, or all detected agents",
      "zh-CN": "目标 Agent ID，all 表示全部已检测 Agent",
    },
  },
  scope: {
    type: "string",
    choices: ["user", "project"],
    valueHint: "<user|project>",
    description: { "en-US": "Installation scope (default user)", "zh-CN": "安装范围（默认 user）" },
  },
} as const satisfies FlagsDef;

export interface Selection {
  workspaceId?: string;
  agent?: string;
  scope?: "user" | "project";
  source?: "oss" | "cloud";
  name?: string;
  all?: boolean;
  skillVersion?: string;
  withMcp?: boolean;
  diff?: boolean;
}
export function skillSource(flags: Selection) {
  return flags.source ?? "cloud";
}
export function needsCloud(flags: Selection) {
  return skillSource(flags) === "cloud";
}
// A missing directory can still belong to another source and be restored by its next update.
export function otherSourcePaths(source: "cloud" | "oss", lock: SkillLockFile) {
  const paths = new Set<string>();
  for (const [key, entry] of Object.entries(lock.skills)) {
    if ((entry.sourceType === "openapi" ? "cloud" : "oss") === source) continue;
    paths.add(resolve(entry.installedPath ?? join(getSkillsDir(), entry.canonicalName ?? key)));
    for (const link of entry.links ?? []) paths.add(resolve(link));
  }
  return paths;
}
export function validateSelection(flags: Selection, required = false): LocalizedText | undefined {
  if (
    (flags.all && flags.name !== undefined) ||
    (required && !flags.all && flags.name === undefined)
  )
    return {
      "en-US": "Specify either --all or --name <code,...>.",
      "zh-CN": "请在 --all 与 --name <code,...> 中选择一个。",
    };
  if (flags.name !== undefined) {
    const names = flags.name.split(",").map((name) => name.trim());
    if (
      names.some((name) => !validName(name)) ||
      new Set(names).size > 30 ||
      (names.includes("all") && names.length > 1)
    )
      return {
        "en-US": "Provide 1–30 distinct skill names, or all by itself.",
        "zh-CN": "请提供 1～30 个不同的有效 Skill 名称，或单独使用 all。",
      };
  }
  if (flags.skillVersion !== undefined && !validName(flags.skillVersion))
    return { "en-US": "Invalid --skill-version.", "zh-CN": "--skill-version 无效。" };
  if (
    flags.agent !== undefined &&
    flags.agent !== "all" &&
    ![...installationRoots().values()].some(
      (root) => root.agent === flags.agent && root.scope === (flags.scope ?? "user"),
    )
  )
    return {
      "en-US": "Unknown agent or unsupported --scope for this agent.",
      "zh-CN": "未知 Agent，或该 Agent 不支持指定的 --scope。",
    };
}
export function validName(name: string) {
  return (
    isSafeSkillName(name) &&
    !name.includes("\0") &&
    !["skill-lock.json", "skill-lock.json.lock", "__proto__", "constructor", "prototype"].includes(
      name,
    )
  );
}
export function selectedNames(flags: Selection) {
  return flags.all || flags.name === undefined ? "all" : parseSkillNames(flags.name, false);
}
export function selectedEntries(flags: Selection, lock = readSkillLock()) {
  const names = selectedNames(flags);
  return Object.entries(lock.skills).filter(([key, entry]) => {
    if ((entry.scope ?? "user") !== (flags.scope ?? "user")) return false;
    if (entry.scope === "project" && entry.projectRoot !== process.cwd()) return false;
    if ((entry.sourceType === "openapi" ? "cloud" : "oss") !== skillSource(flags)) return false;
    if (flags.agent && flags.agent !== "all" && entry.installedPath && entry.agent !== flags.agent)
      return false;
    return (
      names === "all" ||
      names.includes(entry.canonicalName ?? key) ||
      (!!entry.remoteId && names.includes(entry.remoteId))
    );
  });
}
export type Target = { root: string; agent: string | null; scope: "user" | "project" };
export function installTargets(flags: Selection): Target[] {
  const scope = flags.scope ?? "user";
  const agents = new Set(detectInstalledAgents().map((target) => target.id));
  const targets: Target[] = [];
  for (const [root, target] of installationRoots()) {
    if (!target.agent || target.scope !== scope) continue;
    const selected =
      flags.agent && flags.agent !== "all"
        ? target.agent === flags.agent
        : agents.has(target.agent) || (scope === "project" && existsSync(dirname(root)));
    if (selected) targets.push({ root, ...target });
  }
  if (targets.length === 0 && (!flags.agent || flags.agent === "all")) {
    const root =
      scope === "user" ? resolve(getSkillsDir()) : join(process.cwd(), ".agents", "skills");
    targets.push({ root, agent: scope === "user" ? null : "universal", scope });
  }
  return targets;
}
export function targetForEntry(key: string, entry: SkillLockEntry): Target {
  const name = entry.canonicalName ?? key;
  const path = entry.installedPath ?? join(getSkillsDir(), name);
  const root = dirname(resolve(path));
  const target = installationRoots().get(root);
  if (
    !validName(name) ||
    !target ||
    resolve(path) !== join(root, name) ||
    target.agent !== (entry.agent ?? null) ||
    target.scope !== (entry.scope ?? "user")
  )
    throw new BailianError(
      "Installation path does not match its agent and scope. / 安装路径与 Agent、范围不符。",
    );
  return { root, ...target };
}
export function present(path: string) {
  return !!lstatSync(path, { throwIfNoEntry: false });
}
export function checkContent(path: string, entry?: SkillLockEntry) {
  if (!present(path)) return;
  if (!entry) throw new BailianError(`UNTRACKED_CONFLICT: ${path}`);
  if (!lstatSync(path).isDirectory()) throw new BailianError(`MODIFIED_CONFLICT: ${path}`);
  if (entry.contentHash && /^sha256:[0-9a-f]{64}$/.test(entry.contentHash)) {
    function checkTree(directory: string) {
      for (const item of readdirSync(directory, { withFileTypes: true })) {
        if (item.isDirectory()) checkTree(join(directory, item.name));
        else if (!item.isFile()) throw new BailianError(`MODIFIED_CONFLICT: ${path}`);
      }
    }
    checkTree(path);
    if (computeDirContentHash(path) !== entry.contentHash)
      throw new BailianError(`MODIFIED_CONFLICT: ${path}`);
  }
}
export function checkProjectRoot(target: Target) {
  if (target.scope !== "project") return;
  let path = target.root;
  while (!present(path)) path = dirname(path);
  if (realpathSync(path) !== resolve(path))
    throw new BailianError(`Project skill root is redirected / 项目 Skill 目录已被重定向：${path}`);
}

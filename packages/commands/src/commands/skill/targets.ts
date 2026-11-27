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
    "en-US": "Skill catalog. Use oss for the public registry or cloud for the workspace OpenAPI.",
    "zh-CN": "Skill 目录。oss 表示公开 Registry，cloud 表示工作空间 OpenAPI。",
  },
} as const;
export const selectorFlags = {
  name: {
    type: "string",
    valueHint: "<name,...>",
    description: {
      "en-US": "Public OSS registry skill names, separated by commas",
      "zh-CN": "公开 OSS Registry 的 Skill 名称，多个名称用逗号分隔",
    },
  },
  code: {
    type: "string",
    valueHint: "<code,...>",
    description: {
      "en-US": "Cloud OpenAPI skill codes returned by skill search, separated by commas",
      "zh-CN": "skill search 返回的云端 OpenAPI Skill 编码，多个编码用逗号分隔",
    },
  },
} as const satisfies FlagsDef;
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
  code?: string;
  all?: boolean;
  skillVersion?: string;
  withMcp?: boolean;
  diff?: boolean;
}
export function skillSource(flags: Selection) {
  if (flags.all || flags.name !== undefined) return "oss";
  if (flags.code !== undefined) return "cloud";
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
export function validateSelection(
  flags: Selection,
  action?: "add" | "remove",
): LocalizedText | undefined {
  const hasName = flags.name !== undefined;
  const hasCode = flags.code !== undefined;
  if (
    (hasName && hasCode) ||
    (flags.all && (hasName || hasCode)) ||
    (action && !flags.all && !hasName && !hasCode)
  ) {
    if (action === "add" || flags.all)
      return {
        "en-US": "Specify exactly one of --name, --code or --all.",
        "zh-CN": "请在 --name、--code、--all 中选择一个。",
      };
    return {
      "en-US": "Specify either --name or --code.",
      "zh-CN": "请在 --name 与 --code 中选择一个。",
    };
  }
  if (flags.source && flags.source !== skillSource(flags))
    return {
      "en-US":
        "--name and --all use OSS. --code uses the cloud OpenAPI. Set --source accordingly or omit it.",
      "zh-CN":
        "--name 和 --all 使用 OSS，--code 使用云端 OpenAPI。请省略 --source 或选择对应来源。",
    };
  const selector = flags.name ?? flags.code;
  if (selector !== undefined) {
    const names = selector.split(",").map((name) => name.trim());
    if (
      names.some((name) => !validName(name)) ||
      new Set(names).size > 30 ||
      (hasName && names.includes("all") && names.length > 1)
    )
      return {
        "en-US":
          "Provide 1–30 valid skill names or codes. Use --name all by itself for all registry skills.",
        "zh-CN":
          "请提供 1～30 个有效的 Skill 名称或编码。选择所有 OSS Skill 可单独使用 --name all。",
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
  if (flags.code !== undefined)
    return [...new Set(flags.code.split(",").map((code) => code.trim()))];
  return flags.name === undefined ? "all" : parseSkillNames(flags.name, false);
}
export function entrySelector(key: string, entry: SkillLockEntry) {
  const name = entry.canonicalName ?? key;
  return entry.sourceType === "openapi" ? (entry.remoteId ?? name) : name;
}
export function selectedEntries(flags: Selection, lock = readSkillLock()) {
  const names = selectedNames(flags);
  return Object.entries(lock.skills).filter(([key, entry]) => {
    if ((entry.scope ?? "user") !== (flags.scope ?? "user")) return false;
    if (entry.scope === "project" && entry.projectRoot !== process.cwd()) return false;
    if ((entry.sourceType === "openapi" ? "cloud" : "oss") !== skillSource(flags)) return false;
    if (flags.agent && flags.agent !== "all" && entry.installedPath && entry.agent !== flags.agent)
      return false;
    return names === "all" || names.includes(entrySelector(key, entry));
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

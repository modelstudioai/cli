import { WORKSPACE_FLAG } from "../shared/workspace.ts";
import { defineSkillCommand, observeRegistry } from "./update-check.ts";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  fetchSkillsIndex,
  getSkillRegistryBaseUrl,
  installationRoots,
  readCatalogInstalls,
  readSkillLock,
  type SkillStatus,
  type SkillStatusRow,
} from "bailian-cli-core";
import { cloudCatalog } from "./packages.ts";
import {
  needsCloud,
  selectedEntries,
  selectedNames,
  selectorFlags,
  skillSource,
  sourceFlag,
  targetFlags,
  validateSelection,
  validName,
} from "./targets.ts";
import { formatTable } from "bailian-cli-runtime";

const statuses: SkillStatus[] = ["installed", "outdated", "not-installed", "missing", "untracked"];
export default defineSkillCommand({
  description: {
    "en-US": "List registry skills and local installations by agent, scope and status",
    "zh-CN": "按 Agent、范围及状态查看 Skill 目录和本地安装",
  },
  auth: "apiKey",
  requiresApiKey: needsCloud,
  defaultOutput: "json",
  usageArgs:
    "[--name <name,...> | --code <code,...> | --source oss|cloud] [--agent <agent|all>] [--scope user|project] [--status <s,...>]",
  flags: {
    ...WORKSPACE_FLAG,
    source: sourceFlag,
    ...selectorFlags,
    ...targetFlags,
    status: {
      type: "string",
      valueHint: "<s,...>",
      description: {
        "en-US": "Comma-separated installation states",
        "zh-CN": "安装状态，以逗号分隔",
      },
    },
  },
  exampleArgs: [
    "",
    "--source oss --status not-installed",
    "--name spark-video",
    "--code skill_example",
    "--agent cursor --scope project --status installed,outdated",
  ],
  notes: [
    {
      "en-US":
        "States: installed, outdated, not-installed, missing (tracked path absent), untracked (local files without a lock record).",
      "zh-CN":
        "支持 installed、outdated、not-installed、missing（已记录但路径缺失）、untracked（本地文件无安装记录）。",
    },
  ],
  validate(flags) {
    if (
      flags.status !== undefined &&
      flags.status.split(",").some((value) => !statuses.some((status) => status === value.trim()))
    )
      return {
        "en-US": "Unknown --status. Use installed, outdated, not-installed, missing or untracked.",
        "zh-CN": "--status 须为 installed、outdated、not-installed、missing 或 untracked。",
      };
    return validateSelection(flags);
  },
  async run(ctx) {
    const flags = ctx.flags;
    const source = skillSource(flags);
    const selected = selectedNames(flags);
    const scope = flags.scope ?? "user";
    const lock = readSkillLock();
    const records = selectedEntries(flags, lock);
    const wanted = new Set(flags.status?.split(",").map((status) => status.trim()));
    const roots = [...installationRoots()].filter(
      ([, target]) =>
        target.scope === scope &&
        (!flags.agent || flags.agent === "all" || target.agent === flags.agent),
    );
    const skills: Array<
      SkillStatusRow & {
        skill_code: string;
        source: string;
        install_state: SkillStatus;
        agent: string | null;
        scope: string;
        installed_path: string | null;
        latest_version: string | null;
      }
    > = [];
    let updatedAt: string | undefined;
    const type = source === "cloud" ? "openapi" : "oss";
    const local = readCatalogInstalls(ctx.client.baseUrl, type, lock);
    type Item = {
      name: string;
      code?: string;
      version?: string | null;
      hash?: string;
      description?: string;
      publishedAt?: string;
    };
    const items = new Map<string, Item>();
    for (const [key, entry] of records) {
      if (type === "openapi" && entry.sourceLocation && entry.sourceLocation !== ctx.client.baseUrl)
        continue;
      const name = entry.canonicalName ?? key;
      items.set(source === "oss" ? name : (entry.remoteId ?? name), {
        name,
        code: entry.remoteId,
        description: entry.description,
        publishedAt: entry.publishedAt,
      });
    }
    if (source === "oss") {
      const index = observeRegistry(ctx, await fetchSkillsIndex());
      updatedAt = index.updatedAt;
      for (const [name, entry] of Object.entries(index.skills)) {
        items.set(name, {
          name,
          code: entry.remoteId,
          version: entry.version,
          hash: entry.contentHash,
          description: entry.description,
          publishedAt: entry.publishedAt,
        });
      }
    } else {
      for (const [id, remote] of await cloudCatalog(ctx)) {
        items.set(id, {
          name: items.get(id)?.name ?? id,
          version: remote.latest_version,
          description: remote.display_description,
        });
      }
    }
    const names = new Set([...items.values()].map((item) => item.name));
    for (const [root] of roots) {
      if (!existsSync(root)) continue;
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (
          !(entry.isDirectory() || entry.isSymbolicLink()) ||
          !validName(entry.name) ||
          names.has(entry.name)
        )
          continue;
        const path = join(root, entry.name);
        if (!local.claimedPaths.has(path) && existsSync(join(path, "SKILL.md")))
          items.set(entry.name, { name: entry.name });
      }
    }
    for (const [key, item] of items) {
      if (selected !== "all" && !selected.includes(key)) continue;
      const id = item.code ?? key;
      const version = item.version ?? null;
      const locations = local
        .inspect(id, version, item.name, item.hash)
        .installations.filter(
          (row) =>
            row.scope === scope &&
            (!flags.agent || flags.agent === "all" || row.agent === flags.agent),
        );
      const rows = locations.length
        ? locations
        : [
            {
              agent: flags.agent && flags.agent !== "all" ? flags.agent : null,
              scope,
              installed_path: null,
              locked_version: null,
              install_state: "not-installed" as const,
            },
          ];
      for (const row of rows) {
        const status = row.install_state;
        if (!wanted.size || wanted.has(status))
          skills.push({
            name: item.name,
            skill_code: id,
            source,
            description: item.description,
            publishedAt: item.publishedAt,
            latest_version: version,
            ...row,
            install_state: status,
            status,
          });
      }
    }
    skills.sort((left, right) => left.name.localeCompare(right.name));
    ctx.output.result(
      {
        registry: source === "oss" ? getSkillRegistryBaseUrl() : ctx.client.baseUrl,
        ...(updatedAt && { updatedAt }),
        skills,
      },
      {
        text: formatTable(
          ["NAME", "STATUS", "AGENT", "SCOPE", "VERSION", "PATH"],
          skills.map((row) => [
            row.name,
            row.status,
            row.agent ?? "-",
            row.scope,
            row.latest_version ?? "-",
            row.installed_path ?? "-",
          ]),
        ).join("\n"),
      },
    );
  },
});

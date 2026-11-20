import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  BailianError,
  ExitCode,
  defineCommand,
  fetchSkillsIndex,
  formatCommand,
  getConfigDir,
  getSkillRegistryBaseUrl,
  readSkillLock,
  runWithConcurrency,
  skillBaseUrl,
  skillsPath,
  type Command,
  type CommandContext,
  type FlagsDef,
  type SkillsIndex,
} from "bailian-cli-core";
import { readJson, writeJsonAtomic } from "../config/agent/writers/utils.ts";
import type { CatalogSkill } from "./catalog.ts";
import { skillSource, validName, type Selection } from "./targets.ts";

type Context = Pick<CommandContext, "client" | "output" | "identity">;
type Source = "cloud" | "oss";
const maxAge = 24 * 60 * 60 * 1000;
const timeoutMs = 2000;

// Reuse catalog reads from the same invocation, including add's preparation stage.
const cloudReads = new WeakMap<Context["client"], Map<string, string | null>>();
const ossReads = new WeakMap<Context["client"], SkillsIndex>();

function activeVersion(skill: CatalogSkill) {
  return skill.status === "active" && typeof skill.latest_version === "string"
    ? skill.latest_version
    : null;
}
export function observeCloudSkill(ctx: Pick<Context, "client">, skill: CatalogSkill) {
  let latest = cloudReads.get(ctx.client);
  if (!latest) {
    latest = new Map();
    cloudReads.set(ctx.client, latest);
  }
  latest.set(skill.id, activeVersion(skill));
}
export function observeRegistry(ctx: Pick<Context, "client">, index: SkillsIndex) {
  ossReads.set(ctx.client, index);
  return index;
}

async function checkInstalled(ctx: Context, source: Source, offline: boolean) {
  const location = source === "oss" ? getSkillRegistryBaseUrl() : ctx.client.baseUrl;
  const installs = Object.entries(readSkillLock().skills).flatMap(([key, entry]) => {
    const id = source === "oss" ? (entry.canonicalName ?? key) : entry.remoteId;
    const current = source === "oss" ? entry.contentHash : entry.installedVersion;
    if (
      !id ||
      !validName(id) ||
      !current ||
      entry.pinnedVersion ||
      (entry.sourceType === "openapi" ? "cloud" : "oss") !== source ||
      (entry.sourceLocation && entry.sourceLocation !== location) ||
      (entry.scope === "project" && entry.projectRoot !== process.cwd())
    )
      return [];
    return [{ id, current, scope: entry.scope ?? "user", agent: entry.agent }];
  });
  if (!installs.length) return;
  const latest = new Map<string, string | null>();
  let index: Promise<SkillsIndex> | undefined;
  const signal = AbortSignal.timeout(timeoutMs);
  const ids = [...new Set(installs.map((entry) => entry.id))];
  const observed = source === "oss" ? ossReads.get(ctx.client) : undefined;
  const versions = source === "cloud" ? cloudReads.get(ctx.client) : undefined;
  await runWithConcurrency(
    ids.map((id) => async () => {
      const digest = createHash("sha256")
        .update(JSON.stringify([source, location, id]))
        .digest("hex");
      const path = join(getConfigDir(), "skill-update-cache", digest + ".json");
      const cached = readJson(path);
      const fresh =
        typeof cached?.checkedAt === "number" &&
        Date.now() - cached.checkedAt >= 0 &&
        Date.now() - cached.checkedAt < maxAge;
      let revision = observed ? (observed.skills[id]?.contentHash ?? null) : versions?.get(id);
      if (
        revision === undefined &&
        fresh &&
        (typeof cached.revision === "string" || cached.revision === null)
      ) {
        latest.set(id, cached.revision);
        return;
      }
      try {
        if (revision === undefined) {
          if (offline || signal.aborted) return;
          if (source === "oss") {
            index ??= fetchSkillsIndex(timeoutMs, 1);
            revision = (await index).skills[id]?.contentHash ?? null;
          } else {
            const reply = await ctx.client.requestJson<{ success: boolean; data?: CatalogSkill }>({
              method: "GET",
              path: skillsPath(id),
              signal,
            });
            if (!reply?.success || reply.data?.id !== id) return;
            revision = activeVersion(reply.data);
          }
        }
        latest.set(id, revision);
        if (!fresh || cached.revision !== revision)
          writeJsonAtomic(path, { checkedAt: Date.now(), revision });
      } catch {
        // A secondary lookup or a read-only cache directory cannot fail the command.
      }
    }),
    3,
  );
  for (const scope of ["user", "project"] as const) {
    const outdated = installs.filter((entry) => {
      const revision = latest.get(entry.id);
      return (
        entry.scope === scope &&
        revision &&
        (source === "oss"
          ? revision !== entry.current
          : revision.localeCompare(entry.current, "en", { numeric: true }) > 0)
      );
    });
    if (!outdated.length) continue;
    const names = [...new Set(outdated.map((entry) => entry.id))].join(", ");
    const command = formatCommand(
      ctx.identity,
      `skill update --source ${source}${scope === "project" ? " --scope project" : ""}`,
    );
    ctx.output.warning({
      code: "SKILL_UPDATE_AVAILABLE",
      message: {
        "en-US": `Updates available for ${names}. Run ${command}.`,
        "zh-CN": `${names} 有更新，可运行 ${command}。`,
      },
      details: {
        source,
        scope,
        update_command: command,
        skills: outdated.map(({ id, current, agent }) => ({
          skill_code: id,
          agent,
          current,
          latest: latest.get(id),
        })),
      },
    });
  }
}

export function defineSkillCommand<F extends FlagsDef, Prepared = undefined>({
  updateCheck,
  localDryRun,
  ...command
}: Command<F, Prepared> & { updateCheck?: "oss" | "offline"; localDryRun?: boolean }): Command<
  F,
  Prepared
> {
  return defineCommand({
    ...command,
    defaultApiBaseUrl({ flags, settings, localize }) {
      const selection: Selection = flags as Selection;
      if (updateCheck || (localDryRun && settings.dryRun)) return;
      // Public packages only use the cloud when add checks their MCP dependencies.
      if (skillSource(selection) === "oss" && (!command.prepare || selection.withMcp === false))
        return;
      const id = selection.workspaceId ?? settings.workspaceId;
      if (id) return skillBaseUrl(id);
      if (skillSource(selection) === "oss") return;
      throw new BailianError(
        localize({
          "en-US":
            "Set workspace_id or BAILIAN_WORKSPACE_ID, pass --workspace-id, or provide --base-url to access the cloud Skill API.",
          "zh-CN":
            "访问云端 Skill API 需要配置 workspace_id、设置 BAILIAN_WORKSPACE_ID，或传入 --workspace-id、--base-url。",
        }),
        ExitCode.USAGE,
      );
    },
    async run(ctx) {
      try {
        await command.run(ctx);
        if (ctx.settings.dryRun) return;
        const source = updateCheck === "oss" ? "oss" : skillSource(ctx.flags as Selection);
        try {
          const offline = updateCheck === "offline";
          const workspaceId = ctx.settings.workspaceId;
          const client =
            offline && source === "cloud" && workspaceId
              ? ctx.client.withDefaultBaseUrl(() => skillBaseUrl(workspaceId))
              : ctx.client;
          await checkInstalled({ ...ctx, client }, source, offline);
        } catch {
          ctx.output.debug({
            "en-US": "Skill update check unavailable.",
            "zh-CN": "暂时无法检查 Skill 更新。",
          });
        }
      } finally {
        cloudReads.delete(ctx.client);
        ossReads.delete(ctx.client);
      }
    },
  });
}

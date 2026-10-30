import {
  BailianError,
  ExitCode,
  defineCommand,
  detectInstalledAgents,
  fanOutSkillToAgents,
  fetchSkillsIndex,
  getSkillRegistryBaseUrl,
  getCommandPrefix,
  installSkillWithFanout,
  listSkillDirsOnDisk,
  parseSkillNames,
  readSkillLock,
  runWithConcurrency,
  writeSkillLock,
} from "bailian-cli-core";
import { emitBare, emitResult, formatTable } from "bailian-cli-runtime";
import { planFanoutLinks, summarizeAgents } from "./dry-run-plan.ts";

interface UpdateOutcome {
  name: string;
  status: "updated" | "up-to-date" | "skipped" | "failed";
  publishedAt?: string;
  reason?: string;
}

interface UpdatePlanItem {
  name: string;
  status: "update" | "up-to-date" | "skipped" | "failed";
  publishedAt?: string;
  reason?: string;
  links?: ReturnType<typeof planFanoutLinks>;
}

/** Max number of skills downloading/installing at the same time. */
const UPDATE_CONCURRENCY = 3;

export default defineCommand({
  description: {
    "en-US": "Update installed skills to the latest registry versions",
    "zh-CN": "将已安装的 Skill 更新到 Registry 最新版本",
  },
  auth: "none",
  usageArgs: "[--all] [--name <name,...>]",
  flags: {
    all: {
      type: "switch",
      description: {
        "en-US": "Update all installed skills (default when neither --all nor --name is given)",
        "zh-CN": "更新全部已安装 Skill（未指定 --all 或 --name 时的默认行为）",
      },
    },
    name: {
      type: "string",
      valueHint: "<name,...>",
      description: {
        "en-US": "Comma-separated skill names to update (must be already installed)",
        "zh-CN": "要更新的 Skill 名称，以逗号分隔（必须已安装）",
      },
    },
  },
  validate(flags) {
    if (flags.all && flags.name) return "Use either --all or --name, not both";
    return undefined;
  },
  exampleArgs: ["", "--all", "--name spark-video"],
  async run(ctx) {
    const format = ctx.settings.outputExplicit ? ctx.settings.output : "json";
    const updateAll = ctx.flags.all || !ctx.flags.name;
    const requested = updateAll ? "all" : parseSkillNames(ctx.flags.name, false);
    const index = await fetchSkillsIndex();
    const lock = readSkillLock();
    const disk = new Set(listSkillDirsOnDisk());
    const agents = detectInstalledAgents();

    const results: UpdateOutcome[] = [];
    const targets: string[] = [];

    if (requested === "all") {
      // Default: only process skills already installed in lock; reinstall only if version changed or local dir is missing
      for (const [name, locked] of Object.entries(lock.skills)) {
        const entry = index.skills[name];
        if (!entry) {
          results.push({
            name,
            status: "skipped",
            reason: "delisted from remote; local copy retained",
          });
          continue;
        }
        if (entry.contentHash === locked.contentHash && disk.has(name)) {
          if (ctx.settings.dryRun) {
            // 真实路径仍会 fan-out 自愈；dry-run 只展示目标路径与存在性，不写盘
            results.push({ name, status: "up-to-date", publishedAt: locked.publishedAt });
            continue;
          }
          // Self-healing: content unchanged, but still fill fan-out links for agents
          // detected since the last install (and refresh recorded copies); the merged
          // ledger keeps paths of unvisited agents reclaimable by bl skill remove
          const fanout = fanOutSkillToAgents(name, agents, locked.links ?? []);
          lock.skills[name] = { ...locked, links: fanout.links };
          results.push({ name, status: "up-to-date", publishedAt: locked.publishedAt });
          continue;
        }
        targets.push(name);
      }
    } else {
      // Explicit names: only update skills that are already installed; reject uninstalled ones
      for (const name of requested) {
        if (!lock.skills[name]) {
          results.push({
            name,
            status: "failed",
            reason: `Not installed; run ${getCommandPrefix(ctx.identity)} skill add --name ${name} first. / 尚未安装，请先运行 ${getCommandPrefix(ctx.identity)} skill add --name ${name}。`,
          });
          continue;
        }
        targets.push(name);
      }
    }

    if (ctx.settings.dryRun) {
      const plan: UpdatePlanItem[] = results.map((result) => {
        if (result.status === "up-to-date") {
          return {
            name: result.name,
            status: "up-to-date" as const,
            publishedAt: result.publishedAt,
            links: planFanoutLinks(result.name, agents),
          };
        }
        if (result.status === "skipped") {
          return {
            name: result.name,
            status: "skipped" as const,
            publishedAt: result.publishedAt,
            reason: result.reason,
          };
        }
        return {
          name: result.name,
          status: "failed" as const,
          publishedAt: result.publishedAt,
          reason: result.reason,
        };
      });

      for (const name of targets) {
        const entry = index.skills[name];
        if (!entry) {
          plan.push({ name, status: "failed", reason: "skill not found in registry" });
          continue;
        }
        plan.push({
          name,
          status: "update",
          publishedAt: entry.publishedAt,
          links: planFanoutLinks(name, agents),
        });
      }

      emitResult(
        {
          action: "skill.update",
          registry: getSkillRegistryBaseUrl(),
          agents: summarizeAgents(agents),
          skills: plan,
        },
        format,
      );

      const failed = plan.filter((item) => item.status === "failed");
      if (failed.length > 0) {
        throw new BailianError(
          `${failed.length} skill(s) failed to update`,
          ExitCode.GENERAL,
          `Check the failed skills in the output; retry network failures with ${getCommandPrefix(ctx.identity)} skill update. / 查看输出中的失败原因，网络失败可运行 ${getCommandPrefix(ctx.identity)} skill update 重试。`,
        );
      }
      return;
    }

    const tasks = targets.map((name) => async (): Promise<UpdateOutcome> => {
      const entry = index.skills[name];
      if (!entry) {
        return { name, status: "failed", reason: "skill not found in registry" };
      }
      try {
        const record = await installSkillWithFanout(
          name,
          entry,
          agents,
          lock.skills[name]?.links ?? [],
        );
        lock.skills[name] = record.lockEntry;
        return { name, status: "updated", publishedAt: entry.publishedAt };
      } catch (err) {
        return {
          name,
          status: "failed",
          reason: err instanceof Error ? err.message : String(err),
        };
      }
    });
    const updateResults = await runWithConcurrency(tasks, UPDATE_CONCURRENCY);
    results.push(...updateResults);
    writeSkillLock(lock);

    if (format === "json") {
      emitResult({ registry: getSkillRegistryBaseUrl(), skills: results }, format);
    } else if (results.length === 0) {
      const commandPrefix = getCommandPrefix(ctx.identity);
      emitBare(
        ctx.localize({
          "zh-CN": `本地尚未安装 Skill，请先运行 ${commandPrefix} skill add。`,
          "en-US": `No skills installed locally; run ${commandPrefix} skill add first.`,
        }),
      );
    } else {
      const rows = results.map((result) => [
        result.name,
        result.status,
        result.publishedAt ? result.publishedAt.slice(0, 10) : "-",
      ]);
      for (const line of formatTable(["NAME", "STATUS", "PUBLISHED"], rows)) {
        emitBare(line);
      }

      // Footnotes for skipped / failed entries
      const annotated = results.filter(
        (result) => (result.status === "skipped" || result.status === "failed") && result.reason,
      );
      if (annotated.length > 0) {
        emitBare("");
        for (const result of annotated) {
          emitBare(`  ${result.name}: ${result.reason}`);
        }
      }
    }

    const failed = results.filter((result) => result.status === "failed");
    if (failed.length > 0) {
      throw new BailianError(
        `${failed.length} skill(s) failed to update`,
        ExitCode.GENERAL,
        `Check the failed skills in the output; retry network failures with ${getCommandPrefix(ctx.identity)} skill update. / 查看输出中的失败原因，网络失败可运行 ${getCommandPrefix(ctx.identity)} skill update 重试。`,
      );
    }
  },
});

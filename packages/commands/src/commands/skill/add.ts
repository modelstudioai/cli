import {
  BailianError,
  ExitCode,
  defineCommand,
  detectInstalledAgents,
  fetchSkillsIndex,
  getSkillRegistryBaseUrl,
  installSkillWithFanout,
  parseSkillNames,
  readSkillLock,
  runWithConcurrency,
  writeSkillLock,
} from "bailian-cli-core";
import { emitBare, emitResult, formatTable } from "bailian-cli-runtime";
import { planFanoutLinks, summarizeAgents } from "./dry-run-plan.ts";

interface AddOutcome {
  name: string;
  status: "installed" | "failed";
  publishedAt?: string;
  agents?: string[];
  reason?: string;
}

/** Max number of skills downloading/installing at the same time. */
const INSTALL_CONCURRENCY = 3;

export default defineCommand({
  description: {
    "en-US": "Install skills from the Bailian skill registry into local agents",
    "zh-CN": "将百炼 Skill Registry 中的 Skill 安装到本地 Agent",
  },
  auth: "none",
  usageArgs: "--all | --name <name,...>",
  flags: {
    all: {
      type: "switch",
      description: {
        "en-US": "Install all skills from the registry",
        "zh-CN": "安装 Registry 中的全部 Skill",
      },
    },
    name: {
      type: "string",
      valueHint: "<name,...>",
      description: {
        "en-US": "Comma-separated skill names to install",
        "zh-CN": "要安装的 Skill 名称，以逗号分隔",
      },
    },
  },
  validate(flags) {
    if (flags.all && flags.name) return "Use either --all or --name, not both";
    if (!flags.all && !flags.name)
      return "Specify --all to install everything or --name <name,...> for specific skills";
    return undefined;
  },
  exampleArgs: ["--all", "--name spark-video,bailian-model-recommend"],
  async run(ctx) {
    const format = ctx.settings.outputExplicit ? ctx.settings.output : "json";
    const index = await fetchSkillsIndex();
    const remoteNames = Object.keys(index.skills);
    const parsed = ctx.flags.all ? "all" : parseSkillNames(ctx.flags.name, false);
    const names = parsed === "all" ? remoteNames : parsed;
    const agents = detectInstalledAgents();

    if (ctx.settings.dryRun) {
      const skills = names.map((name) => {
        const entry = index.skills[name];
        if (!entry) {
          return {
            name,
            status: "failed" as const,
            reason: "skill not found in registry",
          };
        }
        return {
          name,
          status: "install" as const,
          publishedAt: entry.publishedAt,
          links: planFanoutLinks(name, agents),
        };
      });

      emitResult(
        {
          action: "skill.add",
          registry: getSkillRegistryBaseUrl(),
          agents: summarizeAgents(agents),
          skills,
        },
        format,
      );

      const failed = skills.filter((skill) => skill.status === "failed");
      if (failed.length > 0) {
        throw new BailianError(
          `${failed.length}/${skills.length} skill(s) failed to install`,
          ExitCode.GENERAL,
          "Check the reason for failed skills in the output; network failures can be retried with bl skill add",
        );
      }
      return;
    }

    const lock = readSkillLock();

    // collect-then-throw: a single skill failure only affects itself; successful ones are written to disk and lock as usual.
    // Skills install concurrently (bounded by INSTALL_CONCURRENCY) — each writes to a disjoint canonical dir, unique tmpDir, and distinct lock key.
    const tasks = names.map((name) => async (): Promise<AddOutcome> => {
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
        return {
          name,
          status: "installed",
          publishedAt: entry.publishedAt,
          agents: record.linkedAgents,
        };
      } catch (err) {
        return {
          name,
          status: "failed",
          reason: err instanceof Error ? err.message : String(err),
        };
      }
    });
    const results = await runWithConcurrency(tasks, INSTALL_CONCURRENCY);
    writeSkillLock(lock);

    if (format === "json") {
      emitResult(
        {
          registry: getSkillRegistryBaseUrl(),
          agents: agents.map((agent) => agent.id),
          skills: results,
        },
        format,
      );
    } else if (results.length === 0) {
      emitBare("Skill registry is empty; no skills to install.");
    } else {
      const rows = results.map((result) => [
        result.name,
        result.status,
        result.publishedAt ? result.publishedAt.slice(0, 10) : "-",
        result.status === "installed" ? result.agents?.join(", ") || "-" : (result.reason ?? "-"),
      ]);
      for (const line of formatTable(["NAME", "STATUS", "PUBLISHED", "AGENTS / REASON"], rows)) {
        emitBare(line);
      }
    }

    const failed = results.filter((result) => result.status === "failed");
    if (failed.length > 0) {
      throw new BailianError(
        `${failed.length}/${results.length} skill(s) failed to install`,
        ExitCode.GENERAL,
        "Check the reason for failed skills in the output; network failures can be retried with bl skill add",
      );
    }
  },
});

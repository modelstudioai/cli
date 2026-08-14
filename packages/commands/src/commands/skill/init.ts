import {
  BailianError,
  ExitCode,
  defineCommand,
  detectInstalledAgents,
  fetchSkillsIndex,
  getSkillRegistryBaseUrl,
  installSkillWithFanout,
  readSkillLock,
  runWithConcurrency,
  writeSkillLock,
} from "bailian-cli-core";
import { emitBare, emitResult, formatTable } from "bailian-cli-runtime";

interface InitOutcome {
  name: string;
  status: "installed" | "failed";
  publishedAt?: string;
  agents?: string[];
  reason?: string;
}

/** Prefix used to identify first-party Bailian skills in the registry. */
const BAILIAN_PREFIX = "bailian-";

/** Max number of skills downloading/installing at the same time. */
const INIT_CONCURRENCY = 3;

export default defineCommand({
  description: {
    "en-US": "Install all bailian-* skills (one-shot bootstrap for new environments)",
    "zh-CN": "安装全部 bailian-* Skill（用于新环境的一次性初始化）",
  },
  auth: "none",
  usageArgs: "",
  exampleArgs: [""],
  notes: [
    {
      "en-US":
        "Fetches the registry index and installs every skill whose name starts with `bailian-`.",
      "zh-CN": "获取 Registry 索引并安装名称以 `bailian-` 开头的所有 Skill。",
    },
    {
      "en-US": "Equivalent to: `bl skill add --all` (filtered to `bailian-*` skills).",
      "zh-CN": "等价于：`bl skill add --all`（筛选为 `bailian-*` Skill）。",
    },
  ],
  async run(ctx) {
    const format = ctx.settings.outputExplicit ? ctx.settings.output : "json";
    const index = await fetchSkillsIndex();

    // Discover all bailian-* skills from the live registry index
    const names = Object.keys(index.skills).filter((name) => name.startsWith(BAILIAN_PREFIX));

    const lock = readSkillLock();
    const agents = detectInstalledAgents();

    const tasks = names.map((name) => async (): Promise<InitOutcome> => {
      const entry = index.skills[name];
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
    const results = await runWithConcurrency(tasks, INIT_CONCURRENCY);
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
      emitBare("No bailian-* skills found in the registry.");
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
        "Check the reason for failed skills in the output; network failures can be retried with bl skill init",
      );
    }
  },
});

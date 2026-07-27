import {
  BailianError,
  ExitCode,
  defineCommand,
  detectOutputFormat,
  detectInstalledAgents,
  fetchSkillsIndex,
  getSkillRegistryBaseUrl,
  installSkill,
  linkSkillToAgents,
  readSkillLock,
  writeSkillLock,
} from "bailian-cli-core";
import { emitBare, emitResult, formatTable } from "bailian-cli-runtime";
import { parseSkillNames } from "./shared.ts";

interface AddOutcome {
  name: string;
  status: "installed" | "failed";
  publishedAt?: string;
  agents?: string[];
  reason?: string;
}

/** Max number of skills downloading/installing at the same time. */
const INSTALL_CONCURRENCY = 3;

/**
 * Run async task factories with a bounded concurrency pool.
 * Returns results in the same order as the input tasks array.
 */
async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < tasks.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await tasks[currentIndex]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export default defineCommand({
  description: "Install skills from the Bailian skill registry into local agents",
  auth: "none",
  usageArgs: "--name <all|name,...>",
  flags: {
    name: {
      type: "string",
      valueHint: "<all|name,...>",
      description: "Skills to install: all or comma-separated skill names",
      required: true,
    },
  },
  exampleArgs: ["--name all", "--name spark-video,bailian-model-recommend"],
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const requested = parseSkillNames(ctx.flags.name, false);
    const index = await fetchSkillsIndex();
    const remoteNames = Object.keys(index.skills);
    const names = requested === "all" ? remoteNames : requested;

    const lock = readSkillLock();
    const agents = detectInstalledAgents();

    // collect-then-throw: a single skill failure only affects itself; successful ones are written to disk and lock as usual.
    // Skills install concurrently (bounded by INSTALL_CONCURRENCY) — each writes to a disjoint canonical dir, unique tmpDir, and distinct lock key.
    const tasks = names.map((name) => async (): Promise<AddOutcome> => {
      const entry = index.skills[name];
      if (!entry) {
        return { name, status: "failed", reason: "skill not found in registry" };
      }
      try {
        await installSkill(name, entry);
        const links = linkSkillToAgents(name, agents);
        const effective = links.filter((link) => link.mode !== "skipped");
        lock.skills[name] = {
          ...(entry.contentHash ? { contentHash: entry.contentHash } : {}),
          ...(entry.publishedAt ? { publishedAt: entry.publishedAt } : {}),
          installedAt: new Date().toISOString(),
          sourceType: "oss",
          ...(entry.description ? { description: entry.description } : {}),
          links: effective.map((link) => link.path),
        };
        return {
          name,
          status: "installed",
          publishedAt: entry.publishedAt,
          agents: effective.map((link) => link.agent),
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
        { registry: getSkillRegistryBaseUrl(), agents: agents.map((a) => a.id), skills: results },
        format,
      );
    } else if (results.length === 0) {
      emitBare("Skill registry is empty; no skills to install.");
    } else {
      const rows = results.map((r) => [
        r.name,
        r.status,
        r.publishedAt ? r.publishedAt.slice(0, 10) : "-",
        r.status === "installed" ? r.agents?.join(", ") || "-" : (r.reason ?? "-"),
      ]);
      for (const line of formatTable(["NAME", "STATUS", "PUBLISHED", "AGENTS / REASON"], rows)) {
        emitBare(line);
      }
    }

    const failed = results.filter((r) => r.status === "failed");
    if (failed.length > 0) {
      throw new BailianError(
        `${failed.length}/${results.length} skill(s) failed to install`,
        ExitCode.GENERAL,
        "Check the reason for failed skills in the output; network failures can be retried with bl skill add",
      );
    }
  },
});

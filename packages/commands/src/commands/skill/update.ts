import {
  BailianError,
  ExitCode,
  defineCommand,
  detectInstalledAgents,
  fanOutSkillToAgents,
  fetchSkillsIndex,
  getSkillRegistryBaseUrl,
  installSkillWithFanout,
  listSkillDirsOnDisk,
  parseSkillNames,
  readSkillLock,
  runWithConcurrency,
  writeSkillLock,
} from "bailian-cli-core";
import { emitBare, emitResult, formatTable } from "bailian-cli-runtime";

interface UpdateOutcome {
  name: string;
  status: "updated" | "up-to-date" | "skipped" | "failed";
  publishedAt?: string;
  reason?: string;
}

/** Max number of skills downloading/installing at the same time. */
const UPDATE_CONCURRENCY = 3;

export default defineCommand({
  description: "Update installed skills to the latest registry versions",
  auth: "none",
  usageArgs: "[--name <all|name,...>]",
  flags: {
    name: {
      type: "string",
      valueHint: "<all|name,...>",
      description:
        "Skills to update: all (default, only changed ones) or comma-separated names (force update installed skills)",
    },
  },
  exampleArgs: ["", "--name spark-video"],
  async run(ctx) {
    const format = ctx.settings.outputExplicit ? ctx.settings.output : "json";
    const requested = parseSkillNames(ctx.flags.name, true);
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
            reason: "not installed; run bl skill add --name " + name + " first",
          });
          continue;
        }
        targets.push(name);
      }
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
      emitBare("No skills installed locally; run bl skill add first.");
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
        "Check the reason for failed skills in the output; network failures can be retried with bl skill update",
      );
    }
  },
});

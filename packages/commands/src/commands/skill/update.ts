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
  listSkillDirsOnDisk,
  readSkillLock,
  writeSkillLock,
} from "bailian-cli-core";
import { emitBare, emitResult, formatTable } from "bailian-cli-runtime";
import { parseSkillNames, runWithConcurrency } from "./shared.ts";

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
    const format = detectOutputFormat(ctx.settings.output);
    const requested = parseSkillNames(ctx.flags.name, true);
    const index = await fetchSkillsIndex();
    const lock = readSkillLock();
    const disk = new Set(listSkillDirsOnDisk());

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

    const agents = detectInstalledAgents();
    const tasks = targets.map((name) => async (): Promise<UpdateOutcome> => {
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
        result.reason ?? "-",
      ]);
      for (const line of formatTable(["NAME", "STATUS", "PUBLISHED", "REASON"], rows)) {
        emitBare(line);
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

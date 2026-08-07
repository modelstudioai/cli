import {
  BailianError,
  ExitCode,
  defineCommand,
  listSkillDirsOnDisk,
  parseSkillNames,
  readSkillLock,
  removeSkillDir,
  unlinkSkillFromAgents,
  writeSkillLock,
} from "bailian-cli-core";
import { emitBare, emitResult, formatTable } from "bailian-cli-runtime";

interface RemoveOutcome {
  name: string;
  status: "removed" | "failed";
  removedLinks?: number;
  reason?: string;
}

export default defineCommand({
  description: "Remove locally installed skills (registry is untouched)",
  auth: "none",
  usageArgs: "--name <all|name,...>",
  flags: {
    name: {
      type: "string",
      valueHint: "<all|name,...>",
      description: "Skills to remove: all or comma-separated skill names",
      required: true,
    },
  },
  exampleArgs: ["--name spark-video", "--name all"],
  async run(ctx) {
    // Purely local operation: no remote access, works offline
    const format = ctx.settings.outputExplicit ? ctx.settings.output : "json";
    const requested = parseSkillNames(ctx.flags.name, false);
    const lock = readSkillLock();
    const names = requested === "all" ? Object.keys(lock.skills) : requested;

    if (names.length === 0) {
      emitResult({ skills: [] }, format);
      if (format === "text") emitBare("No skills installed locally; nothing to remove.");
      return;
    }

    const diskDirs = new Set(listSkillDirsOnDisk());
    const results: RemoveOutcome[] = [];
    for (const name of names) {
      const locked = lock.skills[name];
      if (!locked) {
        results.push({
          name,
          status: "failed",
          reason: diskDirs.has(name)
            ? "directory not managed by bl skill (untracked); remove manually if needed"
            : "not installed",
        });
        continue;
      }
      try {
        // Reclaim agent fan-out first, then delete canonical, finally clear the lock entry
        const removedLinks = unlinkSkillFromAgents(name, locked.links ?? []);
        removeSkillDir(name);
        delete lock.skills[name];
        results.push({ name, status: "removed", removedLinks: removedLinks.length });
      } catch (err) {
        results.push({
          name,
          status: "failed",
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }
    writeSkillLock(lock);

    if (format === "json") {
      emitResult({ skills: results }, format);
    } else {
      const rows = results.map((r) => [
        r.name,
        r.status,
        r.status === "removed" ? `reclaimed ${r.removedLinks} agent link(s)` : (r.reason ?? "-"),
      ]);
      for (const line of formatTable(["NAME", "STATUS", "DETAIL"], rows)) {
        emitBare(line);
      }
    }

    const failed = results.filter((r) => r.status === "failed");
    if (failed.length > 0) {
      throw new BailianError(
        `${failed.length}/${results.length} skill(s) failed to remove`,
        ExitCode.GENERAL,
        "Check the reason for failed skills in the output; use bl skill list to verify local install status",
      );
    }
  },
});

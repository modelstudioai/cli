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

export default defineCommand({
  description: "Install skills from the Bailian skill registry into local agents",
  auth: "none",
  usageArgs: "[--name <all|name,...>]",
  flags: {
    name: {
      type: "string",
      valueHint: "<all|name,...>",
      description: "Skills to install: all (default) or comma-separated skill names",
    },
  },
  exampleArgs: ["", "--name all", "--name spark-video,bailian-model-recommend"],
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const requested = parseSkillNames(ctx.flags.name, true);
    const index = await fetchSkillsIndex();
    const remoteNames = Object.keys(index.skills);
    const names = requested === "all" ? remoteNames : requested;

    const lock = readSkillLock();
    const agents = detectInstalledAgents();
    const results: AddOutcome[] = [];

    // collect-then-throw: a single skill failure only affects itself; successful ones are written to disk and lock as usual
    for (const name of names) {
      const entry = index.skills[name];
      if (!entry) {
        results.push({ name, status: "failed", reason: "skill not found in registry" });
        continue;
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
        results.push({
          name,
          status: "installed",
          publishedAt: entry.publishedAt,
          agents: effective.map((link) => link.agent),
        });
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

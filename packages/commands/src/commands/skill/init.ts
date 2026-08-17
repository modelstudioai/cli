import {
  BailianError,
  ExitCode,
  defineCommand,
  detectInstalledAgents,
  fetchSkillsIndex,
  installSkillWithFanout,
  readSkillLock,
  runWithConcurrency,
  writeSkillLock,
} from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";

/** Prefix used to identify first-party Bailian skills in the registry. */
const BAILIAN_PREFIX = "bailian-";

/** Max number of skills downloading/installing at the same time. */
const INIT_CONCURRENCY = 3;

/** Default output format when user does not pass --output explicitly. */
const DEFAULT_FORMAT = "json";

/** All status values used by skill init (per-skill outcome + aggregate result). */
const STATUS = {
  success: "success",
  partial: "partial",
  failed: "failed",
} as const;

interface InitOutcome {
  name: string;
  status: typeof STATUS.success | typeof STATUS.failed;
  reason?: string;
}

export default defineCommand({
  description: "Install all bailian-* skills (one-shot bootstrap for new environments)",
  auth: "none",
  usageArgs: "",
  exampleArgs: [""],
  notes: [
    "Fetches the registry index and installs every skill whose name starts with bailian-",
    "Equivalent to: bl skill add --all (filtered to bailian-* skills)",
  ],
  async run(ctx) {
    const format = ctx.settings.outputExplicit ? ctx.settings.output : DEFAULT_FORMAT;
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
        return { name, status: STATUS.success };
      } catch (err) {
        return {
          name,
          status: STATUS.failed,
          reason: err instanceof Error ? err.message : String(err),
        };
      }
    });
    const results = await runWithConcurrency(tasks, INIT_CONCURRENCY);
    writeSkillLock(lock);

    const installed = results.filter((result) => result.status === STATUS.success);
    const failed = results.filter((result) => result.status === STATUS.failed);

    const status =
      failed.length === 0
        ? STATUS.success
        : installed.length === 0
          ? STATUS.failed
          : STATUS.partial;

    if (format === DEFAULT_FORMAT) {
      const agentIds = agents.map((agent) => agent.id);
      const payload: Record<string, unknown> = {
        status,
        skills: installed.map((result) => result.name),
      };
      if (failed.length > 0) {
        payload.failed = failed.map((result) => ({
          name: result.name,
          reason: result.reason,
          agents: agentIds,
        }));
      }
      emitResult(payload, format);
    } else if (results.length === 0) {
      emitBare("No bailian-* skills found in the registry.");
    } else {
      emitBare(
        status === STATUS.success
          ? `Installed ${installed.length} bailian-* skills.`
          : `Installed ${installed.length}/${results.length} bailian-* skills.`,
      );
      if (failed.length > 0) {
        emitBare("Failed:");
        for (const item of failed) {
          emitBare(`  ${item.name}: ${item.reason}`);
        }
      }
    }

    if (failed.length > 0) {
      throw new BailianError(
        `${failed.length}/${results.length} skill(s) failed to install`,
        ExitCode.GENERAL,
        "Check the reason for failed skills in the output; network failures can be retried with bl skill init",
      );
    }
  },
});

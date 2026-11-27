import { observeRegistry } from "./update-check.ts";
import { existsSync, lstatSync, readlinkSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  BailianError,
  detectInstalledAgents,
  fanOutSkillToAgents,
  fetchSkillsIndex,
  getAgentTargets,
  getSkillRegistryBaseUrl,
  installSkillWithFanout,
  planUnlinkSkillFromAgents,
  readSkillLock,
  runWithConcurrency,
  writeSkillLock,
  type AgentTarget,
  type CommandContext,
  type SkillLockEntry,
  type LinkResult,
} from "bailian-cli-core";
import { commitTargets } from "./managed-files.ts";
import { unpackRevision } from "./packages.ts";
import type { SkillAddPackages } from "./mcp-dependencies.ts";
import { formatTable } from "bailian-cli-runtime";
import { canonicalSkillPath, planFanoutLinks, summarizeAgents } from "./dry-run-plan.ts";
import {
  checkContent,
  otherSourcePaths,
  present,
  selectedEntries,
  selectedNames,
  validName,
  type Selection,
} from "./targets.ts";

// Older OSS records own a canonical installation plus agent symlinks or recorded fallback copies.
function checkRegistryTargets(
  name: string,
  entry: SkillLockEntry | undefined,
  agents: AgentTarget[],
  reservedPaths: Set<string>,
  preview = false,
) {
  if (!validName(name)) throw new BailianError("Invalid skill name / Skill 名称无效");
  const canonical = canonicalSkillPath(name);
  if (reservedPaths.has(resolve(canonical)))
    throw new BailianError(`SOURCE_CONFLICT: ${canonical}`);
  checkContent(canonical, entry);
  const allowed = new Set(getAgentTargets().map((agent) => resolve(agent.skillsDir, name)));
  const recorded = new Set((entry?.links ?? []).map((path) => resolve(path)));
  const paths = new Set([
    ...recorded,
    ...agents.map((agent) => join(agent.skillsDir, name)),
    ...planUnlinkSkillFromAgents(name),
  ]);
  for (const path of paths) {
    if (reservedPaths.has(resolve(path))) throw new BailianError(`SOURCE_CONFLICT: ${path}`);
    if (!allowed.has(path)) throw new BailianError(`INVALID_TARGET: ${path}`);
    if (!present(path)) continue;
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() && resolve(dirname(path), readlinkSync(path)) === resolve(canonical))
      continue;
    // Include legacy recorded placeholders in the link preview.
    if (
      preview &&
      recorded.has(path) &&
      stat.isFile() &&
      !/^sha256:[0-9a-f]{64}$/.test(entry?.contentHash ?? "")
    )
      continue;
    checkContent(path, recorded.has(path) ? entry : undefined);
  }
}

function agentResult(link: { agent: string; path: string }, reason: string, outcome?: LinkResult) {
  const failed = outcome?.mode === "skipped";
  return {
    agent: link.agent,
    scope: "user",
    installed_path: link.path,
    status: failed ? "failed" : reason === "UP_TO_DATE" ? "noop" : "succeeded",
    reason: failed ? "LINK_FAILED" : reason,
    ...(failed && { message: outcome.reason }),
  };
}

export async function runRegistryLifecycle(
  action: "add" | "update" | "remove",
  ctx: Pick<CommandContext, "output" | "settings" | "localize" | "client">,
  flags: Selection,
  staged?: SkillAddPackages,
) {
  const lock = readSkillLock();
  const reservedPaths = otherSourcePaths("oss", lock);
  const index =
    action === "remove"
      ? undefined
      : observeRegistry(ctx, await (staged?.ossIndex() ?? fetchSkillsIndex()));
  const agents = action === "remove" ? [] : detectInstalledAgents();
  const requested = selectedNames(flags);
  const installed = new Map(selectedEntries(flags, lock));
  const names =
    requested === "all"
      ? action === "add"
        ? Object.keys(index!.skills)
        : [...installed.keys()]
      : requested;
  const preview = ctx.settings.dryRun;
  let firstError: Error | undefined;
  const tasks = names.map((name) => async () => {
    try {
      const locked = installed.get(name);
      if (action === "add" && !locked && Object.hasOwn(lock.skills, name))
        throw new BailianError(`SOURCE_CONFLICT: ${name}`);
      if (action !== "add" && !locked)
        throw new BailianError(
          ctx.localize({
            "en-US": "NOT_INSTALLED: Skill not installed",
            "zh-CN": "NOT_INSTALLED: Skill 未安装",
          }),
        );
      const canonical = canonicalSkillPath(name);
      const remote = index && Object.hasOwn(index.skills, name) ? index.skills[name] : undefined;
      if (
        action !== "remove" &&
        locked?.sourceLocation &&
        locked.sourceLocation !== getSkillRegistryBaseUrl()
      )
        throw new BailianError(
          "SOURCE_MISMATCH: Select the original registry / 请切换至原 OSS Registry",
        );
      if (action === "update" && !remote && requested === "all")
        return { name, status: "skipped", reason: "DELISTED" };
      if (action !== "remove" && !remote)
        throw new BailianError(
          ctx.localize({
            "en-US": "Skill not found in registry",
            "zh-CN": "Registry 中未找到 Skill",
          }),
        );
      const targets = agents.filter((agent) => !reservedPaths.has(resolve(agent.skillsDir, name)));
      checkRegistryTargets(name, locked, targets, reservedPaths, preview);
      if (action === "remove") {
        const links = planUnlinkSkillFromAgents(name, locked!.links);
        if (preview) return { name, status: "remove", canonical, links };
        commitTargets(
          [...new Set([...links, canonical])].map((path) => ({ path })),
          () => {
            const skills = { ...lock.skills };
            delete skills[name];
            writeSkillLock({ ...lock, skills });
            lock.skills = skills;
          },
        );
        return { name, status: "removed", canonical, removedLinks: links.length };
      }
      const entry = remote!;
      const same =
        !!locked &&
        !!entry.contentHash &&
        entry.contentHash === locked.contentHash &&
        existsSync(join(canonical, "SKILL.md"));
      let packageRoot: string | undefined;
      if (staged) {
        if (same && locked?.contentHash?.startsWith("sha256:")) packageRoot = canonical;
        else {
          let artifact = staged.packages.get(name);
          if (!artifact) {
            artifact = await unpackRevision(
              ctx,
              { source: "oss", id: name, oss: entry },
              staged.temp(),
            );
            staged.packages.set(name, artifact);
          }
          packageRoot = artifact.root;
        }
        staged.inspect(name, packageRoot, preview);
      }
      if (same) {
        const links = planFanoutLinks(name, targets);
        const missing = new Set(links.filter((link) => !link.exists).map((link) => link.agent));
        const fanout =
          !preview && missing.size
            ? fanOutSkillToAgents(
                name,
                targets.filter((agent) => missing.has(agent.id)),
                locked.links,
              )
            : undefined;
        if (fanout) {
          const skills = { ...lock.skills, [name]: { ...locked, links: fanout.links } };
          try {
            writeSkillLock({ ...lock, skills });
          } catch (error) {
            for (const link of fanout.results)
              if (link.mode !== "skipped") rmSync(link.path, { recursive: true, force: true });
            throw error;
          }
          lock.skills = skills;
        }
        const agent_results = links.map((link) =>
          agentResult(
            link,
            link.exists ? "UP_TO_DATE" : "REPAIRED",
            fanout?.results.find((result) => result.agent === link.agent),
          ),
        );
        const failure = agent_results.find((row) => row.status === "failed");
        if (failure) firstError ??= new BailianError(failure.message ?? failure.reason);
        return {
          name,
          canonical,
          publishedAt: locked.publishedAt,
          agent_results,
          ...(preview && { links }),
          status: failure ? "failed" : missing.size ? "repaired" : "up-to-date",
          ...(failure && { reason: failure.reason }),
        };
      }
      const reason = action === "add" ? "INSTALLED" : "UPDATED";
      if (preview) {
        const links = planFanoutLinks(name, targets);
        return {
          name,
          status: action === "add" ? "install" : "update",
          canonical,
          publishedAt: entry.publishedAt,
          links,
          agent_results: links.map((link) => agentResult(link, reason)),
        };
      }
      const record = await installSkillWithFanout(
        name,
        entry,
        targets,
        locked?.links,
        undefined,
        packageRoot,
      );
      const skills = {
        ...lock.skills,
        [name]: { ...record.lockEntry, sourceLocation: getSkillRegistryBaseUrl() },
      };
      writeSkillLock({ ...lock, skills });
      lock.skills = skills;
      const agent_results = record.linkResults.map((link) => agentResult(link, reason, link));
      const failure = agent_results.find((row) => row.status === "failed");
      if (failure) firstError ??= new BailianError(failure.message ?? failure.reason);
      return {
        name,
        status: failure ? "failed" : action === "add" ? "installed" : "updated",
        agent_results,
        ...(failure && { reason: failure.reason }),
        publishedAt: entry.publishedAt,
        agents: record.linkedAgents,
      };
    } catch (error) {
      const caught = error instanceof Error ? error : new Error(String(error));
      firstError ??= caught;
      return { name, status: "failed", reason: caught.message };
    }
  });
  const skills = await runWithConcurrency(tasks, 3);
  const summary = { succeeded: 0, noop: 0, failed: 0 };
  const results = skills.map((row) => {
    const status =
      row.status === "failed"
        ? "failed"
        : ["up-to-date", "skipped"].includes(row.status)
          ? "noop"
          : "succeeded";
    summary[status]++;
    return {
      code: row.name,
      status,
      ...("agent_results" in row && { agent_results: row.agent_results }),
      reason:
        row.reason?.split(":")[0] ??
        (row.status === "repaired"
          ? "REPAIRED"
          : row.status === "up-to-date"
            ? action === "add"
              ? "ALREADY_INSTALLED"
              : "UP_TO_DATE"
            : { add: "INSTALLED", update: "UPDATED", remove: "REMOVED" }[action]),
      installed_path: canonicalSkillPath(row.name),
    };
  });
  return {
    data: {
      action: `skill.${action}`,
      dry_run: preview,
      skills,
      summary,
      results,
      ...(action !== "remove" && {
        registry: getSkillRegistryBaseUrl(),
        agents: preview ? summarizeAgents(agents) : agents.map((agent) => agent.id),
      }),
    },
    text: formatTable(
      ["NAME", "STATUS", "DETAIL"],
      skills.map((row) => [row.name, row.status, row.reason ?? "-"]),
    ).join("\n"),
    firstError,
  };
}

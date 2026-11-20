import { existsSync } from "node:fs";
import { defineCommand } from "bailian-cli-core";
import { withStateLock } from "../shared/state-lock.ts";
import { disconnectMcpAgents, manifestPath } from "./agent-config.ts";
import {
  registrationAttempt,
  registrationFailure,
  registrationFlags,
  registrationLocation,
  reportRegistrations,
} from "./registration.ts";
import { validateServer } from "./server-management.ts";

export default defineCommand({
  description: {
    "en-US": "Remove a managed MCP registration from local Agent configurations",
    "zh-CN": "从本地 Agent 配置中移除托管的 MCP 注册",
  },
  auth: "none",
  flags: registrationFlags,
  usageArgs: "--server <code> --agent <agent|all> [--scope <user|project>] [--dry-run]",
  notes: [
    {
      "en-US":
        "Disconnect runs offline. Entries edited since registration are preserved and reported as conflicts.",
      "zh-CN": "断开连接可离线执行。注册后被修改的条目会保留并报告冲突。",
    },
  ],
  exampleArgs: [
    "--server mcp-example --agent cursor --scope project --dry-run",
    "--server mcp-example --agent all",
  ],
  validate: (values) => validateServer(values.server),
  async run(ctx) {
    const location = registrationLocation(ctx.flags, ctx.localize);
    const metadata = {
      server: ctx.flags.server,
      scope: location.scope,
      project_root: location.projectRoot,
    };
    const inspect = (dryRun: boolean) =>
      location.agents.map((agent) =>
        registrationAttempt(
          ctx,
          agent,
          () =>
            disconnectMcpAgents({
              ...location,
              agents: [agent],
              name: ctx.flags.server,
              dryRun,
            })[0],
        ),
      );
    if (ctx.settings.dryRun) {
      ctx.output.result({
        ...metadata,
        action: "disconnect",
        agents: location.agents,
        targets: inspect(true).map(({ result }) => result),
      });
      return;
    }
    const path = manifestPath(location.configDir);
    let results;
    try {
      results = existsSync(path)
        ? await withStateLock(path, ctx.localize, () => inspect(false))
        : inspect(true);
    } catch (error) {
      results = location.agents.map((agent) => registrationFailure(ctx, agent, error));
    }
    reportRegistrations(ctx, metadata, results);
  },
});

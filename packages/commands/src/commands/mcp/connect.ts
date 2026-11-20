import { BailianError, defineCommand, formatCommand, type CommandContext } from "bailian-cli-core";
import { withStateLock } from "../shared/state-lock.ts";
import {
  connectMcpAgents,
  manifestPath,
  McpRegistrationError,
  type McpTransport,
  type NativeMcpAgent,
} from "./agent-config.ts";
import {
  projectCredentialNote,
  registrationAttempt,
  registrationFailure,
  registrationFlags,
  registrationLocation,
  reportRegistrations,
  type RegistrationOutcome,
  type RegistrationResult,
} from "./registration.ts";
import { lifecycleRisks, planServerLifecycle, writeServer } from "./server-lifecycle.ts";
import { validateServer } from "./server-management.ts";
import { requestMcpServer } from "./server-response.ts";

const flags = {
  ...registrationFlags,
  transport: {
    type: "string",
    required: true,
    choices: ["streamable-http", "sse"],
    valueHint: "<streamable-http|sse>",
    description: {
      "en-US": "Transport exposed by the service endpoint",
      "zh-CN": "服务端点实际使用的传输协议",
    },
  },
  andActivate: {
    type: "boolean",
    implicitValue: true,
    valueHint: "[true|false]",
    description: {
      "en-US":
        "Activate an inactive service before connecting (default true, requires --yes). Use --and-activate=false to connect only to active services.",
      "zh-CN":
        "接入前开通未启用的服务（默认 true，开通须加 --yes）。仅接入已启用的服务可用 --and-activate=false。",
    },
  },
} as const;
type Context = Pick<CommandContext<typeof flags>, "client" | "identity" | "localize" | "flags">;
type Location = ReturnType<typeof registrationLocation>;
type Activation = Extract<ReturnType<typeof planServerLifecycle>, { action: string }>;
interface Dependency {
  endpoint?: string;
  activation?: Activation;
  status?: string | null;
  problem?: { error: unknown; fields?: Partial<RegistrationResult> };
}

function readyEndpoint(endpoint: string | null, transport: McpTransport): string {
  if (!endpoint || !URL.canParse(endpoint))
    throw new McpRegistrationError("ENDPOINT_UNAVAILABLE", {
      "en-US": "The active service did not return a usable MCP endpoint.",
      "zh-CN": "已启用的服务未返回可用的 MCP 端点。",
    });
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search)
    throw new McpRegistrationError("ENDPOINT_UNAVAILABLE", {
      "en-US": "Expected an HTTPS MCP endpoint without embedded credentials, query, or fragment.",
      "zh-CN": "MCP 端点须使用 HTTPS，且不含嵌入凭证、查询参数或片段。",
    });
  const suffix = transport === "sse" ? "/sse" : "/mcp";
  if (!url.pathname.replace(/\/$/, "").endsWith(suffix))
    throw new McpRegistrationError("TRANSPORT_MISMATCH", {
      "en-US": `The service endpoint does not support the requested transport (${transport}).`,
      "zh-CN": `服务端点与所选传输协议 ${transport} 不匹配。`,
    });
  return endpoint;
}

function pendingActivation() {
  return new McpRegistrationError("SERVER_NOT_READY", {
    "en-US": "Activation is still in progress. Run connect again when the service is active.",
    "zh-CN": "服务仍在开通中，请在启用后重新执行 connect。",
  });
}

async function connectionDependency(ctx: Context, allowActivation: boolean): Promise<Dependency> {
  const { server, transport } = ctx.flags;
  try {
    const response = await requestMcpServer(ctx, "GET", server);
    const status = response.detail.server_status;
    if (status === "ACTIVATED")
      return { status, endpoint: readyEndpoint(response.detail.endpoint, transport) };
    if (status === "ACTIVATING") return { status, problem: { error: pendingActivation() } };
    const step = planServerLifecycle(ctx, server, "activate", response);
    if ("result" in step) return { status, problem: { error: step.error, fields: step.result } };
    if (!allowActivation) {
      const command = formatCommand(ctx.identity, "mcp activate --server <code>");
      return {
        status,
        problem: {
          error: new McpRegistrationError("NOT_ACTIVATED", {
            "en-US": `The service is inactive. Activate it first with ${command}.`,
            "zh-CN": `服务尚未启用，请先执行 ${command}。`,
          }),
        },
      };
    }
    return { status, activation: step };
  } catch (error) {
    return { problem: { error } };
  }
}

function connectTarget(
  ctx: Context,
  location: Location,
  agent: NativeMcpAgent,
  endpoint: string,
  dryRun: boolean,
) {
  return registrationAttempt(
    ctx,
    agent,
    () =>
      connectMcpAgents({
        ...location,
        agents: [agent],
        dryRun,
        cliVersion: ctx.identity.version,
        spec: {
          name: ctx.flags.server,
          serverCode: ctx.flags.server,
          transport: ctx.flags.transport,
          endpoint,
          headers: ctx.client.bailianMcpRegistrationHeaders(),
        },
      })[0],
  );
}

interface Prepared {
  location: Location;
  dependency: Dependency;
  targets: RegistrationOutcome[];
}

async function finishConnection(ctx: Context, plan: Prepared) {
  let { dependency, targets } = plan;
  if (dependency.activation) {
    targets = targets.map((target) =>
      target.error ? target : connectTarget(ctx, plan.location, target.result.agent, "", true),
    );
    if (targets.some((target) => !target.error)) {
      const activation = await writeServer(ctx, dependency.activation);
      if (activation.error)
        dependency = { problem: { error: activation.error, fields: activation.result } };
      else if (activation.result.server_status === "ACTIVATING")
        dependency = { status: "ACTIVATING", problem: { error: pendingActivation() } };
      else dependency = await connectionDependency(ctx, false);
    }
  }
  const { endpoint, problem } = dependency;
  const outcomes = targets.map((target) => {
    if (target.error) return target;
    const agent = target.result.agent;
    if (problem) return registrationFailure(ctx, agent, problem.error, problem.fields);
    if (!endpoint) return registrationFailure(ctx, agent, pendingActivation());
    return connectTarget(ctx, plan.location, agent, endpoint, false);
  });
  return { dependency, outcomes };
}

export default defineCommand<typeof flags, Prepared>({
  description: {
    "en-US": "Connect a Bailian MCP service to native Agent configurations",
    "zh-CN": "将百炼 MCP 服务接入 Agent 原生配置",
  },
  auth: "apiKey",
  flags,
  risk: lifecycleRisks.activate,
  usageArgs:
    "--server <code> --transport <streamable-http|sse> --agent <agent|all> [--scope <user|project>] [--and-activate[=true|false]] [--yes] [--dry-run]",
  exampleArgs: [
    "--server TextGenerateImage --transport streamable-http --agent cursor --dry-run",
    "--server mcp-example --transport sse --agent claude-code --scope project --and-activate=false",
  ],
  notes: [
    projectCredentialNote,
    {
      "en-US":
        "The service detail supplies the workspace endpoint. Each Agent is updated independently after its registration fingerprint is checked.",
      "zh-CN": "使用服务详情返回的工作空间端点。逐个校验托管指纹并更新目标 Agent。",
    },
  ],
  validate: (values) => validateServer(values.server),
  async prepare(ctx) {
    const location = registrationLocation(ctx.flags, ctx.localize);
    // Check scope, transport and ownership before looking up or activating a service.
    const inspected = location.agents.map((agent) => connectTarget(ctx, location, agent, "", true));
    const canConnect = inspected.some((target) => !target.error);
    const dependency: Dependency = canConnect
      ? await connectionDependency(ctx, ctx.flags.andActivate !== false)
      : {};
    const targets = inspected.map((target) =>
      !target.error && dependency.endpoint
        ? connectTarget(ctx, location, target.result.agent, dependency.endpoint, true)
        : target,
    );
    const previewTargets = targets.map(({ result, error }) => {
      if (error) return result;
      if (dependency.problem)
        return registrationFailure(
          ctx,
          result.agent,
          dependency.problem.error,
          dependency.problem.fields,
        ).result;
      return {
        agent: result.agent,
        path: result.path,
        action: dependency.activation ? "connect_after_activation" : result.action,
      };
    });
    return {
      data: { location, dependency, targets },
      preview: {
        server: ctx.flags.server,
        transport: ctx.flags.transport,
        endpoint: dependency.endpoint ?? null,
        agents: location.agents,
        scope: location.scope,
        project_root: location.projectRoot,
        server_status: dependency.status,
        activation: canConnect ? dependency.activation?.action : undefined,
        targets: previewTargets,
        header_names: Object.keys(ctx.client.bailianMcpRegistrationHeaders()),
      },
      risk: dependency.activation ? lifecycleRisks.activate : null,
      notices: [],
    };
  },
  async run(ctx) {
    if (!ctx.prepared)
      throw new BailianError(
        ctx.localize({ "en-US": "Missing MCP connection plan.", "zh-CN": "缺少 MCP 接入计划。" }),
      );
    const plan = ctx.prepared;
    const { location } = plan;
    const canWrite = !plan.dependency.problem && plan.targets.some((target) => !target.error);
    let completed;
    try {
      completed = canWrite
        ? await withStateLock(manifestPath(location.configDir), ctx.localize, () =>
            finishConnection(ctx, plan),
          )
        : await finishConnection(ctx, plan);
    } catch (error) {
      completed = {
        dependency: plan.dependency,
        outcomes: plan.targets.map((target) =>
          target.error ? target : registrationFailure(ctx, target.result.agent, error),
        ),
      };
    }
    const { dependency, outcomes } = completed;
    const serverArg = /^[\w.-]+$/.test(ctx.flags.server) ? ctx.flags.server : "<code>";
    const nextStep = outcomes.some(({ error }) => !error)
      ? formatCommand(ctx.identity, "mcp tools --server " + serverArg)
      : undefined;
    reportRegistrations(
      ctx,
      {
        server: ctx.flags.server,
        transport: ctx.flags.transport,
        scope: location.scope,
        project_root: location.projectRoot,
        server_status: dependency.status,
        endpoint: dependency.endpoint,
        message: outcomes.some(({ result }) => result.status === "succeeded")
          ? ctx.localize({ "en-US": "Agent configuration written.", "zh-CN": "Agent 配置已写入。" })
          : undefined,
        next_step: nextStep,
      },
      outcomes,
    );
  },
});

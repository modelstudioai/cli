import { homedir } from "node:os";
import {
  BailianError,
  ExitCode,
  formatCommand,
  getConfigDir,
  type CommandContext,
  type LocalizedText,
} from "bailian-cli-core";
import { normalizeError } from "bailian-cli-runtime";
import {
  MCP_AGENT_IDS,
  McpRegistrationError,
  projectAgents,
  resolveMcpAgentTargets,
  type McpAgentResult,
  type McpScope,
  type NativeMcpAgent,
} from "./agent-config.ts";

export const registrationFlags = {
  server: {
    type: "string",
    valueHint: "<code>",
    required: true,
    description: {
      "en-US": "Bailian MCP server code",
      "zh-CN": "百炼 MCP 服务编码",
    },
  },
  agent: {
    type: "string",
    required: true,
    valueHint: "<agent|all>",
    choices: [...MCP_AGENT_IDS, "all"],
    description: {
      "en-US": `Target Agent: ${[...MCP_AGENT_IDS, "all"].join(", ")}`,
      "zh-CN": `目标 Agent：${[...MCP_AGENT_IDS, "all"].join("、")}`,
    },
  },
  scope: {
    type: "string",
    valueHint: "<user|project>",
    choices: ["user", "project"],
    description: {
      "en-US": `Registration scope (default user). Run project scope in the project root. Supported: ${projectAgents.join(", ")}.`,
      "zh-CN": `注册范围（默认 user）。请在项目根目录执行 project 模式，支持 ${projectAgents.join("、")}。`,
    },
  },
} as const;

type CommonContext = Pick<CommandContext, "localize" | "identity">;
export function registrationLocation(
  flags: { server: string; agent: NativeMcpAgent | "all"; scope?: McpScope },
  localize: CommandContext["localize"],
) {
  const scope = flags.scope ?? "user";
  const projectRoot = scope === "project" ? process.cwd() : undefined;
  const home = homedir();
  const configDir = getConfigDir();
  let agents;
  try {
    agents = resolveMcpAgentTargets(flags.agent, home, {
      configDir,
      server: flags.server,
      projectRoot,
    });
  } catch (error) {
    if (error instanceof McpRegistrationError)
      throw new BailianError(localize(error.text), error.exitCode);
    throw error;
  }
  if (!agents.length)
    throw new BailianError(
      localize({
        "en-US": "No installed or registered Agent was found for --agent all.",
        "zh-CN": "--agent all 未找到已安装或已注册的 Agent。",
      }),
      ExitCode.USAGE,
    );
  return { scope, projectRoot, home, configDir, agents };
}

export interface RegistrationResult {
  agent: NativeMcpAgent;
  status: "succeeded" | "noop" | "failed";
  path?: string;
  action?: McpAgentResult["status"];
  reason?: string;
  error_code?: string | number;
  api_code?: string;
  request_id?: string;
  http_status?: number;
  message?: string;
  hint?: string;
  detail?: { console_url: string };
  outcome_unknown?: boolean;
}
export interface RegistrationOutcome {
  result: RegistrationResult;
  error?: BailianError;
}

export function registrationFailure(
  ctx: CommonContext,
  agent: NativeMcpAgent,
  cause: unknown,
  fields?: Partial<RegistrationResult>,
): RegistrationOutcome {
  const local = cause instanceof McpRegistrationError;
  const error = local
    ? new BailianError(ctx.localize(cause.text), cause.exitCode)
    : normalizeError(cause, formatCommand(ctx.identity), ctx.localize);
  return {
    error,
    result: {
      agent,
      status: "failed",
      error_code: local ? cause.reason : (error.api?.apiCode ?? error.exitCode),
      message: error.message,
      hint: error.hint,
      api_code: error.api?.apiCode,
      request_id: error.api?.requestId,
      http_status: error.api?.httpStatus,
      ...fields,
    },
  };
}

export function registrationAttempt(
  ctx: CommonContext,
  agent: NativeMcpAgent,
  operation: () => McpAgentResult,
): RegistrationOutcome {
  try {
    const { path, status } = operation();
    const reason =
      status === "absent"
        ? "NOT_CONNECTED"
        : status === "unchanged"
          ? "ALREADY_CONNECTED"
          : undefined;
    return {
      result: { agent, path, action: status, status: reason ? "noop" : "succeeded", reason },
    };
  } catch (error) {
    return registrationFailure(ctx, agent, error);
  }
}

export function reportRegistrations(
  ctx: Pick<CommandContext, "output">,
  metadata: Record<string, unknown>,
  outcomes: RegistrationOutcome[],
) {
  const summary = { succeeded: 0, failed: 0, noop: 0 };
  const results = outcomes.map(({ result }) => {
    summary[result.status]++;
    return { code: metadata.server, ...result };
  });
  ctx.output.result({ ...metadata, summary, results });
  const failure = outcomes.find(({ error }) => error);
  if (failure?.error) throw failure.error;
}

export const projectCredentialNote: LocalizedText = {
  "en-US":
    "Agent configuration contains the resolved API key. Keep project configuration and its backups out of version control.",
  "zh-CN": "Agent 配置含当前 API Key。请勿将项目配置及其备份提交到版本库。",
};

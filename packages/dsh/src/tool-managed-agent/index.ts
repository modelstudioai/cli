/**
 * `bailian-cli-dsh/tool-managed-agent`: run a task on a Bailian-hosted managed
 * agent, provisioned on demand, through `bl managed-agent run`.
 *
 * A plain tool rather than a `SubagentProvider`: in dsh's `web` profile every
 * `tool-subagent` row is disabled in the host plane (delegation tools live in
 * agent presets), and a subagent provider fixes one agent identity in config —
 * neither fits "the model describes an intent and a remote agent is created for
 * it". As a tool the model calls it directly and fills `instructions` from the
 * user's intent, so the remote agent's role is defined per task.
 *
 * The CLI does ensure+run in one step: it materializes (idempotently) a cloud
 * agent + environment under the given `agent` name on first use and reuses them
 * after, so no `agents.yaml` or prior `apply` is required. First use provisions
 * cloud resources — it may incur cost and take longer to start.
 *
 * Credentials: agentstudio is a pay-as-you-go DashScope API served ONLY on the
 * workspace-scoped host `https://{workspace}.cn-beijing.maas.aliyuncs.com`
 * (the plain dashscope origin and the TokenPlan gateway both 404 it, and a key
 * only unlocks its own workspace's host). `bl` resolves the key as
 * `--api-key` > `$DASHSCOPE_API_KEY` > the active config profile, but a
 * profile's `base_url` is NOT paired with an env-resolved key — an active
 * TokenPlan profile therefore aims agentstudio at the TokenPlan gateway. So
 * whenever this plugin resolves a key or an endpoint (row config, then launch
 * env), it passes them explicitly; see {@link credentialFlags}. Endpoint
 * resolution is `baseUrl`, then `$DASHSCOPE_BASE_URL`, then `workspaceId`
 * composed into the workspace host (same for `$BAILIAN_WORKSPACE_ID`). With
 * nothing resolvable here both halves are left to bl's own auth chain.
 *
 * @module bailian-cli-dsh/tool-managed-agent
 */
import type { Context } from "@deepseek-ai/cordis";
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";
import { defineTool } from "@deepseek-ai/dsh-tools";
import type {} from "@deepseek-ai/dsh-tools";
import z from "@deepseek-ai/schemastery";
import { runBlJson } from "../shared/bl.ts";
import {
  credentialFlags,
  isTokenPlanEndpoint,
  isTokenPlanKey,
  tokenPlanKeyRejection,
  workspaceEndpoint,
} from "../shared/credentials.ts";

/** Cordis plugin name used by loader diagnostics. */
export const name = "bailian-tool-managed-agent";

/** Seams this plugin registers into. */
export const inject = ["tools", "subprocess"];

/** Default agent identity provisioned and reused across calls. */
const DEFAULT_AGENT = "dsh-remote-runner";

export interface Config {
  /** Agent identity to create/reuse; distinct names get distinct remote agents. */
  agent?: string;
  /** Model for the remote agent. */
  model?: string;
  /** Pay-as-you-go DashScope key; defaults to `$DASHSCOPE_API_KEY`. */
  apiKey?: string;
  /**
   * Workspace id the key belongs to; composed into the agentstudio host.
   * Read from the console's top-right workspace switcher.
   */
  workspaceId?: string;
  /** Full agentstudio origin; wins over `workspaceId`. */
  baseUrl?: string;
  /** Cooperative budget; first-run provisioning of a cloud environment is slow. */
  timeoutMs?: number;
}

export const Config: z<Config> = z.object({
  agent: z.string().description("Remote agent identity to create/reuse."),
  model: z.string().description("Model for the remote agent."),
  apiKey: z
    .string()
    .role("secret")
    .description(
      "Pay-as-you-go DashScope key (sk-ws-); defaults to $DASHSCOPE_API_KEY. TokenPlan keys are rejected.",
    ),
  workspaceId: z
    .string()
    .description(
      "Workspace the key belongs to (console top-right switcher); defaults to $BAILIAN_WORKSPACE_ID. " +
        "Composed into https://{workspaceId}.cn-beijing.maas.aliyuncs.com.",
    ),
  baseUrl: z
    .string()
    .description(
      "Full agentstudio origin; overrides workspaceId. Defaults to $DASHSCOPE_BASE_URL.",
    ),
  timeoutMs: z.natural().description("Cooperative timeout budget in milliseconds."),
});

const DEFAULT_TIMEOUT_MS = 600_000;

/**
 * Resolve the managed-agent credentials: row config first, then the launch
 * environment. Endpoint resolution: `baseUrl` (explicit origin) beats
 * `workspaceId` (composed into the workspace-scoped host); env names mirror
 * the same split. Agentstudio is only served on the workspace-scoped host, so
 * an unresolved endpoint is left unset for bl to resolve (and the failure
 * hints below explain the gap when bl cannot either).
 */
function resolveCredentials(ctx: Context, config: Config): { apiKey?: string; baseUrl?: string } {
  const launchEnvironment = launchEnvironmentOf(ctx);
  const env = (varName: string): string | undefined => {
    const value = launchEnvironment.get(varName)?.value;
    return value !== undefined && value.length > 0 ? value : undefined;
  };
  const apiKey = config.apiKey ?? env("DASHSCOPE_API_KEY");
  const workspaceId = config.workspaceId ?? env("BAILIAN_WORKSPACE_ID");
  const baseUrl =
    config.baseUrl ??
    env("DASHSCOPE_BASE_URL") ??
    (workspaceId !== undefined ? workspaceEndpoint(workspaceId) : undefined);
  return {
    ...(apiKey !== undefined ? { apiKey } : {}),
    ...(baseUrl !== undefined ? { baseUrl } : {}),
  };
}

/** The `bl managed-agent run --output json` envelope: a session-event list. */
interface SessionRunResponse {
  session_id?: string;
  agent?: string;
  events?: readonly { type?: string; content?: unknown; role?: string }[];
}

/** Assistant-visible text of a finished remote session. */
function assistantText(response: SessionRunResponse): string {
  return (response.events ?? [])
    .filter((event) => event.type === "message" && typeof event.content === "string")
    .map((event) => event.content as string)
    .join("\n")
    .trim();
}

export function apply(ctx: Context, config: Config): void {
  // Resolve credentials at boot so misconfigurations surface as one clear
  // message instead of a cryptic 401/404 mid-task. This row is ENABLED BY
  // DEFAULT, though, and TokenPlan-only setups legitimately keep
  // $DASHSCOPE_API_KEY / $DASHSCOPE_BASE_URL aimed at the TokenPlan gateway
  // for the vision/image tools — so a TokenPlan key or endpoint is not a boot
  // error here: it becomes a per-call rejection with guidance, and everything
  // else keeps working. (Opt-in plugins like bailian-memory reject at boot.)
  const credentials = resolveCredentials(ctx, config);
  const rejection =
    credentials.apiKey !== undefined && isTokenPlanKey(credentials.apiKey)
      ? tokenPlanKeyRejection(name, "the managed-agent (agentstudio) API")
      : credentials.baseUrl !== undefined && isTokenPlanEndpoint(credentials.baseUrl)
        ? `${name}: the resolved endpoint ${credentials.baseUrl} is the TokenPlan gateway, ` +
          "which does not serve /api/v1/agentstudio (requests 404). Agentstudio lives on the " +
          "workspace-scoped host: set `workspaceId` (the workspace your key belongs to, from " +
          "the console's top-right switcher) or `baseUrl` in this row's config, or export " +
          "BAILIAN_WORKSPACE_ID / DASHSCOPE_BASE_URL."
        : undefined;
  const credentialArgv = credentialFlags(credentials.apiKey, credentials.baseUrl);

  ctx.tools.register(
    defineTool({
      name: "bailian_run_remote_task",
      description:
        "Run a task on a Bailian-hosted cloud agent. Use for long-running or isolated work you " +
        "want executed remotely rather than in this session. A remote agent is created on demand " +
        "(and reused) — describe the role it should play through `instructions`, and the concrete " +
        "task through `task`. Returns the remote agent's final answer.",
      parameters: {
        task: {
          type: "string",
          required: true,
          description: "The concrete task for the remote agent to carry out.",
        },
        instructions: {
          type: "string",
          description:
            "Role/system instructions defining what the remote agent is good at. " +
            "Defaults to a generic assistant.",
        },
        model: {
          type: "string",
          description: "Override the configured model for this task.",
        },
      },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            answer: { type: "string", required: true },
            sessionId: { type: "string", required: true },
          },
        },
        render: (_args, value) => [{ type: "text", text: value.answer }],
      },
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      async execute(args, exec) {
        if (rejection !== undefined) throw new Error(rejection);
        const argv = [
          "managed-agent",
          "run",
          "--prompt",
          args.task,
          "--agent",
          config.agent ?? DEFAULT_AGENT,
        ];
        if (args.instructions !== undefined) argv.push("--instructions", args.instructions);
        const model = args.model ?? config.model;
        if (model !== undefined) argv.push("--model", model);
        // Atomic credential pair: never let bl pair a key with its active
        // profile's base_url (a TokenPlan profile 404s agentstudio).
        argv.push(...credentialArgv);

        let response: SessionRunResponse;
        try {
          response = await runBlJson<SessionRunResponse>(ctx, argv, {
            cwd: exec.agent?.session.header.cwd ?? process.cwd(),
            signal: exec.signal,
          });
        } catch (error) {
          throw enrichProvisioningError(error, {
            fellThroughToBlChain: credentials.apiKey === undefined,
            endpointResolved: credentials.baseUrl !== undefined,
          });
        }

        const answer = assistantText(response);
        if (answer.length === 0) {
          throw new Error("the remote agent produced no assistant output.");
        }
        return { answer, sessionId: response.session_id ?? "" };
      },
    }),
  );
}

/**
 * Attach an actionable hint to the classic misconfiguration signatures.
 * Agentstudio is only served on the workspace-scoped host, and a key only
 * unlocks its own workspace, so the three failure modes each get targeted
 * guidance: 404 = endpoint is not a workspace host; 403 `Endpoint.
 * AccessDenied` = right shape of host but the wrong workspace for this key;
 * 401 = TokenPlan key on a pay-as-you-go API. Anything else passes through.
 */
function enrichProvisioningError(
  error: unknown,
  context: { fellThroughToBlChain: boolean; endpointResolved: boolean },
): unknown {
  if (!(error instanceof Error)) return error;
  const message = error.message;
  const workspaceHint =
    "Agentstudio is served only on the workspace-scoped host " +
    "https://{workspaceId}.cn-beijing.maas.aliyuncs.com, and a key only unlocks its own " +
    "workspace. Set `workspaceId` (the workspace your key belongs to, from the console's " +
    "top-right switcher) or `baseUrl` on the bailian-tool-managed-agent row, or export " +
    "BAILIAN_WORKSPACE_ID / DASHSCOPE_BASE_URL.";

  let hint: string | undefined;
  if (message.includes("Endpoint.AccessDenied") || message.includes("403")) {
    hint = `The host is workspace-scoped but this key belongs to a different workspace. ${workspaceHint}`;
  } else if (message.includes("404")) {
    hint = context.endpointResolved
      ? `The endpoint rejected /api/v1/agentstudio. ${workspaceHint}`
      : context.fellThroughToBlChain
        ? "No key/endpoint resolved from this row's config or the environment, so bl used its " +
          "own auth chain — its active profile endpoint is not the workspace host agentstudio " +
          `needs. ${workspaceHint}`
        : `The endpoint rejected /api/v1/agentstudio. ${workspaceHint}`;
  } else if (message.includes("401")) {
    hint =
      "The managed-agent API rejected the key. It needs a pay-as-you-go key (sk-ws-); " +
      "TokenPlan keys (sk-sp-) only serve the TokenPlan LLM gateway.";
  }

  if (hint === undefined) return error;
  error.message = `${error.message}\n${hint}`;
  return error;
}

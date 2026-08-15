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
 * @module bailian-cli-dsh/tool-managed-agent
 */
import type { Context } from "@deepseek-ai/cordis";
import { defineTool } from "@deepseek-ai/dsh-tools";
import type {} from "@deepseek-ai/dsh-tools";
import z from "@deepseek-ai/schemastery";
import { runBlJson } from "../shared/bl.ts";

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
  /** Cooperative budget; first-run provisioning of a cloud environment is slow. */
  timeoutMs?: number;
}

export const Config: z<Config> = z.object({
  agent: z.string().description("Remote agent identity to create/reuse."),
  model: z.string().description("Model for the remote agent."),
  timeoutMs: z.natural().description("Cooperative timeout budget in milliseconds."),
});

const DEFAULT_TIMEOUT_MS = 600_000;

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

        const response = await runBlJson<SessionRunResponse>(ctx, argv, {
          cwd: exec.agent?.session.header.cwd ?? process.cwd(),
          signal: exec.signal,
        });

        const answer = assistantText(response);
        if (answer.length === 0) {
          throw new Error("the remote agent produced no assistant output.");
        }
        return { answer, sessionId: response.session_id ?? "" };
      },
    }),
  );
}

/**
 * `bailian-cli-dsh/subagent-managed-agent`: runs child agents on Bailian's
 * hosted managed-agent runtime instead of in this process, through
 * `bl managed-agent session run`.
 *
 * Out-of-process delegation is an established shape here — `subagent-acp` and
 * `subagent-codex` do the same over their own transports. Going through the
 * CLI keeps `agents.yaml` resolution, provider selection, and SSE decoding in
 * one place.
 *
 * Two honest limits. The CLI buffers the whole session and emits it at exit,
 * so no incremental progress reaches the parent and a cancelled run yields no
 * partial output. And `prepareContinuable` is deliberately absent: method
 * presence IS the continuable capability, and multi-turn continuation is not
 * wired up yet.
 *
 * @module bailian-cli-dsh/subagent-managed-agent
 */
import type { Context } from "@deepseek-ai/cordis";
import type { ContentBlock } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";
import type {
  ResolvedSubagentStartRequest,
  SubagentCapabilities,
  SubagentProvider,
  SubagentResult,
  SubagentRun,
} from "@deepseek-ai/dsh-subagent";
import type {} from "@deepseek-ai/dsh-fs";
import z from "@deepseek-ai/schemastery";
import { runBlJson } from "../shared/bl.ts";

/** Cordis plugin name used by loader diagnostics. */
export const name = "bailian-subagent-managed-agent";

/** Seams this plugin registers into. */
export const inject = ["subagents", "subprocess", "fs"];

/** Registry name callers select this transport by. */
export const BAILIAN_MANAGED_AGENT_PROVIDER = "bailian-managed-agent";

export interface Config {
  /** Manifest passed as `--file`; must already be applied. */
  file?: string;
  /** Agent name within the manifest. */
  agent?: string;
  /** Backing provider understood by `bl managed-agent`. */
  provider?: string;
  /** Cooperative budget for one hosted run. */
  timeoutMs?: number;
}

export const Config: z<Config> = z.object({
  file: z.string().description("Path to agents.yaml; defaults to the CLI's own default."),
  agent: z.string().description("Agent name declared in the manifest."),
  provider: z.string().description("Managed-agent backing provider."),
  timeoutMs: z.natural().description("Cooperative timeout budget in milliseconds."),
});

const DEFAULT_MANIFEST = "agents.yaml";
const DEFAULT_TIMEOUT_MS = 600_000;

/** A one-shot transport supports none of the start-time features. */
const CAPABILITIES: SubagentCapabilities = {
  outputSchema: false,
  depthLimit: false,
  toolFilter: false,
  persona: false,
};

interface SessionEvent {
  type?: string;
  content?: unknown;
  role?: string;
}

interface SessionRunResponse {
  session_id?: string;
  events?: readonly SessionEvent[];
}

function promptText(blocks: readonly ContentBlock[]): string {
  return blocks
    .filter((block): block is Extract<ContentBlock, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

/** Assistant-visible text of a finished hosted session. */
function assistantOutput(events: readonly SessionEvent[]): ContentBlock[] {
  const text = events
    .filter((event) => event.type === "message" && typeof event.content === "string")
    .map((event) => event.content as string)
    .join("\n")
    .trim();
  return text.length > 0 ? [{ type: "text", text }] : [];
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

class BailianManagedAgentProvider implements SubagentProvider {
  readonly name = BAILIAN_MANAGED_AGENT_PROVIDER;
  readonly capabilities = CAPABILITIES;
  readonly inheritsParentContext = false;

  constructor(
    private readonly ctx: Context,
    private readonly config: Config,
  ) {}

  async start(request: ResolvedSubagentStartRequest): Promise<SubagentRun> {
    const cwd = request.parent.session.header.cwd ?? process.cwd();
    const manifest = this.config.file ?? DEFAULT_MANIFEST;

    // Pre-publication: a missing manifest is the common misconfiguration and
    // deserves a start-time rejection rather than a failed run.
    const target = await this.ctx.fs.resolve(manifest, { cwd, signal: request.signal });
    const info = await this.ctx.fs.stat(target, request.signal);
    if (info === undefined) {
      throw new Error(
        `bailian-managed-agent: no manifest at "${target.displayPath}". Create one with ` +
          `\`bl managed-agent init\` and apply it with \`bl managed-agent apply --yes\`.`,
      );
    }

    const prompt = promptText(request.prompt);
    if (prompt.length === 0) {
      throw new Error("bailian-managed-agent: the prompt carried no text content.");
    }

    const argv = ["managed-agent", "session", "run", "--prompt", prompt, "--file", manifest];
    if (this.config.agent !== undefined) argv.push("--agent", this.config.agent);
    if (this.config.provider !== undefined) argv.push("--provider", this.config.provider);

    const controller = new AbortController();
    const abort = (): void => controller.abort();
    request.signal.addEventListener("abort", abort, { once: true });

    // The seam has no deadline of its own — cancellation arrives only through
    // the caller's signal — so the transport owns one, or a wedged hosted
    // session never settles.
    const deadline = AbortSignal.timeout(this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const combined = AbortSignal.any([controller.signal, deadline]);

    // Ownership transfers on fulfillment, so every later failure settles
    // through `result` — which must not reject for child-level problems.
    const result = this.execute(argv, cwd, combined, deadline).finally(() => {
      request.signal.removeEventListener("abort", abort);
    });

    let disposal: Promise<void> | undefined;
    return {
      id: SessionId(`bailian-managed-agent:${crypto.randomUUID()}`),
      localAgent: undefined,
      result,
      dispose: (): Promise<void> => {
        disposal ??= (async (): Promise<void> => {
          controller.abort();
          await result;
        })();
        return disposal;
      },
    };
  }

  private async execute(
    argv: readonly string[],
    cwd: string,
    signal: AbortSignal,
    deadline: AbortSignal,
  ): Promise<SubagentResult> {
    try {
      const response = await runBlJson<SessionRunResponse>(this.ctx, argv, {
        cwd,
        signal,
        graceMs: 10_000,
      });
      return { output: assistantOutput(response.events ?? []), stopReason: "completed" };
    } catch (error) {
      if (deadline.aborted) {
        return {
          output: [
            {
              type: "text",
              text: `the hosted session exceeded ${this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms and was terminated`,
            },
          ],
          stopReason: "error",
        };
      }
      // The CLI emits its JSON envelope only at exit, so a cancelled run has
      // no partial output to salvage.
      if (isAbort(error) || signal.aborted) return { output: [], stopReason: "aborted" };
      const reason = error instanceof Error ? error.message : String(error);
      return { output: [{ type: "text", text: reason }], stopReason: "error" };
    }
  }
}

export function apply(ctx: Context, config: Config): void {
  ctx.subagents.registerProvider(new BailianManagedAgentProvider(ctx, config));
}

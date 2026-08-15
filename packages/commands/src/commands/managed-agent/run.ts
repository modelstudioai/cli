import {
  BailianError,
  defineCommand,
  detectOutputFormat,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult } from "bailian-cli-runtime";
import {
  readProjectRuntime,
  startSessionRun,
  startSessionRunPolling,
  syncAgentResourcesWithStateBackend,
} from "@openagentpack/sdk";
import { CREDENTIALS_NOTE } from "./_engine/config-loader.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";
import {
  buildInlineBackendInput,
  DEFAULT_INLINE_AGENT,
  DEFAULT_INLINE_INSTRUCTIONS,
  DEFAULT_INLINE_MODEL,
} from "./_engine/inline-runtime.ts";
import { renderCollectedEvents, streamAndRenderEvents } from "./_engine/session-render.ts";

const RUN_FLAGS = {
  prompt: {
    type: "string",
    valueHint: "<text>",
    description: "Task to run (required)",
    required: true,
  },
  instructions: {
    type: "string",
    valueHint: "<text>",
    description: "Role/system instructions for the remote agent (default: generic assistant)",
  },
  model: {
    type: "string",
    valueHint: "<id>",
    description: `Model for the remote agent (default: ${DEFAULT_INLINE_MODEL})`,
  },
  agent: {
    type: "string",
    valueHint: "<name>",
    description: `Agent identity to create/reuse (default: ${DEFAULT_INLINE_AGENT})`,
  },
  noStream: {
    type: "switch",
    description: "Use polling instead of SSE streaming",
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "Provision (if needed) a cloud agent and run a task in one step",
  auth: "apiKey",
  usageArgs: "--prompt <text> [--instructions <text>] [--model <id>] [--agent <name>]",
  flags: RUN_FLAGS,
  exampleArgs: [
    '--prompt "Summarize the latest AI news"',
    '--prompt "Audit this dependency tree" --instructions "You are a security expert" --model qwen3.8-max',
  ],
  notes: [
    ...CREDENTIALS_NOTE,
    "Unlike `apply`, this creates/updates the cloud agent + environment on demand without --yes. The first run provisions cloud resources (may incur cost and take longer to start); later runs with the same --agent reuse them.",
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const asJson = format === "json";

    const agentName = flags.agent ?? DEFAULT_INLINE_AGENT;
    const model = flags.model ?? DEFAULT_INLINE_MODEL;
    const instructions = flags.instructions ?? DEFAULT_INLINE_INSTRUCTIONS;

    if (settings.dryRun) {
      emitResult(
        {
          would_run: {
            prompt: flags.prompt,
            agent: agentName,
            model,
            instructions,
            mode: flags.noStream ? "polling" : "streaming",
          },
        },
        format,
      );
      return;
    }

    await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const input = await buildInlineBackendInput(ctx, { agentName, instructions, model });

        // Ensure the remote agent + its cloud environment exist. Idempotent:
        // a repeat run with the same agent name reuses the materialized state.
        if (!asJson) process.stderr.write(`Ensuring cloud agent "${agentName}"…\n`);
        const sync = await syncAgentResourcesWithStateBackend(input, agentName, {
          policy: "force",
          quiet: true,
        });
        if (sync.status !== "completed") {
          const detail =
            sync.error ??
            sync.diagnostics.find((diag) => diag.severity === "error")?.message ??
            `provisioning ended with status "${sync.status}"`;
          throw new BailianError(
            `Failed to provision cloud agent "${agentName}": ${detail}`,
            ExitCode.GENERAL,
          );
        }

        // Run the task inside a runtime bound to the just-materialized state.
        await readProjectRuntime(input, async (runtime) => {
          if (flags.noStream) {
            const run = await startSessionRunPolling(runtime, flags.prompt, { agent: agentName });
            if (!asJson) process.stderr.write(`Session created: ${run.session.id}\n`);
            renderCollectedEvents(run, asJson, {
              session_id: run.session.id,
              provider: run.provider,
              agent: run.agentName,
            });
          } else {
            const run = await startSessionRun(runtime, flags.prompt, { agent: agentName });
            if (!asJson) process.stderr.write(`Session created: ${run.session.id}\n`);
            await streamAndRenderEvents(run.events, asJson, {
              session_id: run.session.id,
              provider: run.provider,
              agent: run.agentName,
            });
          }
        });
      }),
    );
  },
});

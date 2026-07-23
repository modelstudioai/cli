import { defineCommand, detectOutputFormat, type FlagsDef } from "bailian-cli-core";
import { startSessionRun, startSessionRunPolling } from "@openagentpack/sdk";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "./_engine/config-loader.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";
import {
  parseMemoryStores,
  renderCollectedEvents,
  streamAndRenderEvents,
} from "./_engine/session-render.ts";

const SESSION_RUN_FLAGS = {
  prompt: {
    type: "string",
    valueHint: "<text>",
    description: "Prompt to send (required)",
    required: true,
  },
  file: {
    type: "string",
    valueHint: "<path>",
    description: "Config file path (default: agents.yaml)",
  },
  agent: {
    type: "string",
    valueHint: "<name>",
    description: "Agent name (auto-detected when only one agent is configured)",
  },
  environment: {
    type: "string",
    valueHint: "<name>",
    description: "Override agent's declared environment",
  },
  vault: {
    type: "string",
    valueHint: "<name>",
    description: "Override agent's declared vault",
  },
  memoryStores: {
    type: "string",
    valueHint: "<names>",
    description: "Override agent's memory stores (comma-separated)",
  },
  title: { type: "string", valueHint: "<title>", description: "Session title" },
  provider: {
    type: "string",
    valueHint: "<name>",
    description: "Target provider",
  },
  noStream: {
    type: "switch",
    description: "Use polling instead of SSE streaming",
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "Create a session, send a message, and stream the response",
  auth: "none",
  usageArgs: "--prompt <text> [--agent <name>] [--no-stream] [--file <path>]",
  flags: SESSION_RUN_FLAGS,
  exampleArgs: ['--prompt "hello"', '--agent assistant --prompt "summarize this repo"'],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const file = flags.file ?? "agents.yaml";
    const asJson = format === "json";

    const runOptions = {
      agent: flags.agent,
      provider: flags.provider,
      environment: flags.environment,
      vault: flags.vault,
      memoryStores: parseMemoryStores(flags.memoryStores),
      title: flags.title,
    };

    await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, file);
        if (flags.noStream) {
          const run = await startSessionRunPolling(runtime, flags.prompt, runOptions);
          if (!asJson) process.stderr.write(`Session created: ${run.session.id}\n`);
          renderCollectedEvents(run, asJson);
        } else {
          const run = await startSessionRun(runtime, flags.prompt, runOptions);
          if (!asJson) process.stderr.write(`Session created: ${run.session.id}\n`);
          await streamAndRenderEvents(run.events, asJson);
        }
      }),
    );
  },
});

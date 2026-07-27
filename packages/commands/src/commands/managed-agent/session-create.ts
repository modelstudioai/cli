import { defineCommand, detectOutputFormat, type FlagsDef } from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import { createSessionForAgent } from "@openagentpack/sdk";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "./_engine/config-loader.ts";
import { withStdoutProtected } from "./_engine/console-capture.ts";
import { withAgentErrors } from "./_engine/errors.ts";
import { parseMemoryStores } from "./_engine/session-render.ts";

const SESSION_CREATE_FLAGS = {
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
    description: "Target provider (multi-provider agents)",
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "Create a new session for an agent",
  auth: "apiKey",
  // Provider-aware gate: only the session's provider needs credentials.
  authOptional: true,
  usageArgs: "[--agent <name>] [--environment <name>] [--title <title>] [--file <path>]",
  flags: SESSION_CREATE_FLAGS,
  exampleArgs: ["", "--agent assistant", "--agent assistant --title 'debug run'"],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const file = flags.file ?? "agents.yaml";

    if (settings.dryRun) {
      emitResult(
        {
          would_create_session: {
            agent: flags.agent ?? "auto",
            provider: flags.provider ?? "auto",
            environment: flags.environment,
            vault: flags.vault,
            memory_stores: parseMemoryStores(flags.memoryStores),
            title: flags.title,
          },
          config_file: file,
        },
        format,
      );
      return;
    }

    const run = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, file, {
          credentials: flags.provider ?? "targets",
        });
        return createSessionForAgent(runtime, {
          agent: flags.agent,
          provider: flags.provider,
          environment: flags.environment,
          vault: flags.vault,
          memoryStores: parseMemoryStores(flags.memoryStores),
          title: flags.title,
        });
      }),
    );

    const { agentName, session } = run;
    if (format === "json") {
      emitResult({ agent: agentName, session }, format);
      return;
    }
    emitBare(`Session created: ${session.id}`);
    emitBare(`  Agent:       ${agentName}`);
    emitBare(`  Environment: ${session.environment_id}`);
    emitBare(`  Status:      ${session.status}`);
    if (session.vault_ids.length) emitBare(`  Vaults:      ${session.vault_ids.join(", ")}`);
    if (session.memory_store_ids.length) {
      emitBare(`  Memory:      ${session.memory_store_ids.join(", ")}`);
    }
  },
});

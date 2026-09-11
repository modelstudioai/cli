import { getRemoteVault } from "@openagentpack/sdk";
import { defineCommand, detectOutputFormat } from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import { displayValue } from "../_engine/api-helpers.ts";
import { buildAgentRuntime, CREDENTIALS_NOTE } from "../_engine/config-loader.ts";
import { withStdoutProtected } from "../_engine/console-capture.ts";
import { withAgentErrors } from "../_engine/errors.ts";
import { VAULT_GET_FLAGS } from "./_shared.ts";

export default defineCommand({
  description: { "en-US": "Get a Managed Agent vault", "zh-CN": "获取托管 Agent Vault 详情" },
  auth: "apiKey",
  usageArgs: "--vault-id <id>",
  flags: VAULT_GET_FLAGS,
  exampleArgs: ["--vault-id vault_abc"],
  notes: CREDENTIALS_NOTE,
  async run(ctx) {
    const format = detectOutputFormat(ctx.settings.output);
    const vault = await withAgentErrors(() =>
      withStdoutProtected(async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return getRemoteVault(runtime, ctx.flags.vaultId, { provider: "bailian" });
      }),
    );
    if (format === "json") {
      emitResult(vault, format);
      return;
    }
    emitBare(`ID:      ${vault.id}`);
    emitBare(`Name:    ${displayValue(vault.display_name)}`);
    emitBare(`Type:    ${displayValue(vault.type)}`);
    emitBare(`Created: ${displayValue(vault.created_at)}`);
    emitBare(`Updated: ${displayValue(vault.updated_at)}`);
  },
});

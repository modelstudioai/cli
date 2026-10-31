import { getRemoteVault } from "@openagentpack/sdk";
import { defineCommand } from "bailian-cli-core";
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
    const vault = await withAgentErrors(() =>
      withStdoutProtected(ctx, async () => {
        const runtime = await buildAgentRuntime(ctx, ctx.flags.file ?? "agents.yaml");
        return getRemoteVault(runtime, ctx.flags.vaultId, { provider: "bailian" });
      }),
    );
    ctx.output.result(vault, {
      text:
        ctx.settings.output === "text"
          ? (() => {
              const lines: string[] = [];
              lines.push(`ID:      ${vault.id}`);
              lines.push(`Name:    ${displayValue(vault.display_name)}`);
              lines.push(`Type:    ${displayValue(vault.type)}`);
              lines.push(`Created: ${displayValue(vault.created_at)}`);
              lines.push(`Updated: ${displayValue(vault.updated_at)}`);
              return lines.join("\n");
            })()
          : undefined,
    });
  },
});

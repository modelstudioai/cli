import { BailianError, defineCommand, ExitCode, type FlagsDef } from "bailian-cli-core";
import { validateProjectConfig } from "@openagentpack/sdk";
import { OFFLINE_NOTE, resolveAgentProjectConfig } from "./_engine/config-loader.ts";
import { formatAgentDiagnosticFailure, withAgentErrors } from "./_engine/errors.ts";

const VALIDATE_FLAGS = {
  file: {
    type: "string",
    valueHint: "<path>",
    description: {
      "en-US": "Config file path (default: agents.yaml)",
      "zh-CN": "配置文件路径（默认：agents.yaml）",
    },
  },
} satisfies FlagsDef;

export default defineCommand({
  description: {
    "en-US": "Validate an agents.yaml configuration (offline)",
    "zh-CN": "离线验证 agents.yaml 配置",
  },
  auth: "none",
  usageArgs: "[--file <path>]",
  flags: VALIDATE_FLAGS,
  exampleArgs: ["", "--file agents.yaml"],
  notes: OFFLINE_NOTE,
  async run(ctx) {
    const { flags } = ctx;

    const file = flags.file ?? "agents.yaml";

    const diagnostics = await withAgentErrors(async () => {
      const { config } = await resolveAgentProjectConfig(ctx, file, {
        credentials: "none",
      });
      return validateProjectConfig(config);
    });

    const errorCount = diagnostics.filter((diag) => diag.severity === "error").length;

    ctx.output.result(
      { valid: errorCount === 0, diagnostics },
      {
        text:
          ctx.settings.output === "text"
            ? (() => {
                const lines: string[] = [];
                {
                  for (const diag of diagnostics) {
                    const where = diag.resource
                      ? ` (${diag.resource.type}.${diag.resource.name})`
                      : "";
                    lines.push(`[${diag.severity}] ${diag.message}${where}`);
                  }
                  if (errorCount === 0) lines.push("Configuration is valid.");
                }
                return lines.join("\n");
              })()
            : undefined,
      },
    );

    if (errorCount > 0) {
      throw new BailianError(
        formatAgentDiagnosticFailure(diagnostics, `Validation failed with ${errorCount} error(s).`),
        ExitCode.GENERAL,
      );
    }
  },
});

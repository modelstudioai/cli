import {
  BailianError,
  defineCommand,
  detectOutputFormat,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
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
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const file = flags.file ?? "agents.yaml";

    const diagnostics = await withAgentErrors(async () => {
      const { config } = await resolveAgentProjectConfig(ctx, file, {
        credentials: "none",
      });
      return validateProjectConfig(config);
    });

    const errorCount = diagnostics.filter((diag) => diag.severity === "error").length;

    if (format === "json") {
      emitResult({ valid: errorCount === 0, diagnostics }, format);
    } else {
      for (const diag of diagnostics) {
        const where = diag.resource ? ` (${diag.resource.type}.${diag.resource.name})` : "";
        emitBare(`[${diag.severity}] ${diag.message}${where}`);
      }
      if (errorCount === 0) emitBare("Configuration is valid.");
    }

    if (errorCount > 0) {
      throw new BailianError(
        formatAgentDiagnosticFailure(diagnostics, `Validation failed with ${errorCount} error(s).`),
        ExitCode.GENERAL,
      );
    }
  },
});

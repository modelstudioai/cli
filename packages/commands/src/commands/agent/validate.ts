import {
  BailianError,
  defineCommand,
  detectOutputFormat,
  ExitCode,
  type FlagsDef,
} from "bailian-cli-core";
import { emitBare, emitResult } from "bailian-cli-runtime";
import { resolveProjectConfig, validateProjectConfig } from "@openagentpack/sdk";
import { ensureCredentials } from "./_engine/credentials.ts";
import { withAgentErrors } from "./_engine/errors.ts";

const VALIDATE_FLAGS = {
  file: {
    type: "string",
    valueHint: "<path>",
    description: "Config file path (default: agents.yaml)",
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "Validate an agents.yaml configuration (offline)",
  auth: "none",
  usageArgs: "[--file <path>]",
  flags: VALIDATE_FLAGS,
  exampleArgs: ["", "--file agents.yaml"],
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    const file = flags.file ?? "agents.yaml";

    const diagnostics = await withAgentErrors(async () => {
      ensureCredentials();
      const { config } = await resolveProjectConfig(file);
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
      throw new BailianError(`Validation failed with ${errorCount} error(s).`, ExitCode.GENERAL);
    }
  },
});

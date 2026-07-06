import {
  defineCommand,
  detectOutputFormat,
  scaleDeployment,
  BailianError,
  ExitCode,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { failIfMissing, promptConfirm } from "bailian-cli-runtime";
import { emitResult, emitBare } from "bailian-cli-runtime";

/**
 * `bl deploy scale` — adjust capacity (and optional PTU input/output token rates).
 *
 * Server-side capacity constraint: positive integer, < 1000, must be an
 * integer multiple of `base_capacity` (visible via `bl deploy get`).
 */
export default defineCommand({
  description: "Scale a deployment's capacity",
  usageArgs: "--deployed-model <id> --capacity <n> [--input-tpm <n>] [--output-tpm <n>] [--yes]",
  options: [
    {
      flag: "--deployed-model <id>",
      description: "Deployed model identifier (required)",
      required: true,
    },
    {
      flag: "--capacity <n>",
      description: "New capacity in plan units (must be a multiple of base_capacity)",
      type: "number",
    },
    {
      flag: "--input-tpm <n>",
      description: "PTU only — input tokens per minute",
      type: "number",
    },
    {
      flag: "--output-tpm <n>",
      description: "PTU only — output tokens per minute",
      type: "number",
    },
    { flag: "--yes", description: "Skip the confirmation prompt", type: "boolean" },
  ],
  exampleArgs: [
    "--deployed-model qwen-plus-...-b6d61c71 --capacity 8",
    "--deployed-model dep-... --capacity 2 --yes",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const deployedModel = flags.deployedModel as string | undefined;
    if (!deployedModel)
      failIfMissing("deployed-model", "bl deploy scale --deployed-model <id> --capacity <n>");

    const capacity = flags.capacity !== undefined ? (flags.capacity as number) : undefined;
    const inputTpm = flags.inputTpm !== undefined ? (flags.inputTpm as number) : undefined;
    const outputTpm = flags.outputTpm !== undefined ? (flags.outputTpm as number) : undefined;

    if (capacity === undefined && inputTpm === undefined && outputTpm === undefined) {
      throw new BailianError(
        "Provide at least one of --capacity / --input-tpm / --output-tpm.",
        ExitCode.USAGE,
      );
    }

    const format = detectOutputFormat(config.output);
    const body: Record<string, unknown> = {};
    if (capacity !== undefined) body.capacity = capacity;
    if (inputTpm !== undefined) body.input_tpm = inputTpm;
    if (outputTpm !== undefined) body.output_tpm = outputTpm;

    if (config.dryRun) {
      emitResult({ action: "deploy.scale", deployed_model: deployedModel, body }, format);
      return;
    }

    if (!flags.yes && !config.nonInteractive && !config.quiet) {
      const parts: string[] = [];
      if (capacity !== undefined) parts.push(`capacity=${capacity}`);
      if (inputTpm !== undefined) parts.push(`input_tpm=${inputTpm}`);
      if (outputTpm !== undefined) parts.push(`output_tpm=${outputTpm}`);
      process.stderr.write(`Scale deployment ${deployedModel} (${parts.join(", ")})?\n`);
      const ok = await promptConfirm({ message: "Proceed?", initialValue: false });
      if (!ok) {
        emitBare("Cancelled.");
        return;
      }
    } else if (!flags.yes && config.nonInteractive) {
      throw new BailianError(
        "Pass --yes to confirm scaling in non-interactive mode.",
        ExitCode.USAGE,
      );
    }

    const response = await scaleDeployment(config, deployedModel!, body);
    const deployment = response.output ?? response.data;

    if (config.quiet) {
      emitBare(deployedModel!);
    } else if (format === "rich") {
      const cap = deployment?.capacity !== undefined ? ` (capacity=${deployment.capacity})` : "";
      emitBare(`Scaled ${deployedModel}${cap}.`);
    } else {
      emitResult(response, format);
    }
  },
});

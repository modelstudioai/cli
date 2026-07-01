import {
  defineCommand,
  detectOutputFormat,
  createDeployment,
  BailianError,
  ExitCode,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { failIfMissing, promptConfirm } from "bailian-cli-runtime";
import { emitResult, emitBare } from "bailian-cli-runtime";
import { pickPlanStrategy } from "./plans.ts";

/**
 * `bl deploy create` — create a model deployment.
 *
 * Plan-specific behaviour (required flags / body assembly / confirm rows /
 * auto-pick) lives in `plans.ts` (`PlanStrategy` + `STRATEGIES`). This file
 * only handles the shared envelope: argument parsing, dispatch, dry-run,
 * confirmation prompt, and result formatting. Adding a new plan = one entry
 * in the strategy table; nothing here changes.
 *
 * `--model` (model identifier) and `--name` (console display name) are required.
 */
export default defineCommand({
  description: "Create a model deployment",
  usageArgs:
    "--model <model_name> --name <display_name> [--plan <plan>] [--template-id <id>] [--capacity <n>] [--billing-method <m>] [--input-tpm <n>] [--output-tpm <n>] [--thinking-output-tpm <n>] [--yes]",
  options: [
    {
      flag: "--model <name>",
      description: "Model name (catalog model or fine-tuned output) (required)",
      required: true,
    },
    {
      flag: "--name <display_name>",
      description: "Console display name for the deployment (required)",
      required: true,
    },
    {
      flag: "--plan <plan>",
      description: "Billing plan: lora (default, Token-billed) | ptu (Token-billed) | mu",
    },
    {
      flag: "--template-id <id>",
      description: "Template id (only used by plan=mu; auto-picked if omitted)",
    },
    {
      flag: "--capacity <n>",
      description:
        "Resource units (plan=mu only; required by API; defaults to the template's unit)",
      type: "number",
    },
    {
      flag: "--billing-method <m>",
      description: 'Billing method (plan=mu only; default "POST_PAY", the only supported value)',
    },
    {
      flag: "--input-tpm <n>",
      description: "PTU max input tokens/min (required for plan=ptu)",
      type: "number",
    },
    {
      flag: "--output-tpm <n>",
      description: "PTU max output tokens/min (required for plan=ptu)",
      type: "number",
    },
    {
      flag: "--thinking-output-tpm <n>",
      description: "PTU max thinking-output tokens/min (optional, some models)",
      type: "number",
    },
    { flag: "--yes", description: "Skip the confirmation prompt", type: "boolean" },
  ],
  exampleArgs: [
    "--model my-qwen-sft --name my-sft-test",
    "--model qwen3.6-flash-2026-04-16 --name my-flash --plan ptu --input-tpm 10000 --output-tpm 1000",
    "--model qwen3-8b --name my-qwen3-mu --plan mu",
    "--model qwen3-8b --name my-qwen3 --plan mu --template-id MU1 --capacity 2 --yes",
  ],
  notes: [
    "Plan defaults to `lora` (Token-billed). Pass --plan to override.",
    "For plan=ptu (Token-billed, provisioned throughput), --input-tpm and",
    "--output-tpm are required (the platform rejects creation without an",
    "explicit ptu_capacity despite the doc listing defaults).",
    "For plan=mu, `capacity`, `billing_method` and `template_id` are required.",
    "billing_method defaults to POST_PAY (only supported value); template_id",
    "and capacity are auto-picked from GET /deployments/models when omitted.",
    "Use `bl deploy models --source base` to inspect available templates.",
    "After creation, status starts at PENDING and transitions to RUNNING.",
    "Invoke the deployed model with: bl text chat --model <deployed_model>",
    "WARNING: --model is overloaded across commands and refers to DIFFERENT",
    "values. `bl deploy create --model` takes the exported model_name (e.g.",
    "`qwen3-8b-ft-...`), but the create response also returns a `deployed_model`",
    "field (the deployment instance id, e.g. `qwen3-8b-5ecb5f068d79`). The",
    "inference call `bl text chat --model` must use the `deployed_model` from",
    "the create response — NOT the `model_name` you passed to `deploy create`.",
    "Do not reuse the value across the two commands.",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const model = flags.model as string | undefined;
    const name = flags.name as string | undefined;
    if (!model)
      failIfMissing("model", "bl deploy create --model <model_name> --name <display_name>");
    if (!name) failIfMissing("name", "bl deploy create --model <model_name> --name <display_name>");

    const plan = (flags.plan as string | undefined) || "lora";
    const format = detectOutputFormat(config.output);

    // Plan-specific behaviour is owned by `plans.ts`. The strategy:
    //   1. Validates required flags (USAGE error if missing).
    //   2. Resolves the body fragment + confirm rows (mu may auto-pick a
    //      template from the deployable-models catalog).
    // Anything outside the strategy table is rejected with a USAGE error.
    const strategy = pickPlanStrategy(plan);
    strategy.validateFlags(flags);
    const resolved = await strategy.resolve({ config, flags, model: model!, name: name! });
    const body: Record<string, unknown> = {
      model_name: model!,
      name: name!,
      plan,
      ...resolved.body,
    };

    if (config.dryRun) {
      emitResult({ action: "deploy.create", body }, format);
      return;
    }

    if (!flags.yes && !config.nonInteractive && !config.quiet) {
      const lines = [
        "Create deployment:",
        `  model:        ${model}`,
        `  name:         ${name}`,
        `  plan:         ${plan}${resolved.planLabelSuffix ?? ""}`,
        ...resolved.confirmRows,
      ];
      process.stderr.write(lines.join("\n") + "\n");
      const ok = await promptConfirm({ message: "Proceed?", initialValue: true });
      if (!ok) {
        emitBare("Cancelled.");
        return;
      }
    } else if (!flags.yes && config.nonInteractive) {
      throw new BailianError(
        "Pass --yes to confirm deployment creation in non-interactive mode.",
        ExitCode.USAGE,
      );
    }

    const response = await createDeployment(config, body as never);
    const deployment = response.output ?? response.data;

    if (config.quiet) {
      emitBare(deployment?.deployed_model ?? "");
    } else if (format === "text") {
      emitBare(`Created deployment.`);
      if (deployment?.deployed_model) emitBare(`  deployed_model:  ${deployment.deployed_model}`);
      if (deployment?.status) emitBare(`  status:          ${deployment.status}`);
      if (deployment?.plan) emitBare(`  plan:            ${deployment.plan}`);
      emitBare(
        `\nNext: track readiness with: bl deploy get --deployed-model ${deployment?.deployed_model ?? "<id>"}`,
      );
    } else {
      emitResult(response, format);
    }
  },
});

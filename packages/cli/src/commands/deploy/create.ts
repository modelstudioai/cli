import {
  defineCommand,
  detectOutputFormat,
  createDeployment,
  listDeployableModels,
  BailianError,
  ExitCode,
  type Config,
  type GlobalFlags,
} from "bailian-cli-core";
import { failIfMissing, promptConfirm } from "../../output/prompt.ts";
import { emitResult, emitBare } from "../../output/output.ts";

/**
 * `bl deploy create` — create a model deployment.
 *
 * Plan handling:
 *   - lora (default): Token-billed; `capacity` is required by API but ignored.
 *   - ptu:           Token-billed (provisioned throughput); requires
 *                     `ptu_capacity` {input_tpm, output_tpm}. The doc says
 *                     these default to 10000/1000 when omitted, but the platform
 *                     currently rejects creation without them ("Miss ptu capacity
 *                     info"), so the CLI requires --input-tpm/--output-tpm for ptu.
 *   - mu:             Unit-based; requires `capacity`, `billing_method` and a
 *                     `template_id`. `billing_method` defaults to "POST_PAY"
 *                     (the only value the platform currently supports). If
 *                     --template-id is omitted, the CLI auto-picks the template
 *                     returned by GET /deployments/models whose charge_type
 *                     matches billing_method; --capacity defaults to that
 *                     template's `capacity_unit_per_instance` (the smallest
 *                     valid multiple of base_capacity).
 *
 * `--model` (model identifier) and `--name` (console display name) are required.
 */
export default defineCommand({
  name: "deploy create",
  description: "Create a model deployment",
  usage:
    "bl deploy create --model <model_name> --name <display_name> [--plan <plan>] [--template-id <id>] [--capacity <n>] [--billing-method <m>] [--input-tpm <n>] [--output-tpm <n>] [--thinking-output-tpm <n>] [--yes]",
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
  examples: [
    "bl deploy create --model my-qwen-sft --name my-sft-test",
    "bl deploy create --model qwen3.6-flash-2026-04-16 --name my-flash --plan ptu --input-tpm 10000 --output-tpm 1000",
    "bl deploy create --model qwen3-8b --name my-qwen3-mu --plan mu",
    "bl deploy create --model qwen3-8b --name my-qwen3 --plan mu --template-id MU1 --capacity 2 --yes",
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
    let templateId = flags.templateId as string | undefined;
    const inputTpm = flags.inputTpm as number | undefined;
    const outputTpm = flags.outputTpm as number | undefined;
    const thinkingOutputTpm = flags.thinkingOutputTpm as number | undefined;
    // mu-only: capacity (resource units) and billing_method (default POST_PAY,
    // the only value the platform currently supports per the deploy doc).
    let capacity = flags.capacity as number | undefined;
    const billingMethod = (flags.billingMethod as string | undefined) || "POST_PAY";

    const format = detectOutputFormat(config.output);

    // Validate plan. The catalog lists plan names like `ptu_v2`, but the create
    // endpoint only accepts `ptu` — so reject anything outside the supported set
    // with a clear message instead of letting the API fail with a vague error.
    const SUPPORTED_PLANS = ["lora", "ptu", "mu"] as const;
    if (!(SUPPORTED_PLANS as readonly string[]).includes(plan)) {
      throw new BailianError(
        `Unsupported plan "${plan}". Supported plans: ${SUPPORTED_PLANS.join(", ")}.`,
        ExitCode.USAGE,
      );
    }

    // For plan=ptu, require throughput limits. The platform rejects creation
    // without an explicit ptu_capacity ("Miss ptu capacity info") even though
    // the doc lists 10000/1000 defaults.
    if (plan === "ptu") {
      if (inputTpm === undefined)
        failIfMissing(
          "input-tpm",
          "bl deploy create --plan ptu --model <m> --name <n> --input-tpm <n> --output-tpm <n>",
        );
      if (outputTpm === undefined)
        failIfMissing(
          "output-tpm",
          "bl deploy create --plan ptu --model <m> --name <n> --input-tpm <n> --output-tpm <n>",
        );
    }

    // For plan=mu, auto-pick the template (preferring the one whose charge_type
    // matches billing_method) and default capacity to the template's unit.
    // Skip the catalog lookup when the user supplies --template-id explicitly —
    // the model may be a fine-tuned custom model not present in the base
    // catalog, and the lookup would otherwise throw a spurious error.
    let autoPickedTemplate = false;
    if (plan === "mu" && !config.dryRun && !templateId) {
      try {
        const resp = await listDeployableModels(config, {
          modelSource: "base",
          pageSize: 100,
          version: "v1.0",
        });
        const payload = resp.output ?? resp.data;
        const target = (payload?.models ?? []).find((m) => m.model_name === model);
        const muPlan = target?.plans?.find((p) => p.plan === "mu");
        const templates = muPlan?.templates ?? [];
        if (templates.length === 0) {
          throw new BailianError(
            `No mu-plan template found for model "${model}". ` +
              `Run \`bl deploy models --source base\` to inspect available models, ` +
              `or pass --template-id explicitly.`,
            ExitCode.USAGE,
          );
        }
        // POST_PAY → post_paid template; fall back to the first available.
        const wantChargeType = billingMethod === "POST_PAY" ? "post_paid" : "pre_paid";
        const picked = templates.find((t) => t.charge_type === wantChargeType) ?? templates[0];
        if (!picked?.template_id) {
          throw new BailianError(
            `No mu-plan template found for model "${model}". ` +
              `Run \`bl deploy models --source base\` to inspect available models, ` +
              `or pass --template-id explicitly.`,
            ExitCode.USAGE,
          );
        }
        templateId = picked.template_id;
        autoPickedTemplate = true;
        // capacity must be a multiple of base_capacity; default to the template's
        // unit (capacity_unit_per_instance) which is the smallest valid value.
        if (capacity === undefined) {
          capacity = picked.roles?.unified?.capacity_unit_per_instance ?? 1;
        }
      } catch (e) {
        if (e instanceof BailianError) throw e;
        throw new BailianError(
          `Failed to auto-pick template for plan=mu: ${(e as Error).message}. ` +
            `Pass --template-id explicitly.`,
          ExitCode.USAGE,
        );
      }
    }

    const body: Record<string, unknown> = {
      model_name: model!,
      name: name!,
      plan,
    };
    if (plan === "ptu") {
      const ptuCapacity: Record<string, number> = {
        input_tpm: inputTpm!,
        output_tpm: outputTpm!,
      };
      if (thinkingOutputTpm !== undefined) ptuCapacity.thinking_output_tpm = thinkingOutputTpm;
      body.ptu_capacity = ptuCapacity;
    } else if (plan === "mu") {
      // mu requires capacity, billing_method and template_id (auto-picked above
      // if --template-id was not supplied).
      body.capacity = capacity ?? 1;
      body.billing_method = billingMethod;
      if (templateId) body.template_id = templateId;
    } else {
      // lora: capacity required by API but ignored (per the working example).
      body.capacity = 1;
    }

    if (config.dryRun) {
      emitResult({ action: "deploy.create", body }, format);
      return;
    }

    if (!flags.yes && !config.nonInteractive && !config.quiet) {
      const lines = [
        "Create deployment:",
        `  model:        ${model}`,
        `  name:         ${name}`,
        `  plan:         ${plan}${plan === "lora" ? " (Token-billed)" : plan === "ptu" ? " (Token-billed, provisioned throughput)" : ""}`,
      ];
      if (templateId) {
        const hint = autoPickedTemplate ? " (auto-picked)" : "";
        lines.push(`  template_id:  ${templateId}${hint}`);
      }
      if (plan === "mu") {
        lines.push(`  capacity:     ${capacity ?? 1}`);
        lines.push(`  billing_method: ${billingMethod}`);
      }
      if (plan === "ptu") {
        lines.push(`  input_tpm:    ${inputTpm}`);
        lines.push(`  output_tpm:   ${outputTpm}`);
        if (thinkingOutputTpm !== undefined)
          lines.push(`  thinking_output_tpm: ${thinkingOutputTpm}`);
      }
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

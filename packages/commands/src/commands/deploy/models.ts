import {
  defineCommand,
  detectOutputFormat,
  listDeployableModels,
  type FlagsDef,
} from "bailian-cli-core";
import { emitResult, emitBare, formatTable } from "bailian-cli-runtime";

const MODELS_FLAGS = {
  page: { type: "number", valueHint: "<n>", description: "Page number (default: 1)" },
  pageSize: {
    type: "number",
    valueHint: "<n>",
    description: "Results per page (default: 100)",
  },
  // 全局 --version 是保留 flag,目录版本过滤改名 --catalog-version。
  catalogVersion: {
    type: "string",
    valueHint: "<v>",
    description: "Catalog version filter (default: v1.0; required for new catalog models)",
  },
  source: {
    type: "string",
    valueHint: "<s>",
    description: "Model source filter: custom (fine-tuned) | base (catalog) | public",
  },
} satisfies FlagsDef;

export default defineCommand({
  description: "List models available for deployment",
  auth: "apiKey",
  usageArgs: "[--page <n>] [--page-size <n>] [--catalog-version <v>] [--source <custom|public>]",
  flags: MODELS_FLAGS,
  exampleArgs: [
    "",
    "--source base",
    "--source custom --page-size 50",
    "--catalog-version v1.0 --output json",
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = detectOutputFormat(settings.output);
    // Default version to v1.0 — without it, the API returns the legacy catalog
    // (only old fine-tune outputs). Pass --catalog-version "" to opt out.
    const version = flags.catalogVersion === "" ? undefined : (flags.catalogVersion ?? "v1.0");
    const modelSource = flags.source || undefined;

    if (settings.dryRun) {
      emitResult(
        {
          action: "deploy.models",
          page: flags.page,
          page_size: flags.pageSize,
          version,
          model_source: modelSource,
        },
        format,
      );
      return;
    }

    const response = await listDeployableModels(ctx.client, {
      pageNo: flags.page,
      pageSize: flags.pageSize,
      version,
      modelSource,
    });
    const payload = response.output ?? response.data;
    const models = payload?.models ?? [];
    const total = payload?.total;

    // Two response shapes:
    //   - custom (fine-tuned): top-level supported_plans: string[]
    //   - base (catalog):      plans: [{plan, templates?, cu_specs?}]
    // For json: surface the deployment-relevant fields preserved as a tree, so
    // downstream tooling can drive `bl deploy <modality> create --deploy-spec <…>`
    // without a second round-trip. For text: keep the compact one-line summary.
    if (format === "json") {
      const items = models.map((model) => {
        const out: Record<string, unknown> = {
          model_name: model.model_name ?? "",
        };
        if (model.base_model) out.base_model = model.base_model;
        if (model.model_source) out.model_source = model.model_source;
        if (model.supported_plans && model.supported_plans.length > 0) {
          out.supported_plans = model.supported_plans;
        }
        if (model.plans && model.plans.length > 0) {
          out.plans = model.plans.map((plan) => {
            const planEntry: Record<string, unknown> = { plan: plan.plan ?? "" };
            if (plan.cu_specs && plan.cu_specs.length > 0) {
              planEntry.cu_specs = plan.cu_specs;
            }
            if (plan.templates && plan.templates.length > 0) {
              // Pull the top 6 fields most useful for `bl deploy <modality> create`.
              // Drop noisy/redundant: template_source, template_type,
              // template_version, deploy_spec (typically == template_id).
              planEntry.templates = plan.templates.map((template) => {
                const tpl: Record<string, unknown> = {};
                if (template.template_id) tpl.template_id = template.template_id;
                if (template.template_name) tpl.template_name = template.template_name;
                if (template.charge_type) tpl.charge_type = template.charge_type;
                // Flatten roles.unified for the common COUPLED case.
                const unified = template.roles?.unified;
                if (unified?.model_unit_spec) tpl.model_unit_spec = unified.model_unit_spec;
                if (unified?.capacity_unit_per_instance !== undefined)
                  tpl.capacity_unit_per_instance = unified.capacity_unit_per_instance;
                // Preserve split-role configs (SEPERATED) as-is so callers
                // can still drive prefill/decode sizing.
                if (template.roles?.prefill || template.roles?.decode) {
                  tpl.roles = {
                    prefill: template.roles?.prefill,
                    decode: template.roles?.decode,
                  };
                }
                if (template.template_desc) tpl.template_desc = template.template_desc;
                return tpl;
              });
            }
            return planEntry;
          });
        }
        return out;
      });
      emitResult({ items, total }, format);
      return;
    }

    // text / quiet — keep the compact single-line summary table.
    const textItems = models.map((model) => {
      let plansSummary = "";
      if (model.supported_plans && model.supported_plans.length > 0) {
        plansSummary = model.supported_plans.join(",");
      } else if (model.plans && model.plans.length > 0) {
        plansSummary = model.plans
          .map((plan) => {
            const planName = plan.plan ?? "?";
            if (plan.templates && plan.templates.length > 0) {
              return `${planName}(${plan.templates.length}t)`;
            }
            if (plan.cu_specs && plan.cu_specs.length > 0) {
              return `${planName}(${plan.cu_specs.join("/")})`;
            }
            return planName;
          })
          .join(",");
      } else {
        plansSummary = "-";
      }
      return {
        model_name: model.model_name ?? "",
        base_model: model.base_model ?? "",
        source: model.model_source ?? "",
        plans: plansSummary,
      };
    });

    if (textItems.length === 0) {
      emitBare("No deployable models found.");
      return;
    }
    const headers = ["MODEL_NAME", "BASE_MODEL", "SOURCE", "PLANS"];
    const rows = textItems.map((item) => [
      item.model_name,
      item.base_model,
      item.source,
      item.plans,
    ]);
    for (const line of formatTable(headers, rows)) emitBare(line);
    if (total !== undefined) emitBare(`\nTotal: ${total}`);
  },
});

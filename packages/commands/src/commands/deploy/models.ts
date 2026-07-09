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
    // downstream tooling can drive `bl deploy create --template-id <…>` without
    // a second round-trip. For text: keep the compact one-line summary.
    if (format === "json") {
      const items = models.map((m) => {
        const out: Record<string, unknown> = {
          model_name: m.model_name ?? "",
        };
        if (m.base_model) out.base_model = m.base_model;
        if (m.model_source) out.model_source = m.model_source;
        if (m.supported_plans && m.supported_plans.length > 0) {
          out.supported_plans = m.supported_plans;
        }
        if (m.plans && m.plans.length > 0) {
          out.plans = m.plans.map((p) => {
            const planEntry: Record<string, unknown> = { plan: p.plan ?? "" };
            if (p.cu_specs && p.cu_specs.length > 0) {
              planEntry.cu_specs = p.cu_specs;
            }
            if (p.templates && p.templates.length > 0) {
              // Pull the top 6 fields most useful for `bl deploy create`.
              // Drop noisy/redundant: template_source, template_type,
              // template_version, deploy_spec (typically == template_id).
              planEntry.templates = p.templates.map((t) => {
                const tpl: Record<string, unknown> = {};
                if (t.template_id) tpl.template_id = t.template_id;
                if (t.template_name) tpl.template_name = t.template_name;
                if (t.charge_type) tpl.charge_type = t.charge_type;
                // Flatten roles.unified for the common COUPLED case.
                const unified = t.roles?.unified;
                if (unified?.model_unit_spec) tpl.model_unit_spec = unified.model_unit_spec;
                if (unified?.capacity_unit_per_instance !== undefined)
                  tpl.capacity_unit_per_instance = unified.capacity_unit_per_instance;
                // Preserve split-role configs (SEPERATED) as-is so callers
                // can still drive prefill/decode sizing.
                if (t.roles?.prefill || t.roles?.decode) {
                  tpl.roles = {
                    prefill: t.roles?.prefill,
                    decode: t.roles?.decode,
                  };
                }
                if (t.template_desc) tpl.template_desc = t.template_desc;
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
    const textItems = models.map((m) => {
      let plansSummary = "";
      if (m.supported_plans && m.supported_plans.length > 0) {
        plansSummary = m.supported_plans.join(",");
      } else if (m.plans && m.plans.length > 0) {
        plansSummary = m.plans
          .map((p) => {
            const planName = p.plan ?? "?";
            if (p.templates && p.templates.length > 0) {
              return `${planName}(${p.templates.length}t)`;
            }
            if (p.cu_specs && p.cu_specs.length > 0) {
              return `${planName}(${p.cu_specs.join("/")})`;
            }
            return planName;
          })
          .join(",");
      } else {
        plansSummary = "-";
      }
      return {
        model_name: m.model_name ?? "",
        base_model: m.base_model ?? "",
        source: m.model_source ?? "",
        plans: plansSummary,
      };
    });

    if (textItems.length === 0) {
      emitBare("No deployable models found.");
      return;
    }
    const headers = ["MODEL_NAME", "BASE_MODEL", "SOURCE", "PLANS"];
    const rows = textItems.map((i) => [i.model_name, i.base_model, i.source, i.plans]);
    for (const line of formatTable(headers, rows)) emitBare(line);
    if (total !== undefined) emitBare(`\nTotal: ${total}`);
  },
});

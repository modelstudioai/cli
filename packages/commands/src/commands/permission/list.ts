import { defineCommand, detectOutputFormat, modelsPermissionsPath } from "bailian-cli-core";
import { emitResult, renderBoxTable } from "bailian-cli-runtime";
import { buildQuery } from "../shared/params.ts";

// ---------------------------------------------------------------------------
// Types — mirror GET /api/v1/models/permissions
// ---------------------------------------------------------------------------

interface PermissionDetail {
  inference?: boolean | null;
  fine_tune?: boolean | null;
  deploy?: boolean | null;
}

interface ModelPermission {
  model: string;
  name?: string;
  permissions?: PermissionDetail;
}

interface PermissionsResponse {
  output?: {
    total?: number;
    page_no?: number;
    page_size?: number;
    permissions?: ModelPermission[];
  };
  request_id?: string;
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/** Tri-state permission cell: true → yes, false → no, null/undefined → "-". */
function formatGrant(granted: boolean | null | undefined): string {
  if (granted == null) return "-";
  return granted ? "yes" : "no";
}

function printTable(permissions: ModelPermission[], total: number, emptyHint: string): void {
  if (permissions.length === 0) {
    process.stdout.write(`No model permissions found.\n${emptyHint}\n`);
    return;
  }
  const headers = ["Model", "Name", "Inference", "Fine-tune", "Deploy"];
  const rows = permissions.map((entry) => [
    entry.model,
    entry.name ?? "-",
    formatGrant(entry.permissions?.inference),
    formatGrant(entry.permissions?.fine_tune),
    formatGrant(entry.permissions?.deploy),
  ]);
  const lines = renderBoxTable({
    headers,
    rows,
    align: ["left", "left", "right", "right", "right"],
  });
  for (const line of lines) process.stdout.write(line + "\n");
  process.stdout.write(`\nTotal: ${total}\n`);
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export default defineCommand({
  description: {
    "en-US": "List model permissions (inference / fine-tune / deploy) in the workspace",
    "zh-CN": "列出 Workspace 中的模型权限（推理 / 微调 / 部署）",
  },
  auth: "apiKey",
  usageArgs: "[--scope <scope>] [--model <model>] [--name <name>] [--page <n>] [--page-size <n>]",
  flags: {
    scope: {
      type: "string",
      valueHint: "<scope>",
      choices: ["authorized", "authorizable"] as const,
      description: {
        "en-US": "Authorization scope: authorizable (default, full catalog), authorized",
        "zh-CN": "授权范围：authorizable（默认，完整目录）、authorized（已授权）",
      },
    },
    model: {
      type: "string",
      valueHint: "<model>",
      description: { "en-US": "Model ID (exact match)", "zh-CN": "模型 ID（精确匹配）" },
    },
    name: {
      type: "string",
      valueHint: "<name>",
      description: {
        "en-US": "Fuzzy search by model name or ID",
        "zh-CN": "按模型名称或 ID 模糊搜索",
      },
    },
    page: {
      type: "number",
      valueHint: "<n>",
      description: { "en-US": "Page number (default: 1)", "zh-CN": "页码（默认：1）" },
    },
    pageSize: {
      type: "number",
      valueHint: "<n>",
      description: {
        "en-US": "Results per page (default: 20)",
        "zh-CN": "每页结果数（默认：20）",
      },
    },
  },
  exampleArgs: [
    "",
    "--model qwen-plus",
    "--scope authorized",
    "--name qwen --page-size 50",
    "--output text",
  ],
  notes: [
    {
      "en-US":
        "Default scope is `authorizable` (the full grantable catalog); use `--scope authorized` to see only models already granted.",
      "zh-CN":
        "默认范围为 `authorizable`（完整可授权目录）；使用 `--scope authorized` 仅查看已授权模型。",
    },
    {
      "en-US":
        "Output defaults to JSON; pass `--output text` for a table. Permission values are tri-state: true / false / null (never set).",
      "zh-CN":
        "默认输出 JSON；传入 `--output text` 可查看表格。权限值为三态：true / false / null（从未设置）。",
    },
    {
      "en-US":
        "Values mirror the server's grant records as-is for the workspace bound to your API key. A model reporting false/null can still be callable (access may come from other channels); see the Model Studio authorization docs for the exact semantics.",
      "zh-CN":
        "这些值原样反映 API Key 所绑定 Workspace 的服务端授权记录。显示 false/null 的模型仍可能可以调用（访问权限可能来自其他渠道）；准确语义请参阅百炼模型授权文档。",
    },
  ],
  async run(ctx) {
    const { settings, flags } = ctx;
    const format = settings.outputExplicit ? detectOutputFormat(settings.output) : "json";
    const scope = flags.scope ?? "authorizable";

    const query = {
      authorization_scope: scope.toUpperCase(),
      model: flags.model || undefined,
      name: flags.name || undefined,
      page_no: flags.page || 1,
      page_size: flags.pageSize || 20,
    };

    if (settings.dryRun) {
      emitResult(
        { endpoint: ctx.client.url(modelsPermissionsPath()), method: "GET", query },
        format,
      );
      return;
    }

    const resp = await ctx.client.requestJson<PermissionsResponse>({
      path: modelsPermissionsPath() + buildQuery(query),
    });
    const permissions = resp.output?.permissions ?? [];
    const total = resp.output?.total ?? permissions.length;

    if (format === "json") {
      emitResult({ items: permissions, total }, format);
      return;
    }

    // The default authorized view is empty until something is granted — point
    // at the authorizable catalog instead of ending with a bare "nothing".
    const binName = ctx.identity.binName;
    const emptyHint =
      scope === "authorized"
        ? `Nothing granted yet in this workspace. Browse grantable models with \`${binName} permission list --scope authorizable\`, then grant with \`${binName} permission grant --model <model>\`.`
        : `Adjust --name/--model filters, or check pagination with --page/--page-size.`;

    printTable(permissions, total, emptyHint);
  },
});

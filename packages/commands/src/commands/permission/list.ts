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
  description: "List model permissions (inference / fine-tune / deploy) in the workspace",
  auth: "apiKey",
  usageArgs: "[--scope <scope>] [--model <model>] [--name <name>] [--page <n>] [--page-size <n>]",
  flags: {
    scope: {
      type: "string",
      valueHint: "<scope>",
      choices: ["authorized", "authorizable"] as const,
      description: "Authorization scope: authorizable (default, full catalog), authorized",
    },
    model: {
      type: "string",
      valueHint: "<model>",
      description: "Model ID (exact match)",
    },
    name: {
      type: "string",
      valueHint: "<name>",
      description: "Fuzzy search by model name or ID",
    },
    page: { type: "number", valueHint: "<n>", description: "Page number (default: 1)" },
    pageSize: { type: "number", valueHint: "<n>", description: "Results per page (default: 20)" },
  },
  exampleArgs: [
    "",
    "--model qwen-plus",
    "--scope authorized",
    "--name qwen --page-size 50",
    "--output text",
  ],
  notes: [
    "Default scope is `authorizable` (the full grantable catalog); use `--scope authorized` to see only models already granted.",
    "Output defaults to JSON; pass `--output text` for a table. Permission values are tri-state: true / false / null (never set).",
    "Values mirror the server's grant records as-is for the workspace bound to your API key. A model reporting false/null can still be callable (access may come from other channels); see the Model Studio authorization docs for the exact semantics.",
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

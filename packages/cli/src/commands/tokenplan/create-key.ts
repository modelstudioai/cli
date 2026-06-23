import {
  defineCommand,
  buildCanonicalQuery,
  signRequest,
  modelStudioHost,
  detectOutputFormat,
  maskToken,
  trackingHeaders,
  type Config,
  type GlobalFlags,
  type CreateTokenPlanKeyResponse,
  BailianError,
  ExitCode,
} from "bailian-cli-core";
import { emitResult, emitBare } from "../../output/output.ts";
import { padEnd } from "../../output/cjk-width.ts";

const API_VERSION = "2026-02-10";
const API_ACTION = "CreateTokenPlanKey";
const API_PATH = "/tokenplan/api-keys";

export default defineCommand({
  name: "tokenplan create-key",
  description: "Create a Token Plan API key for a seat",
  usage: "bl tokenplan create-key --account-id <id> --workspace-id <id> [flags]",
  options: [
    { flag: "--account-id <id>", description: "Target member account ID", required: true },
    {
      flag: "--workspace-id <id>",
      description: "Workspace ID (env: BAILIAN_WORKSPACE_ID, config: workspace_id)",
    },
    { flag: "--description <text>", description: "API key description" },
    {
      flag: "--caller-uac-account-id <id>",
      description: "Caller UAC account ID",
    },
    {
      flag: "--namespace-id <id>",
      description: "Product namespace ID (Token Plan default: namespace-1)",
    },
    { flag: "--access-key-id <key>", description: "Alibaba Cloud Access Key ID (deprecated)" },
    {
      flag: "--access-key-secret <key>",
      description: "Alibaba Cloud Access Key Secret (deprecated)",
    },
  ],
  examples: [
    "bl tokenplan create-key --account-id acc_123 --workspace-id ws_456",
    "bl tokenplan create-key --account-id acc_123 --workspace-id ws_456 --description 'Dev key'",
  ],
  async run(config: Config, flags: GlobalFlags) {
    const format = detectOutputFormat(config.output);
    const accessKeyId = (flags.accessKeyId as string) || config.accessKeyId;
    const accessKeySecret = (flags.accessKeySecret as string) || config.accessKeySecret;

    if (!accessKeyId || !accessKeySecret) {
      throw new BailianError(
        "No credentials found.\n" +
          "Set ALIBABA_CLOUD_ACCESS_KEY_ID and ALIBABA_CLOUD_ACCESS_KEY_SECRET.",
        ExitCode.AUTH,
      );
    }

    const accountId = flags.accountId as string | undefined;
    const workspaceId = (flags.workspaceId as string) || config.workspaceId;
    if (!accountId) {
      throw new BailianError("Missing required argument --account-id.", ExitCode.USAGE);
    }
    if (!workspaceId) {
      throw new BailianError(
        "Missing workspace ID.\n" +
          "Set via: --workspace-id flag, env: BAILIAN_WORKSPACE_ID, or config: bl config set workspace_id <id>",
        ExitCode.USAGE,
      );
    }

    const queryParams = buildQueryParams(flags, { accountId, workspaceId });
    const queryString = buildCanonicalQuery(queryParams);
    const host = modelStudioHost(config.region);
    const endpoint = `https://${host}${API_PATH}${queryString ? `?${queryString}` : ""}`;

    if (config.dryRun) {
      emitResult({ endpoint, query: queryParams }, format);
      return;
    }

    const headers = signRequest({
      accessKeyId,
      accessKeySecret,
      action: API_ACTION,
      version: API_VERSION,
      body: "",
      host,
      pathname: API_PATH,
      method: "POST",
      queryString,
    });

    if (config.verbose) {
      process.stderr.write(`> POST ${endpoint}\n`);
      process.stderr.write(`> AK: ${maskToken(accessKeyId)}\n`);
    }

    const timeoutMs = config.timeout * 1000;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { ...headers, ...trackingHeaders() },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (config.verbose) {
      process.stderr.write(`< ${res.status} ${res.statusText}\n`);
    }

    const data = (await res.json()) as CreateTokenPlanKeyResponse;

    if (!res.ok || data.Success === false) {
      throw new BailianError(
        `${data.Code || res.status} - ${data.Message || res.statusText}`,
        ExitCode.GENERAL,
      );
    }

    if (config.quiet || format === "text") {
      emitTextKey(data);
    } else {
      emitResult(data, format);
    }
  },
});

function buildQueryParams(
  flags: GlobalFlags,
  resolved: { accountId: string; workspaceId: string },
): Record<string, string | string[] | undefined> {
  const params: Record<string, string | string[] | undefined> = {};

  params.AccountId = resolved.accountId;
  params.WorkspaceId = resolved.workspaceId;
  if (flags.description) params.Description = flags.description as string;
  if (flags.callerUacAccountId) params.CallerUacAccountId = flags.callerUacAccountId as string;
  if (flags.namespaceId) params.NamespaceId = flags.namespaceId as string;

  return params;
}

function emitTextKey(data: CreateTokenPlanKeyResponse): void {
  const item = data.Data;
  if (!item) {
    emitBare("API key created.");
    return;
  }

  emitBare(`${padEnd("ApiKeyId", 14)} ${item.ApiKeyId ?? "-"}`);
  emitBare(`${padEnd("MaskedApiKey", 14)} ${item.MaskedApiKey ?? "-"}`);
  if (item.Description) {
    emitBare(`${padEnd("Description", 14)} ${item.Description}`);
  }
  if (item.PlainApiKey) {
    emitBare("");
    emitBare(`PlainApiKey (shown once): ${item.PlainApiKey}`);
  }
}

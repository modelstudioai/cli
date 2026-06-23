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
  type BatchAssignSeatsResponse,
  BailianError,
  ExitCode,
} from "bailian-cli-core";
import { emitResult, emitBare } from "../../output/output.ts";

const API_VERSION = "2026-02-10";
const API_ACTION = "BatchAssignSeats";
const API_PATH = "/tokenplan/subscription/seat-assignments";

export default defineCommand({
  name: "tokenplan assign-seats",
  description: "Batch assign Token Plan seats to members",
  usage:
    "bl tokenplan assign-seats --workspace-id <id> --seat-type <type> --account-id <id> [flags]",
  options: [
    {
      flag: "--workspace-id <id>",
      description: "Workspace ID (env: BAILIAN_WORKSPACE_ID, config: workspace_id)",
    },
    {
      flag: "--seat-type <type>",
      description: "Seat tier: standard, pro, or max",
      required: true,
    },
    {
      flag: "--account-id <id>",
      description: "Target member account ID (repeatable)",
      type: "array",
    },
    {
      flag: "--caller-uac-account-id <id>",
      description: "Caller UAC account ID",
    },
    {
      flag: "--namespace-id <id>",
      description: "Product namespace ID (Token Plan default: namespace-1)",
    },
    {
      flag: "--locale <locale>",
      description: "Language: zh-CN or en-US",
    },
    { flag: "--access-key-id <key>", description: "Alibaba Cloud Access Key ID (deprecated)" },
    {
      flag: "--access-key-secret <key>",
      description: "Alibaba Cloud Access Key Secret (deprecated)",
    },
  ],
  examples: [
    "bl tokenplan assign-seats --workspace-id ws_456 --seat-type standard --account-id acc_123",
    "bl tokenplan assign-seats --workspace-id ws_456 --seat-type pro --account-id acc_1 --account-id acc_2",
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

    const workspaceId = (flags.workspaceId as string) || config.workspaceId;
    const seatType = flags.seatType as string | undefined;
    if (!workspaceId) {
      throw new BailianError(
        "Missing workspace ID.\n" +
          "Set via: --workspace-id flag, env: BAILIAN_WORKSPACE_ID, or config: bl config set workspace_id <id>",
        ExitCode.USAGE,
      );
    }
    if (!seatType) {
      throw new BailianError("Missing required argument --seat-type.", ExitCode.USAGE);
    }

    const accountIds = flags.accountId;
    const hasAccountIds =
      (Array.isArray(accountIds) && accountIds.length > 0) ||
      (typeof accountIds === "string" && accountIds.length > 0);
    if (!hasAccountIds) {
      throw new BailianError("Missing required argument --account-id.", ExitCode.USAGE);
    }

    const queryParams = buildQueryParams(flags, workspaceId);
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

    const data = (await res.json()) as BatchAssignSeatsResponse;

    if (!res.ok || data.Success === false) {
      throw new BailianError(
        `${data.Code || res.status} - ${data.Message || res.statusText}`,
        ExitCode.GENERAL,
      );
    }

    if (config.quiet || format === "text") {
      emitBare("Seats assigned successfully.");
    } else {
      emitResult(data, format);
    }
  },
});

function buildQueryParams(
  flags: GlobalFlags,
  workspaceId: string,
): Record<string, string | string[] | undefined> {
  const params: Record<string, string | string[] | undefined> = {};

  params.WorkspaceId = workspaceId;
  if (flags.seatType) params.SeatType = flags.seatType as string;
  if (flags.callerUacAccountId) params.CallerUacAccountId = flags.callerUacAccountId as string;
  if (flags.namespaceId) params.NamespaceId = flags.namespaceId as string;
  if (flags.locale) params.Locale = flags.locale as string;

  const accountIds = flags.accountId as string | string[] | undefined;
  if (Array.isArray(accountIds) && accountIds.length > 0) {
    params.AccountIds = accountIds;
  } else if (typeof accountIds === "string" && accountIds.length > 0) {
    params.AccountIds = accountIds;
  }

  return params;
}

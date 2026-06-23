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
  type GetSubscriptionSeatDetailsResponse,
  type TokenPlanSeatDetail,
  BailianError,
  ExitCode,
} from "bailian-cli-core";
import { emitResult, emitBare } from "../../output/output.ts";
import { padEnd } from "../../output/cjk-width.ts";

const API_VERSION = "2026-02-10";
const API_ACTION = "GetSubscriptionSeatDetails";
const API_PATH = "/tokenplan/subscription/seat-detail";

export default defineCommand({
  name: "tokenplan seats",
  description: "List Token Plan subscription seat details",
  usage: "bl tokenplan seats [flags]",
  options: [
    { flag: "--page-no <n>", description: "Page number (default: 1)", type: "number" },
    { flag: "--page-size <n>", description: "Page size (default: 10)", type: "number" },
    {
      flag: "--caller-uac-account-id <id>",
      description: "Caller UAC account ID",
    },
    {
      flag: "--namespace-id <id>",
      description: "Product namespace ID (Token Plan default: namespace-1)",
    },
    {
      flag: "--status <status>",
      description:
        "Seat status filter (repeatable): CREATING, NORMAL, LIMIT, RELEASE, STOP, REFUNDED",
      type: "array",
    },
    {
      flag: "--status-list-str <json>",
      description: "StatusList as JSON string, e.g. '[\"NORMAL\"]'",
    },
    { flag: "--seat-id <id>", description: "Filter by seat ID" },
    {
      flag: "--seat-type <type>",
      description: "Seat tier: standard, pro, or max",
    },
    {
      flag: "--query-assigned <bool>",
      description: "Filter by assignment: true=assigned, false=unassigned",
    },
    { flag: "--access-key-id <key>", description: "Alibaba Cloud Access Key ID (deprecated)" },
    {
      flag: "--access-key-secret <key>",
      description: "Alibaba Cloud Access Key Secret (deprecated)",
    },
  ],
  examples: [
    "bl tokenplan seats",
    "bl tokenplan seats --page-size 20 --status NORMAL",
    "bl tokenplan seats --query-assigned true --seat-type standard",
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

    const queryParams = buildQueryParams(flags);
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
      method: "GET",
      queryString,
    });

    if (config.verbose) {
      process.stderr.write(`> GET ${endpoint}\n`);
      process.stderr.write(`> AK: ${maskToken(accessKeyId)}\n`);
    }

    const timeoutMs = config.timeout * 1000;
    const res = await fetch(endpoint, {
      method: "GET",
      headers: { ...headers, ...trackingHeaders() },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (config.verbose) {
      process.stderr.write(`< ${res.status} ${res.statusText}\n`);
    }

    const data = (await res.json()) as GetSubscriptionSeatDetailsResponse;

    if (!res.ok || data.Success === false) {
      throw new BailianError(
        `${data.Code || res.status} - ${data.Message || res.statusText}`,
        ExitCode.GENERAL,
      );
    }

    const items = data.Data?.Items ?? [];
    if (config.quiet || format === "text") {
      emitTextSeats(items, data.Data?.Total, data.Data?.PageNo, data.Data?.PageSize);
    } else {
      emitResult(data, format);
    }
  },
});

function buildQueryParams(flags: GlobalFlags): Record<string, string | string[] | undefined> {
  const params: Record<string, string | string[] | undefined> = {};

  if (flags.pageNo !== undefined) params.PageNo = String(flags.pageNo as number);
  if (flags.pageSize !== undefined) params.PageSize = String(flags.pageSize as number);
  if (flags.callerUacAccountId) params.CallerUacAccountId = flags.callerUacAccountId as string;
  if (flags.namespaceId) params.NamespaceId = flags.namespaceId as string;
  if (flags.statusListStr) params.StatusListStr = flags.statusListStr as string;

  const status = flags.status;
  if (Array.isArray(status) && status.length > 0) {
    params.StatusList = status as string[];
  } else if (typeof status === "string" && status.length > 0) {
    params.StatusList = [status];
  }

  if (flags.seatId) params.SeatId = flags.seatId as string;
  if (flags.seatType) params.SeatType = flags.seatType as string;

  if (typeof flags.queryAssigned === "string" && flags.queryAssigned.length > 0) {
    params.QueryAssigned = flags.queryAssigned;
  }

  return params;
}

function emitTextSeats(
  items: TokenPlanSeatDetail[],
  total?: number,
  pageNo?: number,
  pageSize?: number,
): void {
  if (items.length === 0) {
    emitBare("No seats found.");
    return;
  }

  const header = [
    padEnd("SeatId", 18),
    padEnd("Type", 10),
    padEnd("Status", 10),
    padEnd("Assigned", 12),
    padEnd("Account", 20),
  ].join(" ");
  emitBare(header);
  emitBare("-".repeat(header.length));

  for (const item of items) {
    const row = [
      padEnd(item.SeatId ?? "-", 18),
      padEnd(item.SpecType ?? "-", 10),
      padEnd(item.Status ?? "-", 10),
      padEnd(item.AssignedStatus ?? "-", 12),
      padEnd(item.AccountName ?? item.AccountId ?? "-", 20),
    ].join(" ");
    emitBare(row);
  }

  if (total !== undefined) {
    emitBare("");
    emitBare(
      `Total: ${total}${pageNo !== undefined ? ` | Page: ${pageNo}` : ""}${pageSize !== undefined ? ` | PageSize: ${pageSize}` : ""}`,
    );
  }
}

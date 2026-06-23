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
  type AddOrganizationMemberResponse,
  BailianError,
  ExitCode,
} from "bailian-cli-core";
import { emitResult, emitBare } from "../../output/output.ts";
import { padEnd } from "../../output/cjk-width.ts";

const API_VERSION = "2026-02-10";
const API_ACTION = "AddOrganizationMember";
const API_PATH = "/tokenplan/organization/member-additions";

const DEFAULT_ORG_ROLE = "ORG_MEMBER";

export default defineCommand({
  name: "tokenplan add-member",
  description: "Add a member to a Token Plan organization",
  usage: "bl tokenplan add-member --account-name <name> --org-id <id> [flags]",
  options: [
    { flag: "--account-name <name>", description: "Member display name", required: true },
    { flag: "--org-id <id>", description: "Organization ID", required: true },
    {
      flag: "--org-role-code <code>",
      description: "Organization role: ORG_ADMIN or ORG_MEMBER (default: ORG_MEMBER)",
    },
    {
      flag: "--spec-type <type>",
      description: "Seat tier to assign on creation: standard, pro, or max",
    },
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
    "bl tokenplan add-member --account-name dev_user --org-id org_123",
    "bl tokenplan add-member --account-name admin_user --org-id org_123 --org-role-code ORG_ADMIN",
    "bl tokenplan add-member --account-name member1 --org-id org_123 --spec-type standard",
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

    const accountName = flags.accountName as string | undefined;
    const orgId = flags.orgId as string | undefined;
    if (!accountName) {
      throw new BailianError("Missing required argument --account-name.", ExitCode.USAGE);
    }
    if (!orgId) {
      throw new BailianError("Missing required argument --org-id.", ExitCode.USAGE);
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

    const data = (await res.json()) as AddOrganizationMemberResponse;

    if (!res.ok || data.Success === false) {
      throw new BailianError(
        `${data.Code || res.status} - ${data.Message || res.statusText}`,
        ExitCode.GENERAL,
      );
    }

    if (config.quiet || format === "text") {
      emitTextMember(data);
    } else {
      emitResult(data, format);
    }
  },
});

function buildQueryParams(flags: GlobalFlags): Record<string, string | string[] | undefined> {
  const params: Record<string, string | string[] | undefined> = {};

  if (flags.accountName) params.AccountName = flags.accountName as string;
  if (flags.orgId) params.OrgId = flags.orgId as string;
  params.OrgRoleCode =
    typeof flags.orgRoleCode === "string" && flags.orgRoleCode.length > 0
      ? flags.orgRoleCode
      : DEFAULT_ORG_ROLE;
  if (flags.specType) params.SpecType = flags.specType as string;
  if (flags.callerUacAccountId) params.CallerUacAccountId = flags.callerUacAccountId as string;
  if (flags.namespaceId) params.NamespaceId = flags.namespaceId as string;

  return params;
}

function emitTextMember(data: AddOrganizationMemberResponse): void {
  const item = data.Data;
  if (!item) {
    emitBare("Member added.");
    return;
  }

  emitBare(`${padEnd("AccountId", 14)} ${item.AccountId ?? "-"}`);
  emitBare(`${padEnd("SeatAssigned", 14)} ${String(item.SeatAssigned ?? "-")}`);
}

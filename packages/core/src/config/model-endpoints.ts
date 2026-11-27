/**
 * Official model-domain hosts and workspace regions.
 * Shared by API-key login candidate generation and telemetry site classification.
 */

export const ORDINARY_WORKSPACE_REGIONS = [
  "cn-beijing",
  "ap-southeast-1",
  "cn-hongkong",
  "ap-northeast-1",
  "eu-central-1",
  "us-east-1",
] as const;

export type OrdinaryWorkspaceRegion = (typeof ORDINARY_WORKSPACE_REGIONS)[number];

/** Mainland China regions treated as domestic for telemetry and routing. */
export const DOMESTIC_WORKSPACE_REGIONS = ["cn-beijing"] as const;

export type DomesticWorkspaceRegion = (typeof DOMESTIC_WORKSPACE_REGIONS)[number];

export const INTERNATIONAL_WORKSPACE_REGIONS = ORDINARY_WORKSPACE_REGIONS.filter(
  (region) => !(DOMESTIC_WORKSPACE_REGIONS as readonly string[]).includes(region),
);

export type ApiKeyEndpointKind = "ordinary" | "token-plan";

export const KNOWN_MODEL_BASE_URLS: Readonly<Record<ApiKeyEndpointKind, readonly string[]>> = {
  ordinary: [
    "https://dashscope.aliyuncs.com",
    "https://dashscope-intl.aliyuncs.com",
    "https://dashscope-us.aliyuncs.com",
    "https://cn-hongkong.dashscope.aliyuncs.com",
  ],
  "token-plan": [
    "https://token-plan.cn-beijing.maas.aliyuncs.com",
    "https://token-plan.ap-southeast-1.maas.aliyuncs.com",
  ],
};

const DOMESTIC_REGION_SET = new Set<string>(DOMESTIC_WORKSPACE_REGIONS);
const INTERNATIONAL_REGION_SET = new Set<string>(INTERNATIONAL_WORKSPACE_REGIONS);

const DOMESTIC_HOSTS = new Set(["dashscope.aliyuncs.com"]);
const INTERNATIONAL_HOSTS = new Set([
  "dashscope-intl.aliyuncs.com",
  "dashscope-us.aliyuncs.com",
  "cn-hongkong.dashscope.aliyuncs.com",
]);

/** Extract a hostname from a URL or bare host string. */
export function hostnameOf(input: string | undefined): string | undefined {
  if (input === undefined) return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      return new URL(trimmed).hostname.toLowerCase();
    }
    const hostPart = trimmed.split("/")[0]?.split("?")[0];
    if (!hostPart) return undefined;
    return hostPart.toLowerCase();
  } catch {
    return undefined;
  }
}

export type ModelHostClass = "domestic" | "international" | "unknown";

/**
 * Classify a model-domain host: mainland whitelist → domestic;
 * known official international (incl. Hong Kong) → international;
 * everything else → unknown (callers typically fall back to domestic).
 */
export function classifyModelHost(hostOrUrl: string | undefined): ModelHostClass {
  const hostname = hostnameOf(hostOrUrl);
  if (!hostname) return "unknown";

  if (DOMESTIC_HOSTS.has(hostname)) return "domestic";
  if (INTERNATIONAL_HOSTS.has(hostname)) return "international";

  const tokenPlanMatch = hostname.match(/^token-plan\.([a-z0-9-]+)\.maas\.aliyuncs\.com$/i);
  if (tokenPlanMatch) {
    return classifyWorkspaceRegion(tokenPlanMatch[1]!);
  }

  const workspaceMaasMatch = hostname.match(/^[a-z0-9-]+\.([a-z0-9-]+)\.maas\.aliyuncs\.com$/i);
  if (workspaceMaasMatch) {
    return classifyWorkspaceRegion(workspaceMaasMatch[1]!);
  }

  const regionalDashscopeMatch = hostname.match(/^([a-z0-9-]+)\.dashscope\.aliyuncs\.com$/i);
  if (regionalDashscopeMatch) {
    return classifyWorkspaceRegion(regionalDashscopeMatch[1]!);
  }

  return "unknown";
}

function classifyWorkspaceRegion(region: string): ModelHostClass {
  if (DOMESTIC_REGION_SET.has(region)) return "domestic";
  if (INTERNATIONAL_REGION_SET.has(region)) return "international";
  return "unknown";
}

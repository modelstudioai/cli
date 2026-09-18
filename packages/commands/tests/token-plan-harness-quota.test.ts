import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import harnessQuota from "../src/commands/token-plan/harness-quota.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

function captureStdout(): string[] {
  const output: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    output.push(String(chunk));
    return true;
  });
  return output;
}

/** Gateway envelope produced by `callConsoleGateway` (DataV2 wrapper included). */
function wrapResponse(payload: Record<string, unknown>): Record<string, unknown> {
  return { data: { DataV2: { data: { data: payload } } } };
}

const IMAGE_HARNESS = {
  type: "official_tool",
  hasResourcePack: true,
  title: "图像生成 MCP",
  quotaUnit: "张",
  planCodes: ["tokenplan_harnesstool_image_generation", "tokenplan_harnesstool_image_monthly"],
};

const SEARCH_HARNESS = {
  type: "official_tool",
  hasResourcePack: true,
  title: "联网搜索 MCP",
  priceInfo: { unit: "次" },
  planCodes: ["tokenplan_harnesstool_web_search"],
};

/** Harness without an entitlement quota — never shown, same as the console card. */
const NO_QUOTA_HARNESS = {
  type: "infrastructure",
  hasResourcePack: false,
  title: "无额度 Harness",
  planCodes: ["tokenplan_harnesstool_no_quota"],
};

async function runHarnessQuota(
  items: Record<string, unknown>[],
  equityInfos: Record<string, unknown>[],
  options: { output?: string; type?: string } = {},
): Promise<Record<string, unknown>[]> {
  const calls: Record<string, unknown>[] = [];
  await harnessQuota.run({
    client: {
      console: vi.fn().mockImplementation((api: string, data: Record<string, unknown>) => {
        calls.push({ api, data });
        return Promise.resolve(
          api.endsWith("token-plan.detail")
            ? wrapResponse({ items })
            : wrapResponse({ userId: "1256099523640572", tokenPlanEquityInfos: equityInfos }),
        );
      }),
    },
    flags: options.type ? { type: options.type } : {},
    settings: { dryRun: false, output: options.output },
  } as never);
  return calls;
}

describe("token-plan harness-quota view", () => {
  test("renders one gauge per harness with issued quota", async () => {
    const output = captureStdout();

    await runHarnessQuota(
      [IMAGE_HARNESS, NO_QUOTA_HARNESS],
      [
        {
          instanceId: "instance-1",
          equityType: "tokenplan_harnesstool_image_generation",
          totalQuota: 100,
          availableQuota: 60,
          instanceStartTime: 1_786_000_000_000,
          instanceEndTime: 1_788_000_000_000,
        },
      ],
    );

    const rendered = output.join("");
    expect(rendered).toContain("Token Plan Harness Quota");
    expect(rendered).toContain("图像生成 MCP (tokenplan_harnesstool_image_generation)");
    expect(rendered).toContain("40% used");
    expect(rendered).toContain("Used: 40 / 100 张");
    expect(rendered).toMatch(/Resets: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    // Harness without a resource pack has no entitlement quota at all.
    expect(rendered).not.toContain("无额度 Harness");
  });

  test("marks a harness whose entitlement is not issued yet as issuing", async () => {
    const output = captureStdout();

    await runHarnessQuota(
      [IMAGE_HARNESS, SEARCH_HARNESS],
      [
        {
          equityType: "tokenplan_harnesstool_image_generation",
          totalQuota: 100,
          availableQuota: 60,
          instanceEndTime: 1_788_000_000_000,
        },
      ],
    );

    const rendered = output.join("");
    // Pending harness keeps its first plan code and shows no gauge or reset line.
    expect(rendered).toContain("联网搜索 MCP (tokenplan_harnesstool_web_search)");
    expect(rendered).toContain("Quota is being issued; issuance can take up to 5 minutes.");
    expect(rendered).not.toContain("Resets: not applicable");
  });

  test("falls back to the price unit when quotaUnit is absent", async () => {
    const output = captureStdout();

    await runHarnessQuota(
      [SEARCH_HARNESS],
      [
        {
          equityType: "tokenplan_harnesstool_web_search",
          totalQuota: 2000,
          availableQuota: 500,
          instanceEndTime: 1_788_000_000_000,
        },
      ],
    );

    expect(output.join("")).toContain("Used: 1,500 / 2,000 次");
  });

  test("reports a non-positive quota total instead of a gauge", async () => {
    const output = captureStdout();

    await runHarnessQuota(
      [IMAGE_HARNESS],
      [
        {
          equityType: "tokenplan_harnesstool_image_monthly",
          totalQuota: 0,
          availableQuota: 0,
          instanceEndTime: 1_788_000_000_000,
        },
      ],
    );

    expect(output.join("")).toContain(
      "No positive quota total reported; check the Bailian Token Plan console.",
    );
  });

  test("prints the empty state when no harness carries an entitlement quota", async () => {
    const output = captureStdout();

    await runHarnessQuota([NO_QUOTA_HARNESS], []);

    expect(output.join("")).toBe("No harness with entitlement quota found.\n");
  });

  test("passes --type through to the harness list API only", async () => {
    captureStdout();

    const calls = await runHarnessQuota([], [], { type: "infrastructure" });

    expect(calls[0]).toEqual({
      api: "zeldaEasy.broadscope-bailian.token-plan.detail",
      data: { type: "infrastructure" },
    });
    expect(calls[1]?.api).toBe("zeldaEasy.bailian-commerce.tokenPlan.queryTokenPlanEquityInfo");
  });
});

describe("token-plan harness-quota json", () => {
  test("emits the joined quota fields with --output json", async () => {
    const output = captureStdout();

    await runHarnessQuota(
      [IMAGE_HARNESS, SEARCH_HARNESS],
      [
        {
          instanceId: "instance-1",
          equityType: "tokenplan_harnesstool_image_generation",
          totalQuota: 100,
          availableQuota: 60,
          instanceStartTime: 1_786_000_000_000,
          instanceEndTime: 1_788_000_000_000,
        },
      ],
      { output: "json" },
    );

    const parsed = JSON.parse(output.join("")) as { items: Record<string, unknown>[] };
    expect(parsed.items).toEqual([
      {
        planCode: "tokenplan_harnesstool_image_generation",
        title: "图像生成 MCP",
        type: "official_tool",
        status: "issued",
        quotaUnit: "张",
        instanceId: "instance-1",
        totalQuota: 100,
        availableQuota: 60,
        usedQuota: 40,
        usedPercent: 40,
        instanceStartTime: 1_786_000_000_000,
        instanceEndTime: 1_788_000_000_000,
      },
      {
        planCode: "tokenplan_harnesstool_web_search",
        title: "联网搜索 MCP",
        type: "official_tool",
        status: "issuing",
        quotaUnit: "次",
      },
    ]);
  });

  test("treats non-numeric quota fields as absent instead of failing", async () => {
    const output = captureStdout();

    await runHarnessQuota(
      [IMAGE_HARNESS],
      [
        {
          equityType: "tokenplan_harnesstool_image_generation",
          totalQuota: "not-a-number",
          availableQuota: Number.NaN,
        },
      ],
      { output: "json" },
    );

    const parsed = JSON.parse(output.join("")) as { items: Record<string, unknown>[] };
    expect(parsed.items[0]).toEqual({
      planCode: "tokenplan_harnesstool_image_generation",
      title: "图像生成 MCP",
      type: "official_tool",
      status: "issued",
      quotaUnit: "张",
    });
  });
});

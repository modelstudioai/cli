import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import type { LocalizedText } from "bailian-cli-core";
import overview from "../src/commands/security/overview.ts";
import alerts from "../src/commands/security/alerts.ts";

// View-layer tests for the Agent security commands. They lock in two fixes:
//   - P2-3: `--quiet` wins over `output=json` (bare alert IDs, not a JSON doc).
//   - P3: text output is localized en-US / zh-CN instead of hardcoded.
// Envelope parsing and exit codes live in core/tests/security-envelope.test.ts.

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

/** Mirror the runtime translator: pick the requested locale's variant. */
function localizeWith(language: "en-US" | "zh-CN") {
  return (text: LocalizedText): string => (typeof text === "string" ? text : text[language]);
}

/** Non-gateway baseUrl so resolveSecurityHost uses it verbatim (no workspace needed). */
function mockClient(body: unknown) {
  return {
    baseUrl: "https://mock.security.test",
    request: vi.fn().mockResolvedValue({
      text: async () => JSON.stringify(body),
      headers: { get: () => "application/json" },
    }),
  };
}

function makeCtx(
  client: unknown,
  language: "en-US" | "zh-CN",
  settings: Record<string, unknown> = {},
) {
  return {
    client,
    localize: localizeWith(language),
    flags: {},
    identity: { binName: "bl" },
    settings: { dryRun: false, output: "text", quiet: false, ...settings },
  } as never;
}

const OVERVIEW_BODY = {
  capabilities: [{ key: "content_safety", enabled: true, count: 3 }],
  protection: [{ key: "flow_agent", enabled: true, count: 10 }],
  content_safety: { hit: 2, scanned: 100 },
  file_scan: { hit: 0, scanned: 5 },
  skill_scan: null,
};

const ALERTS_BODY = {
  stats: { total: 1, high: 1, medium: 0, low: 0 },
  data: [
    {
      alert_id: "a1",
      risk_level: "high",
      risk_name: "Risk",
      app_name: "app",
      asset_name: "ast",
      asset_type: "agent",
      status: "unhandled",
      source: "src",
      check_time: "1700000000000",
    },
  ],
  next_page: null,
};

async function renderOverview(language: "en-US" | "zh-CN"): Promise<string> {
  const output = captureStdout();
  await overview.run(makeCtx(mockClient(OVERVIEW_BODY), language));
  const rendered = output.join("");
  vi.restoreAllMocks();
  return rendered;
}

async function renderAlerts(
  language: "en-US" | "zh-CN",
  settings: Record<string, unknown> = {},
): Promise<string> {
  const output = captureStdout();
  await alerts.run(makeCtx(mockClient(ALERTS_BODY), language, settings));
  const rendered = output.join("");
  vi.restoreAllMocks();
  return rendered;
}

describe("security overview text output is localized (P3)", () => {
  test("zh-CN and en-US render different titles and labels", async () => {
    const zh = await renderOverview("zh-CN");
    const en = await renderOverview("en-US");

    expect(zh).toContain("能力项");
    expect(zh).toContain("内容安全");
    expect(zh).toContain("检测项");
    expect(en).toContain("Capabilities");
    expect(en).toContain("Content safety");
    expect(en).toContain("Detections");
    // The core regression: the two locales must NOT be identical anymore.
    expect(zh).not.toBe(en);
  });
});

describe("security alerts output (P2-3 + P3)", () => {
  test("--quiet wins over output=json: bare alert IDs, not a JSON document", async () => {
    const rendered = await renderAlerts("en-US", { quiet: true, output: "json" });
    expect(rendered).toBe("a1\n");
    expect(rendered).not.toContain("{");
  });

  test("text output localizes stats and field labels per language", async () => {
    const zh = await renderAlerts("zh-CN");
    const en = await renderAlerts("en-US");

    expect(zh).toContain("总计");
    expect(zh).toContain("应用");
    expect(en).toContain("Total");
    expect(en).toContain("app:");
    expect(zh).not.toBe(en);
  });
});

import { tmpdir } from "os";
import { describe, expect, test } from "vite-plus/test";
import { isTokenPlanAkSkReady, parseStdoutJson, runCli } from "./helpers.ts";

interface DryRunBody {
  endpoint?: string;
  query?: Record<string, unknown>;
}

describe("e2e: tokenplan seats", () => {
  test("tokenplan 分组展示子命令帮助且成功退出", async () => {
    const { stdout, stderr, exitCode } = await runCli(["tokenplan"]);
    expect(exitCode, stderr).toBe(0);
    const out = `${stdout}\n${stderr}`;
    expect(out).toMatch(/tokenplan|seats/i);
  });

  test("tokenplan seats --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["tokenplan", "seats", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--page-no/i);
    expect(stderr).toMatch(/--page-size/i);
    expect(stderr).toMatch(/--seat-id/i);
    expect(stderr).toMatch(/--status/i);
    expect(stderr).toMatch(/--query-assigned/i);
  });
});

describe("e2e: tokenplan seats errors", () => {
  test("无任何凭证时提示 No credentials found 并非零退出", async () => {
    const { stderr, exitCode } = await runCli(
      ["tokenplan", "seats", "--non-interactive", "--output", "json"],
      {
        DASHSCOPE_API_KEY: undefined,
        DASHSCOPE_ACCESS_TOKEN: undefined,
        ALIBABA_CLOUD_ACCESS_KEY_ID: undefined,
        ALIBABA_CLOUD_ACCESS_KEY_SECRET: undefined,
        BAILIAN_CONFIG_DIR: tmpdir(),
      },
    );
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/no credentials found/i);
  });
});

describe("e2e: tokenplan seats dry-run", () => {
  test("--dry-run 输出 endpoint 和 query 参数", async () => {
    const { stdout, stderr, exitCode } = await runCli(
      [
        "tokenplan",
        "seats",
        "--dry-run",
        "--page-no",
        "1",
        "--page-size",
        "10",
        "--status",
        "NORMAL",
        "--query-assigned",
        "true",
        "--non-interactive",
        "--output",
        "json",
      ],
      {
        ALIBABA_CLOUD_ACCESS_KEY_ID: "LTAI-fake",
        ALIBABA_CLOUD_ACCESS_KEY_SECRET: "fake-secret",
      },
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.endpoint).toMatch(/\/tokenplan\/subscription\/seat-detail/);
    expect(data.query?.PageNo).toBe("1");
    expect(data.query?.PageSize).toBe("10");
    expect(data.query?.QueryAssigned).toBe("true");
    expect(data.query?.StatusList).toEqual(["NORMAL"]);
  });
});

describe.skipIf(!isTokenPlanAkSkReady())("e2e: tokenplan seats（AK/SK）", () => {
  test("GetSubscriptionSeatDetails 真实调用", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "tokenplan",
      "seats",
      "--page-size",
      "5",
      "--non-interactive",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ Success?: boolean; Data?: { Items?: unknown[] } }>(stdout);
    expect(data.Success).toBe(true);
    expect(Array.isArray(data.Data?.Items)).toBe(true);
  });
});

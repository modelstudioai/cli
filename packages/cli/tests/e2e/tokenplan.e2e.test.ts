import { tmpdir } from "os";
import { describe, expect, test } from "vite-plus/test";
import { isTokenPlanAkSkReady, parseStdoutJson, runCli } from "./helpers.ts";

interface DryRunBody {
  endpoint?: string;
  query?: Record<string, unknown>;
}

const noCredsEnv = {
  DASHSCOPE_API_KEY: undefined,
  DASHSCOPE_ACCESS_TOKEN: undefined,
  ALIBABA_CLOUD_ACCESS_KEY_ID: undefined,
  ALIBABA_CLOUD_ACCESS_KEY_SECRET: undefined,
  BAILIAN_CONFIG_DIR: tmpdir(),
};

const fakeAkEnv = {
  ALIBABA_CLOUD_ACCESS_KEY_ID: "LTAI-fake",
  ALIBABA_CLOUD_ACCESS_KEY_SECRET: "fake-secret",
};

describe("e2e: tokenplan", () => {
  test("tokenplan 分组展示子命令帮助且成功退出", async () => {
    const { stdout, stderr, exitCode } = await runCli(["tokenplan"]);
    expect(exitCode, stderr).toBe(0);
    const out = `${stdout}\n${stderr}`;
    expect(out).toMatch(/tokenplan|seats/i);
    expect(out).toMatch(/create-key/i);
    expect(out).toMatch(/assign-seats/i);
    expect(out).toMatch(/add-member/i);
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

  test("tokenplan create-key --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["tokenplan", "create-key", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--account-id/i);
    expect(stderr).toMatch(/--workspace-id/i);
  });

  test("tokenplan assign-seats --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["tokenplan", "assign-seats", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--workspace-id/i);
    expect(stderr).toMatch(/--seat-type/i);
    expect(stderr).toMatch(/--account-id/i);
  });

  test("tokenplan add-member --help 正常退出", async () => {
    const { stderr, exitCode } = await runCli(["tokenplan", "add-member", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--account-name/i);
    expect(stderr).toMatch(/--org-id/i);
    expect(stderr).toMatch(/--org-role-code/i);
  });
});

describe("e2e: tokenplan errors", () => {
  test("seats 无任何凭证时提示 No credentials found 并非零退出", async () => {
    const { stderr, exitCode } = await runCli(
      ["tokenplan", "seats", "--non-interactive", "--output", "json"],
      noCredsEnv,
    );
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/no credentials found/i);
  });

  test("create-key 无任何凭证时提示 No credentials found 并非零退出", async () => {
    const { stderr, exitCode } = await runCli(
      [
        "tokenplan",
        "create-key",
        "--account-id",
        "acc_1",
        "--workspace-id",
        "ws_1",
        "--non-interactive",
        "--output",
        "json",
      ],
      noCredsEnv,
    );
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/no credentials found/i);
  });

  test("assign-seats 无任何凭证时提示 No credentials found 并非零退出", async () => {
    const { stderr, exitCode } = await runCli(
      [
        "tokenplan",
        "assign-seats",
        "--workspace-id",
        "ws_1",
        "--seat-type",
        "standard",
        "--account-id",
        "acc_1",
        "--non-interactive",
        "--output",
        "json",
      ],
      noCredsEnv,
    );
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/no credentials found/i);
  });

  test("add-member 无任何凭证时提示 No credentials found 并非零退出", async () => {
    const { stderr, exitCode } = await runCli(
      [
        "tokenplan",
        "add-member",
        "--account-name",
        "user1",
        "--org-id",
        "org_1",
        "--non-interactive",
        "--output",
        "json",
      ],
      noCredsEnv,
    );
    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/no credentials found/i);
  });
});

describe.skipIf(!isTokenPlanAkSkReady())("e2e: tokenplan missing args", () => {
  test("create-key 缺少 --account-id 时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCli([
      "tokenplan",
      "create-key",
      "--workspace-id",
      "ws_1",
      "--non-interactive",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--account-id|Missing required argument/i);
  });

  test("create-key 缺少 --workspace-id 时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCli([
      "tokenplan",
      "create-key",
      "--account-id",
      "acc_1",
      "--non-interactive",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/workspace-id|Missing workspace ID/i);
  });

  test("assign-seats 缺少 --workspace-id 时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCli([
      "tokenplan",
      "assign-seats",
      "--seat-type",
      "standard",
      "--account-id",
      "acc_1",
      "--non-interactive",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/workspace-id|Missing workspace ID/i);
  });

  test("assign-seats 缺少 --seat-type 时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCli([
      "tokenplan",
      "assign-seats",
      "--workspace-id",
      "ws_1",
      "--account-id",
      "acc_1",
      "--non-interactive",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--seat-type|Missing required argument/i);
  });

  test("assign-seats 缺少 account id 时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCli([
      "tokenplan",
      "assign-seats",
      "--workspace-id",
      "ws_1",
      "--seat-type",
      "standard",
      "--non-interactive",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--account-id|Missing required argument/i);
  });

  test("add-member 缺少 --account-name 时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCli([
      "tokenplan",
      "add-member",
      "--org-id",
      "org_1",
      "--non-interactive",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--account-name|Missing required argument/i);
  });

  test("add-member 缺少 --org-id 时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCli([
      "tokenplan",
      "add-member",
      "--account-name",
      "user1",
      "--non-interactive",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toMatch(/--org-id|Missing required argument/i);
  });
});

describe("e2e: tokenplan dry-run", () => {
  test("seats --dry-run 输出 endpoint 和 query 参数", async () => {
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
      fakeAkEnv,
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.endpoint).toMatch(/\/tokenplan\/subscription\/seat-detail/);
    expect(data.query?.PageNo).toBe("1");
    expect(data.query?.PageSize).toBe("10");
    expect(data.query?.QueryAssigned).toBe("true");
    expect(data.query?.StatusList).toEqual(["NORMAL"]);
  });

  test("create-key --dry-run 从 BAILIAN_WORKSPACE_ID 读取 workspace", async () => {
    const { stdout, stderr, exitCode } = await runCli(
      [
        "tokenplan",
        "create-key",
        "--dry-run",
        "--account-id",
        "acc_123",
        "--non-interactive",
        "--output",
        "json",
      ],
      { ...fakeAkEnv, BAILIAN_WORKSPACE_ID: "ws-from-env" },
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.query?.WorkspaceId).toBe("ws-from-env");
  });

  test("create-key --dry-run 输出 endpoint 和 query 参数", async () => {
    const { stdout, stderr, exitCode } = await runCli(
      [
        "tokenplan",
        "create-key",
        "--dry-run",
        "--account-id",
        "acc_123",
        "--workspace-id",
        "ws_456",
        "--description",
        "test key",
        "--non-interactive",
        "--output",
        "json",
      ],
      fakeAkEnv,
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.endpoint).toMatch(/\/tokenplan\/api-keys/);
    expect(data.query?.AccountId).toBe("acc_123");
    expect(data.query?.WorkspaceId).toBe("ws_456");
    expect(data.query?.Description).toBe("test key");
  });

  test("assign-seats --dry-run 输出 endpoint 和 query 参数", async () => {
    const { stdout, stderr, exitCode } = await runCli(
      [
        "tokenplan",
        "assign-seats",
        "--dry-run",
        "--workspace-id",
        "ws_456",
        "--seat-type",
        "standard",
        "--account-id",
        "acc_1",
        "--account-id",
        "acc_2",
        "--non-interactive",
        "--output",
        "json",
      ],
      fakeAkEnv,
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.endpoint).toMatch(/\/tokenplan\/subscription\/seat-assignments/);
    expect(data.query?.WorkspaceId).toBe("ws_456");
    expect(data.query?.SeatType).toBe("standard");
    expect(data.query?.AccountIds).toEqual(["acc_1", "acc_2"]);
    expect(data.endpoint).toMatch(/AccountIds\.1=acc_1/);
    expect(data.endpoint).toMatch(/AccountIds\.2=acc_2/);
  });

  test("add-member --dry-run 输出 endpoint 和 query 参数", async () => {
    const { stdout, stderr, exitCode } = await runCli(
      [
        "tokenplan",
        "add-member",
        "--dry-run",
        "--account-name",
        "dev_user",
        "--org-id",
        "org_123",
        "--spec-type",
        "standard",
        "--non-interactive",
        "--output",
        "json",
      ],
      fakeAkEnv,
    );
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<DryRunBody>(stdout);
    expect(data.endpoint).toMatch(/\/tokenplan\/organization\/member-additions/);
    expect(data.query?.AccountName).toBe("dev_user");
    expect(data.query?.OrgId).toBe("org_123");
    expect(data.query?.OrgRoleCode).toBe("ORG_MEMBER");
    expect(data.query?.SpecType).toBe("standard");
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

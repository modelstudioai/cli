import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vite-plus/test";
import { isDashScopeE2EReady, parseStdoutJson, runCommandHelp, runCommandE2e } from "./helpers.ts";
import { DEPLOY_ROUTES } from "./topic-routes.ts";

// No files are created: isolate user config and block fetch in the child process,
// including the runtime's background npm version check. Never load an env file.
const READ_ONLY_ENV: NodeJS.ProcessEnv = {
  BAILIAN_E2E: "0",
  DO_NOT_TRACK: "1",
  BAILIAN_CONFIG_DIR: fileURLToPath(
    new URL("./fixtures/deploy-query-no-user-config", import.meta.url),
  ),
  NODE_OPTIONS: `--import=data:text/javascript,${encodeURIComponent('globalThis.fetch = async () => { throw new Error("Network disabled for deploy query E2E"); };')}`,
};

function runReadOnlyDeploy(args: string[]) {
  return runCommandE2e(
    DEPLOY_ROUTES,
    ["deploy", ...args, "--api-key", "e2e-dummy-key", "--dry-run", "--output", "json", "--quiet"],
    READ_ONLY_ENV,
  );
}

// Deliberately ungated: these checks must also run on machines without credentials.
describe("e2e: deploy read-only queries (offline, no credentials)", () => {
  test.each([
    {
      path: ["capacity", "list"],
      flags: [
        "--deployed-model",
        "--include-deleted",
        "--statuses",
        "--charge-types",
        "--page",
        "--page-size",
      ],
      note: "records/items/page/itemsPerPage/pageCount",
    },
    { path: ["capacity", "get"], flags: ["--deployed-model", "--instance-id"], note: "Read-only" },
    { path: ["operation", "get"], flags: ["--deployed-model", "--operation-id"], note: "FAILED" },
    {
      path: ["operation", "wait"],
      flags: ["--deployed-model", "--operation-id", "--interval", "--poll-timeout"],
      note: "Ctrl-C",
    },
  ])("deploy $path --help exposes query flags and semantics", async ({ path, flags, note }) => {
    const { stdout, stderr, exitCode } = await runCommandHelp(DEPLOY_ROUTES, [
      "deploy",
      ...path,
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain(`bl deploy ${path.join(" ")}`);
    for (const flag of flags) expect(stderr).toContain(flag);
    expect(stderr).toContain(note);
    expect(stderr).toContain("--api-key");
    expect(stderr).not.toContain("--yes");
  });

  test.each([
    {
      path: ["capacity", "list"],
      args: [
        "--deployed-model",
        "dep-test",
        "--page",
        "2",
        "--page-size",
        "5",
        "--statuses",
        " RUNNING, STOPPED ",
        "--charge-types",
        " pre_paid, post_paid ",
      ],
      expected: {
        action: "deploy.capacity.list",
        deployed_model: "dep-test",
        query: {
          page_no: 2,
          page_size: 5,
          include_deleted: true,
          statuses: "RUNNING,STOPPED",
          charge_types: "pre_paid,post_paid",
        },
      },
    },
    {
      path: ["capacity", "get"],
      args: ["--deployed-model", "dep-test", "--instance-id", "instance/test"],
      expected: {
        action: "deploy.capacity.get",
        deployed_model: "dep-test",
        instance_id: "instance/test",
      },
    },
    {
      path: ["operation", "get"],
      args: ["--deployed-model", "dep-test", "--operation-id", "000900719925474099312345"],
      expected: {
        action: "deploy.operation.get",
        deployed_model: "dep-test",
        operation_id: "000900719925474099312345",
      },
    },
    {
      path: ["operation", "wait"],
      args: [
        "--deployed-model",
        "dep-test",
        "--operation-id",
        "000900719925474099312345",
        "--interval",
        "3",
        "--poll-timeout",
        "15",
      ],
      expected: {
        action: "deploy.operation.wait",
        deployed_model: "dep-test",
        operation_id: "000900719925474099312345",
        interval: 3,
        poll_timeout: 15,
      },
    },
  ])(
    "deploy $path --dry-run parses flags with a dummy key and no network",
    async ({ path, args, expected }) => {
      const { stdout, stderr, exitCode } = await runReadOnlyDeploy([...path, ...args]);
      expect(exitCode, stderr).toBe(0);
      expect(parseStdoutJson(stdout)).toEqual(expected);
      expect(stderr).not.toContain("Network disabled");
    },
  );

  test.each([
    { path: ["capacity", "list"], args: [], missing: "--deployed-model" },
    {
      path: ["capacity", "get"],
      args: ["--instance-id", "instance-test"],
      missing: "--deployed-model",
    },
    { path: ["capacity", "get"], args: ["--deployed-model", "dep-test"], missing: "--instance-id" },
    {
      path: ["operation", "get"],
      args: ["--operation-id", "operation-test"],
      missing: "--deployed-model",
    },
    {
      path: ["operation", "get"],
      args: ["--deployed-model", "dep-test"],
      missing: "--operation-id",
    },
    {
      path: ["operation", "wait"],
      args: ["--operation-id", "operation-test"],
      missing: "--deployed-model",
    },
    {
      path: ["operation", "wait"],
      args: ["--deployed-model", "dep-test"],
      missing: "--operation-id",
    },
  ])("deploy $path requires $missing even during dry-run", async ({ path, args, missing }) => {
    const { stdout, stderr, exitCode } = await runReadOnlyDeploy([...path, ...args]);
    expect(exitCode, stderr).toBe(2);
    expect(stdout.trim()).toBe("");
    expect(stderr).toContain(missing);
  });

  test.each([
    { name: "omitted defaults to true", args: [], expected: true },
    { name: "separate false value", args: ["--include-deleted", "false"], expected: false },
    { name: "equals false value", args: ["--include-deleted=false"], expected: false },
  ])("capacity list boolean parsing: $name", async ({ args, expected }) => {
    const { stdout, stderr, exitCode } = await runReadOnlyDeploy([
      "capacity",
      "list",
      "--deployed-model",
      "dep-test",
      ...args,
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(parseStdoutJson(stdout)).toEqual({
      action: "deploy.capacity.list",
      deployed_model: "dep-test",
      query: { page_no: 1, page_size: 20, include_deleted: expected },
    });
  });
});

// Unsubscribe is a pure link builder: no auth, no network, no confirmation.
describe("e2e: deploy capacity unsubscribe (offline, no credentials)", () => {
  const INSTANCE_ID = "example-instance";
  const REFUND_URL = `https://billing-cost.console.aliyun.com/refund/refund?instanceId=${INSTANCE_ID}`;

  function runUnsubscribe(args: string[]) {
    return runCommandE2e(
      DEPLOY_ROUTES,
      ["deploy", "capacity", "unsubscribe", ...args, "--output", "json"],
      READ_ONLY_ENV,
    );
  }

  test("--help exposes --instance-id, no --yes and no --api-key requirement", async () => {
    const { stdout, stderr, exitCode } = await runCommandHelp(DEPLOY_ROUTES, [
      "deploy",
      "capacity",
      "unsubscribe",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("bl deploy capacity unsubscribe");
    expect(stderr).toContain("--instance-id");
    expect(stderr).toContain("billing");
    expect(stderr).not.toContain("--yes");
    expect(stderr).not.toContain("--api-key");
  });

  test("builds the refund URL without any network or credentials", async () => {
    const { stdout, stderr, exitCode } = await runUnsubscribe(["--instance-id", INSTANCE_ID]);
    expect(exitCode, stderr).toBe(0);
    expect(parseStdoutJson(stdout)).toEqual({
      action: "deploy.capacity.unsubscribe",
      instance_id: INSTANCE_ID,
      refund_url: REFUND_URL,
    });
    expect(stderr).not.toContain("Network disabled");
  });

  test("--quiet emits only the bare refund URL", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(
      DEPLOY_ROUTES,
      ["deploy", "capacity", "unsubscribe", "--instance-id", INSTANCE_ID, "--quiet"],
      READ_ONLY_ENV,
    );
    expect(exitCode, stderr).toBe(0);
    expect(stdout.trim()).toBe(REFUND_URL);
  });

  test("URL-encodes unusual instance IDs", async () => {
    const { stdout, exitCode } = await runUnsubscribe(["--instance-id", "a b&c"]);
    expect(exitCode).toBe(0);
    expect(parseStdoutJson<{ refund_url: string }>(stdout).refund_url).toBe(
      "https://billing-cost.console.aliyun.com/refund/refund?instanceId=a%20b%26c",
    );
  });

  test("requires --instance-id even without credentials", async () => {
    const { stdout, stderr, exitCode } = await runUnsubscribe([]);
    expect(exitCode, stderr).toBe(2);
    expect(stdout.trim()).toBe("");
    expect(stderr).toContain("--instance-id");
  });

  test("rejects a blank --instance-id", async () => {
    const { stdout, stderr, exitCode } = await runUnsubscribe(["--instance-id", "   "]);
    expect(exitCode, stderr).toBe(2);
    expect(stdout.trim()).toBe("");
  });
});

/**
 * Legacy Deploy E2E (preserved below).
 *
 * The suite exercises command discovery, help text, and the `--dry-run`
 * structured-output path (arg parsing + body construction) with no network
 * dependency. Because `ensureApiKey` runs before every command (see main.ts),
 * these cases are gated by isDashScopeE2EReady() — they are skipped when no
 * DashScope credential is present (e.g. on CI) and run offline when one is.
 * The remote list test is also gated and tolerates both empty accounts and
 * auth/permission failures (see the test comment).
 */

describe.skipIf(!isDashScopeE2EReady())("e2e: deploy (offline)", () => {
  test("deploy 列出子命令", async () => {
    const { stderr, exitCode } = await runCommandHelp(DEPLOY_ROUTES, ["deploy", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/create|list|get|delete|update|scale|models/);
  });

  test("deploy create --help 正常退出并展示必填项", async () => {
    const { stderr, exitCode } = await runCommandHelp(DEPLOY_ROUTES, [
      "deploy",
      "text",
      "create",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--model-name|--display-name/i);
  });

  test("deploy create --dry-run 构造 lora 部署请求体", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(DEPLOY_ROUTES, [
      "deploy",
      "text",
      "create",
      "--model-name",
      "qwen-plus-2025-12-01",
      "--display-name",
      "my-qwen-plus",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action: string;
      body: {
        model_name: string;
        name: string;
        plan: string;
        capacity: number;
      };
    }>(stdout);
    expect(data.action).toBe("deploy.create");
    expect(data.body.model_name).toBe("qwen-plus-2025-12-01");
    expect(data.body.name).toBe("my-qwen-plus");
    expect(data.body.plan).toBe("lora");
    expect(data.body.capacity).toBe(1);
  });

  test("deploy create --plan mu --deploy-spec --dry-run 透传 deploy_spec", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(DEPLOY_ROUTES, [
      "deploy",
      "text",
      "create",
      "--model-name",
      "qwen3-8b",
      "--display-name",
      "my-qwen3-mu",
      "--plan",
      "mu",
      "--deploy-spec",
      "MU1",
      "--capacity",
      "2",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action: string;
      body: { plan: string; deploy_spec?: string; capacity?: number };
    }>(stdout);
    expect(data.action).toBe("deploy.create");
    expect(data.body.plan).toBe("mu");
    expect(data.body.deploy_spec).toBe("MU1");
    expect(data.body.capacity).toBe(2);
  });

  test("deploy audio create --dry-run 默认 plan=mu（CosyVoice 部署契约）", async () => {
    // Audio (CosyVoice TTS) outputs deploy model-unit-billed: the modality fixes
    // the default plan to `mu` (text/image stay `lora`). In dry-run the mu
    // strategy skips the catalog lookup, so deploy_spec is omitted and capacity
    // falls back to 1 with billing_method POST_PAY.
    const { stdout, stderr, exitCode } = await runCommandE2e(DEPLOY_ROUTES, [
      "deploy",
      "audio",
      "create",
      "--model-name",
      "my-cosyvoice-ft",
      "--display-name",
      "my-tts",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action: string;
      body: { plan: string; name: string; billing_method?: string; capacity?: number };
    }>(stdout);
    expect(data.action).toBe("deploy.create");
    expect(data.body.plan).toBe("mu");
    expect(data.body.name).toBe("my-tts");
    expect(data.body.billing_method).toBe("POST_PAY");
    expect(data.body.capacity).toBe(1);
  });

  test("deploy scale --dry-run 转发 capacity", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(DEPLOY_ROUTES, [
      "deploy",
      "scale",
      "--deployed-model",
      "dep-xxx",
      "--capacity",
      "8",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action: string;
      deployed_model: string;
      body: { capacity: number };
    }>(stdout);
    expect(data.action).toBe("deploy.scale");
    expect(data.deployed_model).toBe("dep-xxx");
    expect(data.body.capacity).toBe(8);
  });

  test("deploy update --dry-run 转发 rate limits", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(DEPLOY_ROUTES, [
      "deploy",
      "update",
      "--deployed-model",
      "dep-xxx",
      "--rpm-limit",
      "1000",
      "--tpm-limit",
      "200000",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action: string;
      body: { rpm_limit: number; tpm_limit: number };
    }>(stdout);
    expect(data.action).toBe("deploy.update");
    expect(data.body.rpm_limit).toBe(1000);
    expect(data.body.tpm_limit).toBe(200000);
  });

  test("deploy scale --dry-run 缺少 capacity/input-tpm/output-tpm 时报错", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(DEPLOY_ROUTES, [
      "deploy",
      "scale",
      "--deployed-model",
      "dep-xxx",
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).not.toBe(0);
    // Nothing useful emitted to stdout on a usage error.
    expect(stdout.trim()).toBe("");
  });

  test.each([
    ["list", ["--status", "RUNNING"]],
    ["get", ["--deployed-model", "dep-xxx"]],
    ["models", ["--source", "custom"]],
    ["delete", ["--deployed-model", "dep-xxx"]],
  ])("deploy %s --dry-run 发出结构化动作", async (sub, extra) => {
    const { stdout, stderr, exitCode } = await runCommandE2e(DEPLOY_ROUTES, [
      "deploy",
      sub,
      ...extra,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ action: string }>(stdout);
    expect(data.action).toBe(`deploy.${sub}`);
  });

  test("deploy delete --help 展示 --yes", async () => {
    const { stderr, exitCode } = await runCommandE2e(DEPLOY_ROUTES, ["deploy", "delete", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--yes/i);
  });
});

describe("e2e: deploy high-risk confirmation", () => {
  test("deploy delete --help 展示 runtime 注入的 --yes", async () => {
    const { stderr, exitCode } = await runCommandE2e(DEPLOY_ROUTES, ["deploy", "delete", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--yes/i);
  });

  test("deploy delete 无 --yes 返回确认请求 (7)", async () => {
    const { stderr, exitCode } = await runCommandE2e(DEPLOY_ROUTES, [
      "deploy",
      "delete",
      "--deployed-model",
      "dep-xxx",
      "--api-key",
      "e2e-dummy-key",
      "--output",
      "json",
    ]);
    expect(exitCode).toBe(7);
    expect(JSON.parse(stderr)).toMatchObject({
      error: { code: 7, type: "requires_confirmation" },
    });
  });
});

// Deliberately ungated: risky writes must parse, preview and demand confirmation offline.
describe("e2e: deploy capacity writes (offline, no credentials)", () => {
  test.each([
    {
      path: ["capacity", "create"],
      flags: ["--deployed-model", "--billing-method", "--input-tpm", "--output-tpm", "--duration"],
      note: "postpaid",
    },
    {
      path: ["capacity", "scale"],
      flags: ["--deployed-model", "--instance-id", "--input-tpm", "--output-tpm", "--order-type"],
      note: "absolute",
    },
    {
      path: ["capacity", "renew"],
      flags: ["--deployed-model", "--instance-id", "--duration", "--auto-renewal", "--is-change"],
      note: "prepaid",
    },
    {
      path: ["capacity", "delete"],
      flags: ["--deployed-model", "--instance-id", "--reason"],
      note: "unsubscribe",
    },
    { path: ["overflow"], flags: ["--deployed-model", "--strategy"], note: "ModelCode" },
  ])(
    "deploy $path --help exposes write flags, --yes and semantics",
    async ({ path, flags, note }) => {
      const { stdout, stderr, exitCode } = await runCommandHelp(DEPLOY_ROUTES, [
        "deploy",
        ...path,
        "--help",
      ]);
      expect(exitCode, stderr).toBe(0);
      expect(stdout).toBe("");
      expect(stderr).toContain(`bl deploy ${path.join(" ")}`);
      for (const flag of flags) expect(stderr).toContain(flag);
      expect(stderr.toLowerCase()).toContain(note.toLowerCase());
      expect(stderr).toContain("--yes");
      expect(stderr).toContain("--dry-run");
    },
  );

  test.each([
    {
      path: ["capacity", "create"],
      args: [
        "--deployed-model",
        "dep-test",
        "--billing-method",
        "POST_PAY",
        "--input-tpm",
        "10000",
        "--output-tpm",
        "1000",
      ],
      expected: {
        action: "deploy.capacity.create",
        deployed_model: "dep-test",
        body: {
          billing_method: "POST_PAY",
          ptu_capacity: { input_tpm: 10000, output_tpm: 1000 },
        },
        client_request_id: "<generated UUID>",
        wait: false,
      },
    },
    {
      path: ["capacity", "scale"],
      args: [
        "--deployed-model",
        "dep-test",
        "--instance-id",
        "instance-test",
        "--input-tpm",
        "0",
        "--output-tpm",
        "0",
        "--request-id",
        "11111111-2222-3333-4444-555555555555",
      ],
      expected: {
        action: "deploy.capacity.scale",
        deployed_model: "dep-test",
        instance_id: "instance-test",
        body: { ptu_capacity: { input_tpm: 0, output_tpm: 0 } },
        client_request_id: "11111111-2222-3333-4444-555555555555",
        precheck: "can_scale",
        wait: false,
      },
    },
    {
      path: ["capacity", "renew"],
      args: [
        "--deployed-model",
        "dep-test",
        "--instance-id",
        "instance-test",
        "--duration",
        "30",
        "--auto-renewal",
        "true",
        "--auto-renewal-duration",
        "30",
      ],
      expected: {
        action: "deploy.capacity.renew",
        deployed_model: "dep-test",
        instance_id: "instance-test",
        body: {
          pre_paid_info: { duration: 30, auto_renewal: true, auto_renewal_duration: 30 },
          is_change: false,
        },
        client_request_id: "<generated UUID>",
        precheck: "can_renew/pre_paid/configured_capacity",
        wait: false,
      },
    },
    {
      path: ["capacity", "delete"],
      args: [
        "--deployed-model",
        "dep-test",
        "--instance-id",
        "instance-test",
        "--reason",
        "release capacity",
      ],
      expected: {
        action: "deploy.capacity.delete",
        deployed_model: "dep-test",
        instance_id: "instance-test",
        query: { reason: "release capacity" },
        client_request_id: "<generated UUID>",
        precheck: "can_delete/prepaid_unsubscribe",
        wait: false,
      },
    },
    {
      path: ["overflow"],
      args: ["--deployed-model", "dep-test", "--strategy", "enable"],
      expected: {
        action: "deploy.overflow",
        deployed_model: "dep-test",
        body: { overflow_strategy: "enable" },
      },
    },
  ])(
    "deploy $path --dry-run previews the write with no network",
    async ({ path, args, expected }) => {
      const { stdout, stderr, exitCode } = await runReadOnlyDeploy([...path, ...args]);
      expect(exitCode, stderr).toBe(0);
      expect(parseStdoutJson(stdout)).toEqual(expected);
      expect(stderr).not.toContain("Network disabled");
    },
  );

  test.each([
    { path: ["capacity", "create"], args: [], missing: "--deployed-model" },
    {
      path: ["capacity", "create"],
      args: ["--deployed-model", "dep-test", "--input-tpm", "1", "--output-tpm", "1"],
      missing: "--billing-method",
    },
    { path: ["capacity", "scale"], args: [], missing: "--deployed-model" },
    {
      path: ["capacity", "scale"],
      args: ["--deployed-model", "dep-test"],
      missing: "--instance-id",
    },
    { path: ["capacity", "renew"], args: [], missing: "--deployed-model" },
    {
      path: ["capacity", "renew"],
      args: ["--deployed-model", "dep-test", "--instance-id", "instance-test"],
      missing: "--duration",
    },
    { path: ["capacity", "delete"], args: [], missing: "--deployed-model" },
    {
      path: ["capacity", "delete"],
      args: ["--deployed-model", "dep-test"],
      missing: "--instance-id",
    },
    { path: ["overflow"], args: [], missing: "--deployed-model" },
    { path: ["overflow"], args: ["--deployed-model", "dep-test"], missing: "--strategy" },
  ])("deploy $path requires $missing even during dry-run", async ({ path, args, missing }) => {
    const { stdout, stderr, exitCode } = await runReadOnlyDeploy([...path, ...args]);
    expect(exitCode, stderr).toBe(2);
    expect(stdout.trim()).toBe("");
    expect(stderr).toContain(missing);
  });

  test("capacity create rejects unpaired --input-tpm during dry-run", async () => {
    const { stdout, stderr, exitCode } = await runReadOnlyDeploy([
      "capacity",
      "create",
      "--deployed-model",
      "dep-test",
      "--billing-method",
      "POST_PAY",
      "--input-tpm",
      "10000",
    ]);
    expect(exitCode, stderr).toBe(2);
    expect(stdout.trim()).toBe("");
    expect(stderr).toContain("--output-tpm");
  });

  test("capacity create rejects prepaid settings on POST_PAY during dry-run", async () => {
    const { stdout, stderr, exitCode } = await runReadOnlyDeploy([
      "capacity",
      "create",
      "--deployed-model",
      "dep-test",
      "--billing-method",
      "POST_PAY",
      "--input-tpm",
      "10000",
      "--output-tpm",
      "1000",
      "--duration",
      "30",
    ]);
    expect(exitCode, stderr).toBe(2);
    expect(stdout.trim()).toBe("");
    expect(stderr).toMatch(/POST_PAY/);
  });

  test("capacity scale rejects --interval without --wait during dry-run", async () => {
    const { stdout, stderr, exitCode } = await runReadOnlyDeploy([
      "capacity",
      "scale",
      "--deployed-model",
      "dep-test",
      "--instance-id",
      "instance-test",
      "--input-tpm",
      "1",
      "--output-tpm",
      "1",
      "--interval",
      "5",
    ]);
    expect(exitCode, stderr).toBe(2);
    expect(stdout.trim()).toBe("");
    expect(stderr).toContain("--wait");
  });

  test.each([
    {
      path: ["capacity", "create"],
      args: [
        "--deployed-model",
        "dep-test",
        "--billing-method",
        "POST_PAY",
        "--input-tpm",
        "1",
        "--output-tpm",
        "1",
      ],
    },
    {
      path: ["capacity", "scale"],
      args: [
        "--deployed-model",
        "dep-test",
        "--instance-id",
        "instance-test",
        "--input-tpm",
        "1",
        "--output-tpm",
        "1",
      ],
    },
    {
      path: ["capacity", "renew"],
      args: [
        "--deployed-model",
        "dep-test",
        "--instance-id",
        "instance-test",
        "--duration",
        "30",
        "--auto-renewal",
        "false",
      ],
    },
    {
      path: ["capacity", "delete"],
      args: ["--deployed-model", "dep-test", "--instance-id", "instance-test"],
    },
    { path: ["overflow"], args: ["--deployed-model", "dep-test", "--strategy", "disable"] },
  ])("deploy $path without --yes requires confirmation (7)", async ({ path, args }) => {
    const { stdout, stderr, exitCode } = await runCommandE2e(
      DEPLOY_ROUTES,
      ["deploy", ...path, ...args, "--api-key", "e2e-dummy-key", "--output", "json"],
      READ_ONLY_ENV,
    );
    expect(exitCode, stderr).toBe(7);
    expect(stdout.trim()).toBe("");
    expect(JSON.parse(stderr)).toMatchObject({
      error: { code: 7, type: "requires_confirmation" },
    });
  });
});

describe.skipIf(!isDashScopeE2EReady())("e2e: deploy (DashScope)", () => {
  /**
   * 不同开发者的 key 状态不一：可能鉴权失败、可能账号下没有任何部署记录、
   * 也可能受区域/权限限制。因此本用例不假设"有数据"或"调用成功"：
   *   - 成功（exit 0）：响应必须可解析；deployments 可能为空数组或不存在。
   *   - 失败（非零退出）：只要 CLI 把服务端/鉴权错误优雅上抛（stderr 有内容、
   *     而非进程崩溃），即视为通过。
   */
  test("deploy list --output json 优雅返回（空账号或鉴权失败均通过）", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(DEPLOY_ROUTES, [
      "deploy",
      "list",
      "--page-size",
      "5",
      "--output",
      "json",
    ]);
    if (exitCode === 0) {
      const data = parseStdoutJson<{ data?: { deployments?: unknown[] } }>(stdout);
      expect(data).toBeTruthy();
      if (data.data?.deployments) {
        expect(Array.isArray(data.data.deployments)).toBe(true);
      }
    } else {
      expect(stderr.length).toBeGreaterThan(0);
    }
  }, 60_000);
});

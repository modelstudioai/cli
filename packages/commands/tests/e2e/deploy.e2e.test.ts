import { createServer, type RequestListener } from "node:http";
import type { Socket } from "node:net";
import { fileURLToPath } from "node:url";
import { httpTransport } from "bailian-cli-core";
import { describe, expect, test, vi } from "vite-plus/test";
import {
  isDashScopeE2EReady,
  parseStdoutJson,
  runCommandHelp,
  runCommandE2e,
  runCommandInProcess,
} from "./helpers.ts";
import { DEPLOY_ROUTES, DEPLOY_ROUTER_ROUTES } from "./topic-routes.ts";

// No files are created: isolate user config and block fetch in the child process,
// including the runtime's background npm version check. Never load an env file.
const READ_ONLY_ENV: NodeJS.ProcessEnv = {
  BAILIAN_E2E: "0",
  DO_NOT_TRACK: "1",
  BAILIAN_CONFIG_DIR: fileURLToPath(
    new URL("./fixtures/deploy-query-no-user-config", import.meta.url),
  ),
  NODE_OPTIONS: `--import=data:text/javascript,${encodeURIComponent(`import { createRequire } from "node:module";
const require = createRequire(${JSON.stringify(fileURLToPath(new URL("../../../core/package.json", import.meta.url)))});
require("undici").fetch = globalThis.fetch = async () => { throw new Error("Network disabled for deploy query E2E"); };`)}`,
};

const IN_PROCESS_ENV: NodeJS.ProcessEnv = {
  ...READ_ONLY_ENV,
  NODE_OPTIONS: "",
  NODE_USE_ENV_PROXY: "0",
  HTTP_PROXY: "",
  HTTPS_PROXY: "",
  ALL_PROXY: "",
  http_proxy: "",
  https_proxy: "",
  all_proxy: "",
  DASHSCOPE_API_KEY: "",
  BAILIAN_API_KEY: "",
  DASHSCOPE_BASE_URL: "",
  BAILIAN_BASE_URL: "",
  BAILIAN_WORKSPACE_ID: "",
  DASHSCOPE_OUTPUT: "",
  DASHSCOPE_QUIET: "0",
  DASHSCOPE_VERBOSE: "0",
};

async function runOfflineDeploy(args: string[]) {
  // Keep the no-network contract without NODE_OPTIONS forcing every matrix case
  // into a new process. Fail even if command code catches a forbidden request.
  const transportFetch = vi
    .spyOn(httpTransport, "fetch")
    .mockRejectedValue(new Error("Network disabled for deploy query E2E"));
  const nativeFetch = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("Network disabled for deploy query E2E"));
  try {
    const result = await runCommandInProcess(DEPLOY_ROUTES, args, IN_PROCESS_ENV);
    expect(transportFetch).not.toHaveBeenCalled();
    expect(nativeFetch).not.toHaveBeenCalled();
    return result;
  } finally {
    transportFetch.mockRestore();
    nativeFetch.mockRestore();
  }
}

function runReadOnlyDeploy(args: string[]) {
  return runOfflineDeploy([
    "deploy",
    ...args,
    "--api-key",
    "e2e-dummy-key",
    "--dry-run",
    "--output",
    "json",
    "--quiet",
  ]);
}

async function runOfflineRouter(args: string[]) {
  const transportFetch = vi
    .spyOn(httpTransport, "fetch")
    .mockRejectedValue(new Error("Network disabled for deploy router E2E"));
  const nativeFetch = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("Network disabled for deploy router E2E"));
  try {
    const result = await runCommandInProcess(DEPLOY_ROUTER_ROUTES, args, IN_PROCESS_ENV);
    expect(transportFetch).not.toHaveBeenCalled();
    expect(nativeFetch).not.toHaveBeenCalled();
    return result;
  } finally {
    transportFetch.mockRestore();
    nativeFetch.mockRestore();
  }
}

function runReadOnlyRouter(args: string[]) {
  return runOfflineRouter([
    "deploy",
    "router",
    ...args,
    "--api-key",
    "e2e-dummy-key",
    "--dry-run",
    "--output",
    "json",
    "--quiet",
  ]);
}

interface RouterRequest {
  method: string | undefined;
  url: string | undefined;
  authorization: string | undefined;
  body: string;
}

async function withRouterServer(
  handler: RequestListener,
  run: (url: string, requests: RouterRequest[]) => Promise<void>,
): Promise<void> {
  const requests: RouterRequest[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((incoming, response) => {
    const request: RouterRequest = {
      method: incoming.method,
      url: incoming.url,
      authorization: incoming.headers.authorization,
      body: "",
    };
    requests.push(request);
    incoming.setEncoding("utf8");
    incoming.on("data", (chunk: string) => {
      request.body += chunk;
    });
    incoming.once("end", () => handler(incoming, response));
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a local TCP server");
    await run(`http://127.0.0.1:${address.port}`, requests);
  } finally {
    const closed = server.listening
      ? new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        })
      : Promise.resolve();
    for (const socket of sockets) socket.destroy();
    await closed;
  }
}

test.each([
  {
    label: "read-only query preview",
    args: [
      "deploy",
      "capacity",
      "list",
      "--deployed-model",
      "dep-test",
      "--dry-run",
      "--api-key",
      "e2e-dummy-key",
    ],
    exitCode: 0,
  },
  {
    label: "missing required query flag",
    args: [
      "deploy",
      "capacity",
      "get",
      "--deployed-model",
      "dep-test",
      "--dry-run",
      "--api-key",
      "e2e-dummy-key",
    ],
    exitCode: 2,
  },
  {
    label: "risky write confirmation",
    args: [
      "deploy",
      "capacity",
      "delete",
      "--deployed-model",
      "dep-test",
      "--instance-id",
      "instance-test",
      "--api-key",
      "e2e-dummy-key",
    ],
    exitCode: 7,
  },
  {
    label: "refund link without credentials",
    args: ["deploy", "capacity", "unsubscribe", "--instance-id", "a b&c"],
    exitCode: 0,
  },
])("$label matches the network-blocked subprocess exactly", async ({ args, exitCode }) => {
  const commandArgs = [...args, "--output", "json"];
  const inProcess = await runOfflineDeploy(commandArgs);
  // Preserve real startup/preload coverage and block networking in that process.
  const subprocess = await runCommandE2e(DEPLOY_ROUTES, commandArgs, {
    ...IN_PROCESS_ENV,
    NODE_OPTIONS: READ_ONLY_ENV.NODE_OPTIONS,
  });
  expect(subprocess.exitCode, subprocess.stderr).toBe(exitCode);
  expect(inProcess).toEqual(subprocess);
});

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
    return runOfflineDeploy(["deploy", "capacity", "unsubscribe", ...args, "--output", "json"]);
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

  test("--quiet retains the complete refund-link result", async () => {
    const { stdout, stderr, exitCode } = await runOfflineDeploy([
      "deploy",
      "capacity",
      "unsubscribe",
      "--instance-id",
      INSTANCE_ID,
      "--quiet",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      action: "deploy.capacity.unsubscribe",
      instance_id: INSTANCE_ID,
      refund_url: REFUND_URL,
    });
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
      path: ["capacity", "auto-renew", "enable"],
      flags: ["--deployed-model", "--instance-id", "--cycle", "--auto-renewal-duration"],
      note: "prepaid",
    },
    {
      path: ["capacity", "auto-renew", "disable"],
      flags: ["--deployed-model", "--instance-id", "--cycle", "--auto-renewal-duration"],
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
      path: ["capacity", "auto-renew", "enable"],
      args: [
        "--deployed-model",
        "dep-test",
        "--instance-id",
        "instance-test",
        "--cycle",
        "Day",
        "--auto-renewal-duration",
        "30",
      ],
      expected: {
        action: "deploy.capacity.auto-renew.enable",
        deployed_model: "dep-test",
        instance_id: "instance-test",
        body: { auto_renewal: true, auto_renewal_cycle: "Day", auto_renewal_duration: 30 },
        client_request_id: "<generated UUID>",
        precheck: "can_enable_auto_renew",
        wait: false,
      },
    },
    {
      path: ["capacity", "auto-renew", "disable"],
      args: [
        "--deployed-model",
        "dep-test",
        "--instance-id",
        "instance-test",
        "--cycle",
        "Day",
        "--auto-renewal-duration",
        "30",
      ],
      expected: {
        action: "deploy.capacity.auto-renew.disable",
        deployed_model: "dep-test",
        instance_id: "instance-test",
        body: { auto_renewal: false, auto_renewal_cycle: "Day", auto_renewal_duration: 30 },
        client_request_id: "<generated UUID>",
        precheck: "can_disable_auto_renew",
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
    { path: ["capacity", "auto-renew", "enable"], args: [], missing: "--deployed-model" },
    {
      path: ["capacity", "auto-renew", "enable"],
      args: ["--deployed-model", "dep-test", "--instance-id", "instance-test"],
      missing: "--cycle",
    },
    { path: ["capacity", "auto-renew", "disable"], args: [], missing: "--deployed-model" },
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

  test("capacity create previews the exact 8-hour off-peak purchase during dry-run", async () => {
    const { stdout, stderr, exitCode } = await runReadOnlyDeploy([
      "capacity",
      "create",
      "--deployed-model",
      "dep-test",
      "--billing-method",
      "PRE_PAY",
      "--pricing-cycle",
      "Hour",
      "--duration",
      "8",
      "--auto-renewal",
      "false",
      "--input-tpm",
      "10000",
      "--output-tpm",
      "1000",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(parseStdoutJson(stdout)).toEqual({
      action: "deploy.capacity.create",
      deployed_model: "dep-test",
      body: {
        billing_method: "PRE_PAY",
        ptu_capacity: { input_tpm: 10000, output_tpm: 1000 },
        pre_paid_info: { pricing_cycle: "Hour", duration: 8, auto_renewal: false },
      },
      client_request_id: "<generated UUID>",
      wait: false,
    });
    expect(stderr).not.toContain("Network disabled");
  });

  test("capacity create rejects Hour off-peak violations during dry-run", async () => {
    const { stdout, stderr, exitCode } = await runReadOnlyDeploy([
      "capacity",
      "create",
      "--deployed-model",
      "dep-test",
      "--billing-method",
      "PRE_PAY",
      "--pricing-cycle",
      "Hour",
      "--duration",
      "30",
      "--input-tpm",
      "10000",
      "--output-tpm",
      "1000",
    ]);
    expect(exitCode, stderr).toBe(2);
    expect(stdout.trim()).toBe("");
    expect(stderr).toMatch(/Hour/);
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
    const { stdout, stderr, exitCode } = await runOfflineDeploy([
      "deploy",
      ...path,
      ...args,
      "--api-key",
      "e2e-dummy-key",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(7);
    expect(stdout.trim()).toBe("");
    expect(JSON.parse(stderr)).toMatchObject({
      error: { code: 7, type: "requires_confirmation" },
    });
  });
});

describe("e2e: deploy router help (offline, no credentials)", () => {
  test.each([
    { path: ["versions"], flags: ["--page", "--page-size"], note: "model-routing" },
    {
      path: ["create"],
      flags: ["--name", "--route-version", "--strategy", "--candidates"],
      note: "postpaid",
    },
    { path: ["list"], flags: ["--page", "--page-size"], note: "model router" },
    { path: ["get"], flags: ["--deployed-model"], note: "model router" },
    {
      path: ["update"],
      flags: ["--deployed-model", "--route-version", "--strategy", "--candidates"],
      note: "replace",
    },
    { path: ["delete"], flags: ["--deployed-model"], note: "Delete" },
  ])("deploy router $path --help exposes flags and semantics", async ({ path, flags, note }) => {
    const { stdout, stderr, exitCode } = await runCommandHelp(DEPLOY_ROUTER_ROUTES, [
      "deploy",
      "router",
      ...path,
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stdout).toBe("");
    for (const flag of flags) expect(stderr).toContain(flag);
    expect(stderr.toLowerCase()).toContain(note.toLowerCase());
    expect(stderr).toContain("--api-key");
  });

  test("deploy router create --help shows --yes (high-risk billing)", async () => {
    const { stderr, exitCode } = await runCommandHelp(DEPLOY_ROUTER_ROUTES, [
      "deploy",
      "router",
      "create",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--yes");
  });

  test("deploy router delete --help shows --yes (high-risk destructive)", async () => {
    const { stderr, exitCode } = await runCommandHelp(DEPLOY_ROUTER_ROUTES, [
      "deploy",
      "router",
      "delete",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--yes");
  });

  test("deploy router update --help does NOT show --yes (no risk)", async () => {
    const { stderr, exitCode } = await runCommandHelp(DEPLOY_ROUTER_ROUTES, [
      "deploy",
      "router",
      "update",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).not.toContain("--yes");
  });
});

describe("e2e: deploy router dry-run (offline, no credentials)", () => {
  test("router create --dry-run previews with fixed plan=mr and charge_type=post_paid", async () => {
    const { stdout, stderr, exitCode } = await runReadOnlyRouter([
      "create",
      "--name",
      "test-router",
      "--route-version",
      "v1",
      "--strategy",
      "EFFECT_FIRST",
      "--candidates",
      "qwen-plus,qwen-turbo",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      action: string;
      body: {
        name: string;
        plan: string;
        charge_type: string;
        routing_config: { candidate_model_ids: string[] };
      };
    }>(stdout);
    expect(data.action).toBe("deploy.router.create");
    expect(data.body.plan).toBe("mr");
    expect(data.body.charge_type).toBe("post_paid");
    expect(data.body.name).toBe("test-router");
    expect(data.body.routing_config.candidate_model_ids).toEqual(["qwen-plus", "qwen-turbo"]);
  });

  test("router update --dry-run previews complete routing_config", async () => {
    const { stdout, stderr, exitCode } = await runReadOnlyRouter([
      "update",
      "--deployed-model",
      "router-test",
      "--route-version",
      "v2",
      "--strategy",
      "COST_FIRST",
      "--candidates",
      "qwen-max",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{
      plan: {
        action: string;
        deployed_model: string;
        body: { routing_config: { route_model_version: string; strategy: string } };
      };
      risk: null;
      notices: unknown[];
    }>(stdout);
    expect(data.plan.action).toBe("deploy.router.update");
    expect(data.plan.deployed_model).toBe("router-test");
    expect(data.plan.body.routing_config.route_model_version).toBe("v2");
    expect(data.plan.body.routing_config.strategy).toBe("COST_FIRST");
    expect(data.risk).toBeNull();
    expect(data.notices).toEqual([]);
  });

  test("router delete --dry-run sends zero requests", async () => {
    const { stdout, stderr, exitCode } = await runReadOnlyRouter([
      "delete",
      "--deployed-model",
      "router-test",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(parseStdoutJson(stdout)).toEqual({
      action: "deploy.router.delete",
      deployed_model: "router-test",
    });
  });

  test("router versions --dry-run previews with default pagination", async () => {
    const { stdout, stderr, exitCode } = await runReadOnlyRouter(["versions"]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ action: string; page: number; page_size: number }>(stdout);
    expect(data.action).toBe("deploy.router.versions");
    expect(data.page).toBe(1);
    expect(data.page_size).toBe(50);
  });

  test("router list --dry-run previews with fixed plan=mr", async () => {
    const { stdout, stderr, exitCode } = await runReadOnlyRouter(["list"]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<{ action: string; plan: string }>(stdout);
    expect(data.action).toBe("deploy.router.list");
    expect(data.plan).toBe("mr");
  });

  test("router get --dry-run previews the deployed-model", async () => {
    const { stdout, stderr, exitCode } = await runReadOnlyRouter([
      "get",
      "--deployed-model",
      "router-test",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(parseStdoutJson(stdout)).toEqual({
      action: "deploy.router.get",
      deployed_model: "router-test",
    });
  });
});

test("router partial update uses the real Client for GET-only preview and GET then PUT execution", async () => {
  const currentConfig = {
    route_model_version: "v1",
    strategy: "EFFECT_FIRST",
    candidate_model_ids: ["old-a", "old-b"],
    offline_model_ids: ["offline-a"],
    future_field: { enabled: true },
  };
  await withRouterServer(
    (incoming, response) => {
      if (incoming.method === "GET" && incoming.url === "/api/v1/deployments/router%2Flocal") {
        response.writeHead(200, { "content-type": "application/json" }).end(
          JSON.stringify({
            request_id: "request-get",
            output: { plan: "mr", status: "RUNNING", routing_config: currentConfig },
          }),
        );
        return;
      }
      if (
        incoming.method === "PUT" &&
        incoming.url === "/api/v1/deployments/router%2Flocal/update"
      ) {
        response
          .writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify({ request_id: "request-put", output: { updated: true } }));
        return;
      }
      response.writeHead(404).end();
    },
    async (baseUrl, requests) => {
      const commonArgs = [
        "deploy",
        "router",
        "update",
        "--deployed-model",
        "router/local",
        "--api-key",
        "e2e-dummy-key",
        "--base-url",
        baseUrl,
        "--output",
        "json",
        "--quiet",
      ];
      const preview = await runCommandInProcess(
        DEPLOY_ROUTER_ROUTES,
        [...commonArgs, "--strategy", "COST_FIRST", "--dry-run"],
        IN_PROCESS_ENV,
      );
      expect(preview.exitCode, preview.stderr).toBe(0);
      expect(requests.map(({ method }) => method)).toEqual(["GET"]);
      expect(
        parseStdoutJson<{
          plan: { body: { routing_config: Record<string, unknown> } };
        }>(preview.stdout).plan.body.routing_config,
      ).toEqual({
        ...currentConfig,
        strategy: "COST_FIRST",
      });

      const update = await runCommandInProcess(
        DEPLOY_ROUTER_ROUTES,
        [...commonArgs, "--candidates", "new-a,new-b"],
        IN_PROCESS_ENV,
      );
      expect(update.exitCode, update.stderr).toBe(0);
      expect(parseStdoutJson(update.stdout)).toEqual({
        request_id: "request-put",
        output: { updated: true },
      });
      expect(requests.map(({ method }) => method)).toEqual(["GET", "GET", "PUT"]);
      expect(requests.map(({ url }) => url)).toEqual([
        "/api/v1/deployments/router%2Flocal",
        "/api/v1/deployments/router%2Flocal",
        "/api/v1/deployments/router%2Flocal/update",
      ]);
      expect(requests.every(({ authorization }) => authorization === "Bearer e2e-dummy-key")).toBe(
        true,
      );
      expect(JSON.parse(requests[2].body)).toEqual({
        routing_config: {
          ...currentConfig,
          candidate_model_ids: ["new-a", "new-b"],
        },
      });
    },
  );
});

describe.each([
  { command: "create", resourceArgs: ["--name", "test-router"] },
  { command: "update", resourceArgs: ["--deployed-model", "router-test"] },
])("e2e: router $command candidate lists (offline)", ({ command, resourceArgs }) => {
  test.each([
    { candidates: "qwen-plus", expected: ["qwen-plus"] },
    { candidates: "qwen-plus,qwen-turbo", expected: ["qwen-plus", "qwen-turbo"] },
    { candidates: " qwen-plus , qwen-turbo ", expected: ["qwen-plus", "qwen-turbo"] },
    { candidates: "qwen-plus,qwen-plus,qwen-turbo", expected: ["qwen-plus", "qwen-turbo"] },
  ])("parses --candidates $candidates", async ({ candidates, expected }) => {
    const { stdout, stderr, exitCode } = await runReadOnlyRouter([
      command,
      ...resourceArgs,
      "--route-version",
      "v1",
      "--strategy",
      "EFFECT_FIRST",
      "--candidates",
      candidates,
    ]);
    expect(exitCode, stderr).toBe(0);
    const result = parseStdoutJson<{
      body?: { routing_config: { candidate_model_ids: string[] } };
      plan?: { body: { routing_config: { candidate_model_ids: string[] } } };
    }>(stdout);
    expect((result.body ?? result.plan?.body)?.routing_config.candidate_model_ids).toEqual(
      expected,
    );
  });

  test.each(["", " ", ",qwen-plus", "qwen-plus,", "qwen-plus,,qwen-turbo"])(
    "rejects empty entries in --candidates %j",
    async (candidates) => {
      const { stdout, stderr, exitCode } = await runReadOnlyRouter([
        command,
        ...resourceArgs,
        "--route-version",
        "v1",
        "--strategy",
        "EFFECT_FIRST",
        "--candidates",
        candidates,
      ]);
      expect(exitCode, stderr).toBe(2);
      expect(stdout.trim()).toBe("");
      expect(stderr).toContain("--candidates");
    },
  );
});

test("router CSV dry-run matches the network-blocked subprocess", async () => {
  const args = [
    "deploy",
    "router",
    "create",
    "--name",
    "test-router",
    "--route-version",
    "v1",
    "--strategy",
    "EFFECT_FIRST",
    "--candidates",
    " qwen-plus ,qwen-turbo,qwen-plus ",
    "--api-key",
    "e2e-dummy-key",
    "--dry-run",
    "--output",
    "json",
    "--quiet",
  ];
  const inProcess = await runOfflineRouter(args);
  const subprocess = await runCommandE2e(DEPLOY_ROUTER_ROUTES, args, {
    ...IN_PROCESS_ENV,
    NODE_OPTIONS: READ_ONLY_ENV.NODE_OPTIONS,
  });
  expect(subprocess.exitCode, subprocess.stderr).toBe(0);
  expect(inProcess).toEqual(subprocess);
});

describe("e2e: deploy router missing required flags (offline)", () => {
  test.each([
    {
      path: ["create"],
      args: ["--route-version", "v1", "--strategy", "EFFECT_FIRST", "--candidates", "qwen"],
      missing: "--name",
    },
    {
      path: ["create"],
      args: ["--name", "r", "--strategy", "EFFECT_FIRST", "--candidates", "qwen"],
      missing: "--route-version",
    },
    {
      path: ["create"],
      args: ["--name", "r", "--route-version", "v1", "--candidates", "qwen"],
      missing: "--strategy",
    },
    {
      path: ["create"],
      args: ["--name", "r", "--route-version", "v1", "--strategy", "EFFECT_FIRST"],
      missing: "--candidates",
    },
    {
      path: ["update"],
      args: ["--route-version", "v1", "--strategy", "COST_FIRST", "--candidates", "qwen"],
      missing: "--deployed-model",
    },
    {
      path: ["update"],
      args: ["--deployed-model", "router-test"],
      missing: "--route-version",
    },
    { path: ["delete"], args: [], missing: "--deployed-model" },
    { path: ["get"], args: [], missing: "--deployed-model" },
  ])("deploy router $path requires $missing", async ({ path, args, missing }) => {
    const { stdout, stderr, exitCode } = await runReadOnlyRouter([...path, ...args]);
    expect(exitCode, stderr).toBe(2);
    expect(stdout.trim()).toBe("");
    expect(stderr).toContain(missing);
  });
});

describe("e2e: deploy router high-risk confirmation", () => {
  test("router create without --yes requires confirmation (7)", async () => {
    const { stdout, stderr, exitCode } = await runOfflineRouter([
      "deploy",
      "router",
      "create",
      "--name",
      "test-router",
      "--route-version",
      "v1",
      "--strategy",
      "EFFECT_FIRST",
      "--candidates",
      "qwen-plus",
      "--api-key",
      "e2e-dummy-key",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(7);
    expect(stdout.trim()).toBe("");
    expect(JSON.parse(stderr)).toMatchObject({
      error: { code: 7, type: "requires_confirmation" },
    });
  });

  test("router delete without --yes requires confirmation (7)", async () => {
    const { stdout, stderr, exitCode } = await runOfflineRouter([
      "deploy",
      "router",
      "delete",
      "--deployed-model",
      "router-test",
      "--api-key",
      "e2e-dummy-key",
      "--output",
      "json",
    ]);
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

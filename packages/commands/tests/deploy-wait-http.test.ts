import { spawn } from "child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer, type RequestListener, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vite-plus/test";

const WORKSPACE_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const CLI_ENTRY = fileURLToPath(new URL("../../cli/src/main.ts", import.meta.url));
const CONFIG_DIRECTORY = fileURLToPath(
  new URL(`./.deploy-wait-no-user-config-${randomUUID()}`, import.meta.url),
);

// Keep real loopback fetch, but block background npm/telemetry requests before
// they reach the network. Disallow redirects so local responses cannot escape.
const LOCAL_FETCH_ONLY = `
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1") {
    throw new Error("Remote fetch blocked for deploy HTTP regression");
  }
  return realFetch(input, { ...init, redirect: "error" });
};
`;

// Do not inherit credentials, preload hooks, or dotenv settings. This directory
// must stay nonexistent: no config, fixtures, or cache files need to be created.
const READ_ONLY_ENV: NodeJS.ProcessEnv = {
  PATH: process.env.PATH,
  HOME: CONFIG_DIRECTORY,
  USERPROFILE: CONFIG_DIRECTORY,
  XDG_CONFIG_HOME: CONFIG_DIRECTORY,
  BAILIAN_CONFIG_DIR: CONFIG_DIRECTORY,
  BAILIAN_E2E: "0",
  DO_NOT_TRACK: "1",
  TSX_DISABLE_CACHE: "1",
  NODE_DISABLE_COMPILE_CACHE: "1",
  NODE_OPTIONS: `--import=data:text/javascript,${encodeURIComponent(LOCAL_FETCH_ONLY)}`,
  NODE_USE_ENV_PROXY: "0",
  HTTP_PROXY: "",
  http_proxy: "",
  HTTPS_PROXY: "",
  https_proxy: "",
  ALL_PROXY: "",
  all_proxy: "",
  NO_PROXY: "",
  no_proxy: "",
};

const DEPLOYED_MODEL = "dep/local model";
const OPERATION_ID = "000900719925474099312345";
const INSTANCE_ID = "instance/local";
// Literal expectations intentionally do not use production endpoint helpers.
const DEPLOYMENT_PATH = "/api/v1/deployments/dep%2Flocal%20model";
const OPERATION_PATH = `${DEPLOYMENT_PATH}/capacity-operations/${OPERATION_ID}`;
const INSTANCE_PATH = `${DEPLOYMENT_PATH}/capacity-instances/instance%2Flocal`;
const SERVER_WATCHDOG_MS = 15_000;
const PROCESS_WATCHDOG_MS = 20_000;
const TEST_TIMEOUT_MS = 25_000;

interface ObservedRequest {
  method: string | undefined;
  url: string | undefined;
  body: string;
}

interface LocalServer {
  url: string;
  requests: ObservedRequest[];
  firstRequestAt: number | undefined;
}

async function withServer(
  handler: RequestListener,
  run: (local: LocalServer) => Promise<void>,
): Promise<void> {
  const sockets = new Set<Socket>();
  const local: LocalServer = { url: "", requests: [], firstRequestAt: undefined };
  const server = createServer((incoming, response) => {
    local.firstRequestAt ??= performance.now();
    const request: ObservedRequest = { method: incoming.method, url: incoming.url, body: "" };
    local.requests.push(request);
    incoming.setEncoding("utf8");
    incoming.on("data", (chunk: string) => {
      request.body += chunk;
    });
    incoming.once("end", () => {
      if (request.method !== "GET" || request.body !== "") {
        response.writeHead(405).end();
        return;
      }
      handler(incoming, response);
    });
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  let watchdogFired = false;
  const watchdog = setTimeout(() => {
    watchdogFired = true;
    for (const socket of sockets) socket.destroy();
  }, SERVER_WATCHDOG_MS);
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a local TCP server");
    local.url = `http://127.0.0.1:${address.port}`;
    await run(local);
    expect(watchdogFired, "The CLI must exit without the socket watchdog").toBe(false);
  } finally {
    clearTimeout(watchdog);
    const closed = server.listening
      ? new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        })
      : Promise.resolve();
    for (const socket of sockets) socket.destroy();
    await closed;
  }
}

async function runCli(url: string, args: string[], interruptAfter?: Promise<void>) {
  expect(existsSync(CONFIG_DIRECTORY)).toBe(false);
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      CLI_ENTRY,
      "deploy",
      "operation",
      ...args,
      "--deployed-model",
      DEPLOYED_MODEL,
      "--operation-id",
      OPERATION_ID,
      "--api-key",
      "local-dummy-api-key",
      "--base-url",
      url,
      "--output",
      "json",
      "--quiet",
    ],
    { cwd: WORKSPACE_ROOT, env: READ_ONLY_ENV, stdio: ["ignore", "pipe", "pipe"] },
  );
  let stdout = "";
  let stderr = "";
  let didClose = false;
  let spawnError: Error | undefined;
  let interruptSent = false;
  let watchdogFired = false;
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
    stderr += chunk;
  });
  const closed = new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>(
    (resolve) => {
      child.once("error", (error: Error) => {
        spawnError = error;
      });
      child.once("close", (exitCode: number | null, signal: NodeJS.Signals | null) => {
        didClose = true;
        resolve({ exitCode, signal });
      });
    },
  );
  const watchdog = setTimeout(() => {
    watchdogFired = true;
    child.kill("SIGKILL");
  }, PROCESS_WATCHDOG_MS);
  try {
    // The signal is triggered by the server's first PROCESSING response, never
    // by a startup delay or a signal broadcast to the test runner/process group.
    void interruptAfter?.then(() => {
      if (!didClose) interruptSent = child.kill("SIGINT");
    });
    const result = await closed;
    if (spawnError) throw spawnError;
    expect(watchdogFired, `Child watchdog fired. stderr: ${stderr}`).toBe(false);
    return { ...result, stdout, stderr, interruptSent, closedAt: performance.now() };
  } finally {
    clearTimeout(watchdog);
    if (!didClose) {
      child.kill("SIGKILL");
      await closed;
    }
    expect(existsSync(CONFIG_DIRECTORY), "The CLI must not create config or cache files").toBe(
      false,
    );
  }
}

function sendJson(response: ServerResponse, body: unknown): void {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function expectGets(local: LocalServer, paths: string[]): void {
  expect(local.requests).toEqual(paths.map((url) => ({ method: "GET", url, body: "" })));
}

const FAILED_RESPONSE = {
  request_id: "local-failed-query-request",
  output: {
    operation_id: OPERATION_ID,
    request_id: "original-write-request",
    operation_status: "FAILED",
    instance_id: INSTANCE_ID,
    error_code: "CapacityRejected.Original",
    error_message: "服务端原文 / original service message: capacity=0, retry=false\n原样保留。",
  },
};

// No live-E2E gating or shared E2E setup: every request goes to our own server.
describe("deploy operation real CLI over loopback HTTP", () => {
  test(
    "wait refreshes operation → instance → deployment, preserving envelopes and 0/false",
    async () => {
      const operation = {
        request_id: "local-operation-request",
        output: {
          operation_id: OPERATION_ID,
          operation_status: "SUCCEEDED",
          instance_id: INSTANCE_ID,
        },
      };
      const instance = {
        request_id: "local-instance-request",
        data: {
          instance_id: INSTANCE_ID,
          model_service_id: DEPLOYED_MODEL,
          effective_capacity: { input_tpm: 0, output_tpm: 0 },
          configured_capacity: { input_tpm: 10, output_tpm: 20 },
          target_capacity: null,
          deleted: false,
          can_scale: false,
          pre_paid_info: { duration: 0, auto_renewal: false },
        },
      };
      const deployment = {
        request_id: "local-deployment-request",
        output: {
          deployed_model: DEPLOYED_MODEL,
          ptu_capacity: { input_tpm: 0, output_tpm: 0 },
          ready_capacity: 0,
          enable_thinking: false,
        },
      };
      const responses: Record<string, unknown> = {
        [OPERATION_PATH]: operation,
        [INSTANCE_PATH]: instance,
        [DEPLOYMENT_PATH]: deployment,
      };
      await withServer(
        (incoming, response) => sendJson(response, responses[incoming.url ?? ""] ?? {}),
        async (local) => {
          const result = await runCli(local.url, ["wait", "--timeout", "5", "--poll-timeout", "5"]);
          expect(result.exitCode, result.stderr).toBe(0);
          expect(result.signal).toBeNull();
          expect(result.stderr).toBe("");
          expect(JSON.parse(result.stdout)).toEqual({ ...operation, instance, deployment });
          expectGets(local, [OPERATION_PATH, INSTANCE_PATH, DEPLOYMENT_PATH]);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "wait exits 1 on FAILED, preserving the server error without refreshing",
    async () => {
      await withServer(
        (_incoming, response) => sendJson(response, FAILED_RESPONSE),
        async (local) => {
          const result = await runCli(local.url, ["wait", "--timeout", "5", "--poll-timeout", "5"]);
          expect(result.exitCode, result.stderr).toBe(1);
          expect(result.signal).toBeNull();
          expect(result.stdout).toBe("");
          expect(JSON.parse(result.stderr)).toMatchObject({
            error: {
              code: 1,
              message: FAILED_RESPONSE.output.error_message,
              http_status: 200,
              api_code: FAILED_RESPONSE.output.error_code,
              request_id: FAILED_RESPONSE.request_id,
              cause: { message: JSON.stringify(FAILED_RESPONSE.output) },
            },
          });
          expectGets(local, [OPERATION_PATH]);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "get returns FAILED unchanged with exit 0 and exactly one GET",
    async () => {
      await withServer(
        (_incoming, response) => sendJson(response, FAILED_RESPONSE),
        async (local) => {
          const result = await runCli(local.url, ["get", "--timeout", "5"]);
          expect(result.exitCode, result.stderr).toBe(0);
          expect(result.signal).toBeNull();
          expect(result.stderr).toBe("");
          expect(JSON.parse(result.stdout)).toEqual(FAILED_RESPONSE);
          expectGets(local, [OPERATION_PATH]);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  test.each([
    {
      budget: "total wait",
      timeout: "5",
      pollTimeout: "0.2",
      message: "Capacity operation wait timed out",
    },
    { budget: "single request", timeout: "0.2", pollTimeout: "5", message: "Request timed out." },
  ])(
    "$budget expires while a 200 JSON body stalls, without waiting for watchdogs",
    async ({ timeout, pollTimeout, message }) => {
      await withServer(
        (_incoming, response) => {
          response.writeHead(200, { "content-type": "application/json" });
          response.flushHeaders();
          response.write('{"output":{"operation_status":"PROCESSING');
          // Deliberately never end the body; only CLI cancellation or cleanup can close it.
        },
        async (local) => {
          const result = await runCli(local.url, [
            "wait",
            "--timeout",
            timeout,
            "--poll-timeout",
            pollTimeout,
          ]);
          expect(result.exitCode, result.stderr).toBe(5);
          expect(result.signal).toBeNull();
          expect(result.stdout).toBe("");
          expect(JSON.parse(result.stderr)).toMatchObject({
            error: { code: 5, message: expect.stringContaining(message) },
          });
          expectGets(local, [OPERATION_PATH]);
          expect(local.firstRequestAt).toBeDefined();
          // Exclude TypeScript/CLI startup. This bound is also far below the other
          // 5-second budget, so the wrong timeout source cannot make the test pass.
          expect(result.closedAt - local.firstRequestAt!).toBeLessThan(2_000);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "SIGINT after the first PROCESSING request exits 130 without success or further GETs",
    async () => {
      let processingSent!: () => void;
      const firstProcessingResponse = new Promise<void>((resolve) => {
        processingSent = resolve;
      });
      await withServer(
        (_incoming, response) => {
          response.once("finish", processingSent);
          sendJson(response, {
            request_id: "local-processing-request",
            output: { operation_id: OPERATION_ID, operation_status: "PROCESSING" },
          });
        },
        async (local) => {
          const result = await runCli(
            local.url,
            ["wait", "--interval", "1", "--timeout", "5", "--poll-timeout", "5"],
            firstProcessingResponse,
          );
          expect(result.interruptSent).toBe(true);
          expect(result.exitCode, result.stderr).toBe(130);
          expect(result.signal).toBeNull();
          expect(result.stdout).toBe("");
          expect(result.stderr).toContain("Interrupted");
          expectGets(local, [OPERATION_PATH]);
        },
      );
    },
    TEST_TIMEOUT_MS,
  );
});

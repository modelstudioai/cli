import { expect, test } from "vite-plus/test";
import type { Identity, Settings } from "../src/index.ts";
import { BailianError, ExitCode, McpClient, mapApiError, request } from "../src/index.ts";
import { parseConfigFile } from "../src/config/schema.ts";
import {
  parseBooleanValue,
  resolveBooleanFlag,
  resolveWatermark,
} from "../src/utils/boolean-flag.ts";

function testDeps(identity: Partial<Identity> = {}): { identity: Identity; settings: Settings } {
  return {
    identity: {
      binName: "bl",
      version: "0.0.0-test",
      npmPackage: "bailian-cli",
      clientName: "bailian-cli",
      ...identity,
    },
    settings: {
      output: "json",
      timeout: 30,
      verbose: false,
      quiet: true,
      dryRun: false,
      telemetry: true,
    },
  };
}

test("BailianError carries exitCode and hint", () => {
  const err = new BailianError("nope", ExitCode.AUTH, "do this");
  expect(err.name).toBe("BailianError");
  expect(err.exitCode).toBe(ExitCode.AUTH);
  expect(err.hint).toBe("do this");
  expect(err.toJSON()).toEqual({
    error: { code: ExitCode.AUTH, message: "nope", hint: "do this" },
  });
});

test("mapApiError keeps server message verbatim and surfaces metadata via err.api", () => {
  const err = mapApiError(401, { error: { message: "bad key" } });
  expect(err).toBeInstanceOf(BailianError);
  expect(err.exitCode).toBe(ExitCode.GENERAL);
  expect(err.message).toBe("bad key");
  expect(err.api?.httpStatus).toBe(401);
  expect(err.api?.apiCode).toBeUndefined();
  expect(err.api?.requestId).toBeUndefined();
});

test("mapApiError captures apiCode and request_id when present", () => {
  const err = mapApiError(429, {
    error: { message: "too many", type: "Throttling" },
    request_id: "req-abc-123",
  });
  expect(err.exitCode).toBe(ExitCode.GENERAL);
  expect(err.message).toBe("too many");
  expect(err.api).toEqual({
    httpStatus: 429,
    apiCode: "Throttling",
    requestId: "req-abc-123",
  });
});

test("BailianError propagates cause via options-bag and exposes it in toJSON", () => {
  const root = Object.assign(new Error("getaddrinfo ENOTFOUND example.invalid"), {
    code: "ENOTFOUND",
  });
  const err = new BailianError("Network request failed: ENOTFOUND", ExitCode.NETWORK, "hint", {
    cause: root,
  });
  expect(err.cause).toBe(root);
  expect(err.toJSON()).toEqual({
    error: {
      code: ExitCode.NETWORK,
      message: "Network request failed: ENOTFOUND",
      hint: "hint",
      cause: { message: root.message, code: "ENOTFOUND" },
    },
  });
});

test("toJSON splits service-error metadata into structured fields", () => {
  const err = mapApiError(404, {
    error: { message: "The model `qwen3.7` does not exist", type: "invalid_request_error" },
    request_id: "c55e1acc",
  });
  expect(err.toJSON()).toEqual({
    error: {
      code: ExitCode.GENERAL,
      message: "The model `qwen3.7` does not exist",
      http_status: 404,
      api_code: "invalid_request_error",
      request_id: "c55e1acc",
    },
  });
});

test("request uses injected client identity for User-Agent", async () => {
  const originalFetch = globalThis.fetch;
  let userAgent: string | undefined;

  globalThis.fetch = async (_url, init) => {
    const headers = init?.headers as Record<string, string> | undefined;
    userAgent = headers?.["User-Agent"];
    return new Response("{}", { status: 200 });
  };

  try {
    await request(testDeps({ clientName: "test-client", version: "9.8.7" }), {
      url: "https://example.test",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  expect(userAgent).toBe("test-client/9.8.7");
});

test("request propagates caller AbortSignal to fetch", async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  let fetchSignal: AbortSignal | undefined;
  let resolveFetch: ((response: Response) => void) | undefined;
  const fetchStarted = new Promise<void>((resolve) => {
    globalThis.fetch = async (_url, init) => {
      fetchSignal = init?.signal as AbortSignal | undefined;
      resolve();
      return await new Promise<Response>((resolveResponse) => {
        resolveFetch = resolveResponse;
      });
    };
  });

  const requestPromise = request(testDeps(), {
    url: "https://example.test",
    signal: controller.signal,
  });
  try {
    await fetchStarted;
    expect(fetchSignal).toBeDefined();
    expect(fetchSignal?.aborted).toBe(false);
    controller.abort();
    expect(fetchSignal?.aborted).toBe(true);
    resolveFetch?.(new Response("{}", { status: 200 }));
    await requestPromise;
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("McpClient uses injected client identity for initialize and User-Agent", async () => {
  const originalFetch = globalThis.fetch;
  const bodies: unknown[] = [];
  const userAgents: string[] = [];

  globalThis.fetch = async (_url, init) => {
    const headers = init?.headers as Record<string, string> | undefined;
    userAgents.push(headers?.["User-Agent"] ?? "");
    const body = init?.body;
    if (typeof body === "string") bodies.push(JSON.parse(body));
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }), { status: 200 });
  };

  try {
    const client = new McpClient(
      testDeps({ clientName: "test-client", version: "9.8.7" }),
      "https://mcp.example.test",
      "sk-test",
    );
    await client.initialize();
  } finally {
    globalThis.fetch = originalFetch;
  }

  expect(userAgents).toEqual(["test-client/9.8.7", "test-client/9.8.7"]);
  expect(bodies[0]).toMatchObject({
    method: "initialize",
    params: { clientInfo: { name: "test-client", version: "9.8.7" } },
  });
});

test("resolveWatermark uses flag or defaults to true", () => {
  expect(resolveWatermark("false")).toBe(false);
  expect(resolveWatermark("true")).toBe(true);
  expect(resolveWatermark(undefined)).toBe(true);
});

test("resolveBooleanFlag uses flag or defaultWhenUnset", () => {
  expect(resolveBooleanFlag("false", true, "prompt-extend")).toBe(false);
  expect(resolveBooleanFlag(undefined, true, "prompt-extend")).toBe(true);
  expect(resolveBooleanFlag(undefined, undefined, "prompt-extend")).toBeUndefined();
});

test("parseBooleanValue accepts only true and false strings (case-insensitive)", () => {
  expect(parseBooleanValue("true")).toBe(true);
  expect(parseBooleanValue("FALSE")).toBe(false);
  expect(() => parseBooleanValue("1")).toThrow(BailianError);
  expect(() => parseBooleanValue("yes")).toThrow(BailianError);
  expect(() => parseBooleanValue("maybe")).toThrow(BailianError);
});

test("parseConfigFile ignores obsolete region field", () => {
  const f = parseConfigFile({ region: "intl" });
  expect("region" in f).toBe(false);
});

test("parseConfigFile accepts only well-formed http(s) base_url", () => {
  expect(parseConfigFile({ base_url: "https://dashscope.aliyuncs.com" }).base_url).toBe(
    "https://dashscope.aliyuncs.com",
  );
  expect(parseConfigFile({ base_url: "http://localhost:8080" }).base_url).toBe(
    "http://localhost:8080",
  );
  // Previously accepted because the value merely "starts with http".
  expect(parseConfigFile({ base_url: "httpfoo://evil" }).base_url).toBeUndefined();
  expect(parseConfigFile({ base_url: "not a url" }).base_url).toBeUndefined();
});

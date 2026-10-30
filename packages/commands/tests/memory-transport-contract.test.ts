import { httpTransport } from "bailian-cli-core";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { Client } from "bailian-cli-core";
import memoryAdd from "../src/commands/memory/add.ts";

afterEach(() => vi.restoreAllMocks());

// Exercise the real command + Client + HTTP transport. Only the network boundary is fake.
const deps = {
  identity: {
    binName: "test-cli",
    version: "0.0.0",
    npmPackage: "test-cli",
    clientName: "test-client",
  },
  settings: {
    output: "json",
    outputExplicit: true,
    timeout: 1,
    watermark: true,
    verbose: false,
    quiet: false,
    dryRun: false,
    telemetry: false,
  },
  baseUrl: "https://dashscope.aliyuncs.com",
  apiCred: {
    token: "synthetic-test-key",
    baseUrl: "https://dashscope.aliyuncs.com",
    source: "flag",
  },
} satisfies ConstructorParameters<typeof Client>[0];

for (const status of [401, 429, 500]) {
  test(`write HTTP ${status} preserves server diagnostics and is not retried`, async () => {
    const transport = vi.spyOn(httpTransport, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "ServiceTestCode",
          message: "server-original-detail",
          request_id: "test-request",
        }),
        { status, headers: { "Content-Type": "application/json" } },
      ),
    );
    await expect(
      memoryAdd.run({
        flags: { userId: "test", workspaceId: "ws_test", content: "synthetic", wait: 0 },
        settings: deps.settings,
        client: new Client(deps),
        identity: deps.identity,
      } as never),
    ).rejects.toMatchObject({
      exitCode: 1,
      message: expect.stringContaining("server-original-detail"),
      api: { httpStatus: status, apiCode: "ServiceTestCode", requestId: "test-request" },
    });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]?.[1]?.method).toBe("POST");
  });
}

test("ambiguous write transport failure is not automatically resubmitted", async () => {
  const failure = new TypeError("fetch failed", { cause: { code: "ECONNRESET" } });
  const transport = vi.spyOn(httpTransport, "fetch").mockRejectedValue(failure);
  await expect(
    memoryAdd.run({
      flags: { userId: "test", workspaceId: "ws_test", content: "synthetic", wait: 0 },
      settings: deps.settings,
      client: new Client(deps),
      identity: deps.identity,
    } as never),
  ).rejects.toBe(failure);
  expect(transport).toHaveBeenCalledTimes(1);
});

import http from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "vite-plus/test";
import { fetchLatestVersion, NPM_REGISTRY } from "bailian-cli-runtime";
import { E2E_HARNESS_IDENTITY } from "./harness/identity.ts";
import { withHarnessUpdateFixture } from "./harness/update-fixture.ts";

test("the harness receives a local 404 for its unpublished package and delegates business fetches", async () => {
  const originalFetch = globalThis.fetch;
  const server = http.createServer((_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ business: "unchanged" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  try {
    await withHarnessUpdateFixture(async () => {
      expect(await fetchLatestVersion(100, E2E_HARNESS_IDENTITY.npmPackage)).toBeNull();
      const response = await fetch(`${NPM_REGISTRY}/${E2E_HARNESS_IDENTITY.npmPackage}/latest`);
      expect(response.status).toBe(404);
      expect(await (await fetch(`http://127.0.0.1:${address.port}`)).json()).toEqual({
        business: "unchanged",
      });
    });
    expect(globalThis.fetch).toBe(originalFetch);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("restores fetch after an unexpected command failure", async () => {
  const originalFetch = globalThis.fetch;
  await expect(
    withHarnessUpdateFixture(async () => {
      throw new Error("fixture failure");
    }),
  ).rejects.toThrow("fixture failure");
  expect(globalThis.fetch).toBe(originalFetch);
});

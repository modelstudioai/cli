import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, expect, test } from "vite-plus/test";
import { resolveTsxBin } from "e2e/runner";

const execFileAsync = promisify(execFile);
const runtimeRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
let server: Server;
let serverUrl: string;
let scriptDir: string;
let scriptPath: string;

beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === "/body") {
      response.write("first");
    }
    const timer = setTimeout(() => response.end("done"), 2500);
    response.on("close", () => clearTimeout(timer));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  serverUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  scriptDir = mkdtempSync(join(tmpdir(), "bl-http-timeout-"));
  scriptPath = join(scriptDir, "probe.mts");
  writeFileSync(
    scriptPath,
    `
import { Agent, setGlobalDispatcher } from ${JSON.stringify(join(runtimeRoot, "node_modules/undici/index.js"))};
import { setupProxyFromEnv } from ${JSON.stringify(join(runtimeRoot, "src/proxy.ts"))};
import { request } from ${JSON.stringify(join(runtimeRoot, "../core/src/client/http.ts"))};
// Scale the hidden transport limit down while keeping real sockets and native fetch.
const transport = new Agent().compose((dispatch) => (options, handler) =>
  dispatch({ ...options, headersTimeout: options.headersTimeout === 0 ? 0 : 100,
    bodyTimeout: options.bodyTimeout === 0 ? 0 : 100 }, handler));
setGlobalDispatcher(process.argv[4] === "custom" ? {
  dispatch: transport.dispatch.bind(transport),
  close: transport.close.bind(transport),
  destroy: transport.destroy.bind(transport),
} : transport);
setupProxyFromEnv();
try {
  const response = process.argv[5] === "raw"
    ? await fetch(process.argv[2])
    : await request({
      identity: { clientName: "timeout-test", version: "0.0.0" },
      settings: { timeout: Number(process.argv[3]) / 1000, verbose: false },
    }, { url: process.argv[2] });
  console.log(await response.text());
} catch (error) {
  console.log(error.cause?.code ?? error.name);
} finally {
  await transport.destroy();
}
`,
  );
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (scriptDir) rmSync(scriptDir, { recursive: true, force: true });
});

async function runProbe(
  path: string,
  timeoutMs: number,
  dispatcher = "default",
  mode = "request",
): Promise<string> {
  const { stdout } = await execFileAsync(
    resolveTsxBin(),
    [scriptPath, `${serverUrl}${path}`, String(timeoutMs), dispatcher, mode],
    {
      cwd: runtimeRoot,
      // Full-suite process startup can exceed the scaled request deadline.
      timeout: 30_000,
      env: {
        ...process.env,
        HTTP_PROXY: "",
        HTTPS_PROXY: "",
        NO_PROXY: "",
        http_proxy: "",
        https_proxy: "",
        no_proxy: "",
      },
    },
  );
  return stdout.trim();
}

test("delayed headers can outlive the transport limit when the request deadline allows it", async () => {
  expect(await runProbe("/headers", 6000)).toBe("done");
});

test("the request deadline still aborts delayed headers", async () => {
  expect(await runProbe("/headers", 100)).toBe("AbortError");
});

test("unrelated fetch without a deadline keeps its headers timeout", async () => {
  expect(await runProbe("/headers", 6000, "default", "raw")).toBe("UND_ERR_HEADERS_TIMEOUT");
});

test("existing custom dispatchers do not need a compose method", async () => {
  expect(await runProbe("/headers", 6000, "custom")).toBe("done");
});

test("body idle timeout follows the request setting beyond the transport limit", async () => {
  expect(await runProbe("/body", 6000)).toBe("firstdone");
});

test("the upper body idle timeout aborts stalled responses", async () => {
  expect(await runProbe("/body", 150)).toBe("BailianError");
});

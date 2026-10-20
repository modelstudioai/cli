import { execFile, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

const execFileAsync = promisify(execFile);
const runtimeRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = join(runtimeRoot, "../..");
// Local runs can select the release-pinned Bun without replacing the user's Bun.
const bun = process.env.BAILIAN_TEST_BUN || "bun";
const hasBun = spawnSync(bun, ["--version"], { stdio: "ignore" }).status === 0;

describe.skipIf(!hasBun)("core HTTP with native Bun and compiled binaries", () => {
  let server: Server;
  let proxy: Server;
  let serverUrl: string;
  let proxyUrl: string;
  let probeDirectory: string;
  let scriptPath: string;
  let binaryPath: string;
  const connects: string[] = [];
  const closedResponses = new Set<string>();
  const childEnv = {
    ...process.env,
    PATH: bun.includes("/") ? `${dirname(bun)}${delimiter}${process.env.PATH}` : process.env.PATH,
    HTTP_PROXY: "",
    HTTPS_PROXY: "",
    NO_PROXY: "",
    ALL_PROXY: "",
    http_proxy: "",
    https_proxy: "",
    no_proxy: "",
    all_proxy: "",
  };

  beforeAll(async () => {
    server = createServer((incoming, response) => {
      if (incoming.url?.startsWith("/closed?")) {
        const path = new URL(incoming.url, "http://localhost").searchParams.get("path")!;
        response.end(JSON.stringify(closedResponses.has(path)));
        return;
      }
      if (incoming.url === "/cancel-body" || incoming.url === "/sse") {
        const path = incoming.url;
        closedResponses.delete(path);
        response.on("close", () => closedResponses.add(path));
        response.write(path === "/sse" ? "data: [DONE]\n\n" : "first");
        return;
      }
      if (incoming.url === "/error") {
        response.writeHead(401, { "content-type": "application/json" });
        response.end(JSON.stringify({ code: "InvalidApiKey", message: "local key rejected" }));
        return;
      }
      if (incoming.url === "/multipart") {
        let body = "";
        incoming.setEncoding("utf8");
        incoming.on("data", (chunk: string) => {
          body += chunk;
        });
        incoming.on("end", () =>
          response.end(
            JSON.stringify({
              contentType: incoming.headers["content-type"],
              body,
            }),
          ),
        );
        return;
      }
      if (incoming.url === "/progress" || incoming.url === "/json") {
        let chunks = 0;
        response.write(incoming.url === "/json" ? '["' : "x");
        const interval = setInterval(() => {
          response.write("x");
          if (++chunks === 8) {
            clearInterval(interval);
            response.end(incoming.url === "/json" ? '"]' : "");
          }
        }, 100);
        response.on("close", () => clearInterval(interval));
        return;
      }
      if (incoming.url === "/body") response.write("first");
      const timer = setTimeout(() => response.end("done"), incoming.url === "/body" ? 1_500 : 600);
      response.on("close", () => clearTimeout(timer));
    });
    proxy = createServer();
    proxy.on("connect", (incoming, socket) => {
      connects.push(incoming.url ?? "");
      // The client can reset a CONNECT socket after the intentional refusal.
      socket.on("error", () => {});
      socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    });
    for (const listener of [server, proxy]) {
      await new Promise<void>((resolve, reject) => {
        listener.once("error", reject);
        listener.listen(0, "127.0.0.1", resolve);
      });
    }
    serverUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    proxyUrl = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
    probeDirectory = mkdtempSync(join(tmpdir(), "bl-native-http-"));
    scriptPath = join(probeDirectory, "probe.mts");
    binaryPath = join(probeDirectory, process.platform === "win32" ? "probe.exe" : "probe");
    writeFileSync(
      scriptPath,
      `
import { request, requestJson } from ${JSON.stringify(join(runtimeRoot, "../core/src/client/http.ts"))};
import { parseSSE } from ${JSON.stringify(join(runtimeRoot, "../core/src/client/stream.ts"))};
import { setupProxyFromEnv } from ${JSON.stringify(join(runtimeRoot, "src/proxy.ts"))};
setupProxyFromEnv();
const [url, timeout, mode] = process.argv.slice(2);
const parent = new AbortController();
async function verifyRemoteClosed() {
  // Query while this process is still alive: process exit must not hide a leak.
  const checkUrl = new URL("/closed", url);
  checkUrl.searchParams.set("path", new URL(url).pathname);
  const deadline = performance.now() + 1500;
  do {
    const check = await fetch(checkUrl, { signal: AbortSignal.timeout(1000) });
    if (await check.json()) {
      if (parent.signal.aborted) throw new Error("Body cancellation aborted its caller");
      console.log("closed");
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  } while (performance.now() < deadline);
  throw new Error("Server still has an active response");
}
const deps = { identity: { clientName: "native-bun-probe", version: "0" },
  settings: { timeout: Number(timeout), verbose: false } };
try {
  if (mode === "json") {
    console.log(JSON.stringify(await requestJson(deps, { url })));
  } else {
    const form = new FormData();
    form.set("file", new Blob(["file-content"]), "probe.txt");
    const response = await request(deps, { url, signal: parent.signal,
      ...(mode === "multipart" ? { method: "POST", body: form } : {}) });
    if (mode === "cancel") {
      const reading = response.text();
      parent.abort(new Error("caller cancelled"));
      await reading;
    } else if (mode === "cancel-body") {
      await response.body.cancel(new Error("Consumer finished"));
      await verifyRemoteClosed();
    } else if (mode === "sse") {
      for await (const event of parseSSE(response)) { console.log(event.data); break; }
      await verifyRemoteClosed();
    } else console.log(await response.text());
  }
} catch (error) {
  console.log(error.api?.apiCode ?? (error.exitCode ? "exit:" + error.exitCode : error.name + ":" + error.message));
}
`,
    );
  });

  afterAll(async () => {
    for (const listener of [server, proxy]) {
      if (!listener?.listening) continue;
      listener.closeAllConnections();
      await new Promise<void>((resolve) => listener.close(() => resolve()));
    }
    if (probeDirectory) rmSync(probeDirectory, { recursive: true, force: true });
  });

  describe.each(["bun", "binary"])("%s", (runtime) => {
    beforeAll(async () => {
      if (runtime !== "binary") return;
      const target = `bun-${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`;
      await execFileAsync(
        bun,
        [
          join(repositoryRoot, "tools/release/lib/binary-compile.mjs"),
          "--entry",
          scriptPath,
          "--outfile",
          binaryPath,
          "--target",
          target,
        ],
        { cwd: repositoryRoot, env: childEnv, timeout: 60_000 },
      );
      if (process.platform === "darwin") {
        await execFileAsync(
          process.execPath,
          [
            "--input-type=module",
            "-e",
            `import { signDarwinAdhoc } from ${JSON.stringify(join(repositoryRoot, "tools/release/lib/binary-codesign.mjs"))}; signDarwinAdhoc(process.argv[1]);`,
            binaryPath,
          ],
          { timeout: 30_000 },
        );
      }
    });

    async function run(path: string, timeout: number, mode = "body", env = {}) {
      const args = [
        path.startsWith("https:") ? path : `${serverUrl}${path}`,
        String(timeout),
        mode,
      ];
      const { stdout } = await execFileAsync(
        runtime === "bun" ? bun : binaryPath,
        runtime === "bun" ? [scriptPath, ...args] : args,
        { cwd: runtimeRoot, env: { ...childEnv, ...env }, timeout: 30_000 },
      ).catch((error) => {
        throw new Error(
          JSON.stringify({
            stdout: error.stdout,
            stderr: error.stderr,
            signal: error.signal,
            killed: error.killed,
            code: error.code,
          }),
        );
      });
      return stdout.trim();
    }

    test("allows delayed headers within the configured deadline", async () => {
      expect(await run("/headers", 2)).toBe("done");
    });
    test("aborts delayed headers at the configured deadline", async () => {
      expect(await run("/headers", 0.15)).toMatch(/^AbortError:/);
    });
    test("body idle window follows timeout", async () => {
      // Leave enough time for headers under parallel suite load; the body stalls longer.
      expect(await run("/body", 0.5)).toBe("exit:5");
      expect(await run("/body", 2)).toBe("firstdone");
    });
    test("progressing responses can outlive one idle window", async () => {
      expect(await run("/progress", 0.4)).toBe("xxxxxxxxx");
    });
    test("JSON keeps its total deadline while the body progresses", async () => {
      expect(await run("/json", 0.4, "json")).toMatch(/^AbortError:/);
    });
    test("caller cancellation still works after headers", async () => {
      expect(await run("/body", 2, "cancel")).toBe("Error:caller cancelled");
    });
    test("an early SSE exit releases the request", async () => {
      expect(await run("/sse", 2, "sse")).toBe("[DONE]\nclosed");
    });
    test("body cancellation closes the request before the process exits", async () => {
      expect(await run("/cancel-body", 2, "cancel-body")).toBe("closed");
    });
    test("preserves the service authentication error", async () => {
      expect(await run("/error", 2)).toBe("InvalidApiKey");
    });
    test("preserves native multipart uploads", async () => {
      const result = JSON.parse(await run("/multipart", 2, "multipart"));
      expect(result.contentType).toMatch(/^multipart\/form-data; boundary=/);
      expect(result.body).toContain('filename="probe.txt"');
      expect(result.body).toContain("file-content");
    });
    test("native fetch still uses the configured proxy", async () => {
      connects.length = 0;
      await run("https://bl-native-proxy.invalid/probe", 1, "body", { HTTPS_PROXY: proxyUrl });
      expect(connects).toContain("bl-native-proxy.invalid:443");
    });
  });
});

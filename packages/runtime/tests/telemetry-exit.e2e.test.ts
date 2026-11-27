import { execFile, spawnSync } from "node:child_process";
import { createSocket } from "node:dgram";
import type { EventEmitter } from "node:events";
import { createServer, type Server } from "node:http";
import { createServer as createTcpServer, type Socket } from "node:net";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { buildIsolatedCliEnv } from "e2e/isolation";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

const runtimeRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const main = join(runtimeRoot, "tests/harness/telemetry-exit-main.ts");
const execFileAsync = promisify(execFile);
const bun = process.env.BAILIAN_TEST_BUN ?? "bun";
const hasBun = spawnSync(bun, ["--version"], { stdio: "ignore" }).status === 0;
let server: Server;
const tlsServer = createTcpServer((socket) => {
  tlsSockets.add(socket);
  requests.push({ method: "TLS", body: "" });
  socket.on("close", () => {
    tlsSockets.delete(socket);
    responseClosed = true;
  });
  socket.on("error", () => {});
  socket.on("data", () => {}); // Accept ClientHello but never complete the handshake.
});
const tlsSockets = new Set<Socket>();
let tlsOrigin: string;
let origin: string;
const dnsServer = createSocket("udp4") as ReturnType<typeof createSocket> & EventEmitter;
let dnsAddress: string;
let requests: Array<{ method?: string; body: string }> = [];
let responseClosed = false;
let dnsQueries = 0;

beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === "/status") {
      response.end(JSON.stringify({ requests: requests.length, closed: responseClosed }));
      return;
    }
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      body += chunk;
    });
    request.on("end", () => {
      requests.push({ method: request.method, body });
      response.on("close", () => {
        responseClosed = true;
      });
      if (request.url === "/headers") return;
      if (request.url === "/body") {
        response.write("partial");
        return;
      }
      response.writeHead(204).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP server");
  origin = `http://127.0.0.1:${address.port}`;
  await new Promise<void>((resolve) => tlsServer.listen(0, "127.0.0.1", resolve));
  const tlsAddress = tlsServer.address();
  if (!tlsAddress || typeof tlsAddress === "string")
    throw new Error("Expected TLS fixture address");
  tlsOrigin = `https://127.0.0.1:${tlsAddress.port}`;
  dnsServer.on("message", () => {
    dnsQueries++;
  });
  await new Promise<void>((resolve) => dnsServer.bind(0, "127.0.0.1", resolve));
  dnsAddress = `127.0.0.1:${dnsServer.address().port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  dnsServer.close();
  for (const socket of tlsSockets) socket.destroy();
  await new Promise<void>((resolve) => tlsServer.close(() => resolve()));
});

describe.each(["node", ...(hasBun ? ["bun"] : [])])(
  "telemetry process lifecycle (%s)",
  (runtime) => {
    test.each([
      "headers",
      "body",
      "dns",
      "tls",
      "fast",
      "fast-run-to-exit",
      "disabled",
      "do-not-track",
      ...(runtime === "node" ? ["tls-no-proxy"] : []),
    ])("%s retains JSON and actually exits after releasing telemetry work", async (mode) => {
      requests = [];
      responseClosed = false;
      dnsQueries = 0;
      const directory = mkdtempSync(join(tmpdir(), "bl-telemetry-exit-"));
      writeFileSync(
        join(directory, "config.json"),
        JSON.stringify({ language: "en-US", telemetry: mode !== "disabled" }),
      );
      const forceExit = mode === "fast-run-to-exit";
      const disabled = mode === "disabled" || mode === "do-not-track";
      const isolated = buildIsolatedCliEnv({
        overrides: {
          BAILIAN_CONFIG_DIR: directory,
          DO_NOT_TRACK: mode === "do-not-track" ? "1" : "",
          NO_UPDATE_NOTIFIER: "1",
          NODE_OPTIONS: "",
          NODE_USE_ENV_PROXY: "0",
          HTTP_PROXY: mode === "tls-no-proxy" ? "http://127.0.0.1:9" : "",
          HTTPS_PROXY: "",
          ALL_PROXY: "",
          http_proxy: "",
          https_proxy: "",
          all_proxy: "",
          NO_PROXY: "",
          no_proxy: mode === "tls-no-proxy" ? "127.0.0.1" : "",
          NODE_NO_WARNINGS: "1",
          DASHSCOPE_OUTPUT: "",
          DASHSCOPE_QUIET: "0",
          DASHSCOPE_VERBOSE: "0",
        },
      });
      try {
        // runNodeMain forces DO_NOT_TRACK=1; this test intentionally exercises telemetry.
        const execution = execFileAsync(
          runtime === "node" ? process.execPath : bun,
          [
            ...(runtime === "node" ? ["--import", import.meta.resolve("tsx")] : []),
            main,
            mode,
            origin,
            dnsAddress,
            tlsOrigin,
          ],
          { cwd: runtimeRoot, env: isolated.env, timeout: 8_000, maxBuffer: 1024 * 1024 },
        );
        let outputBuffer = "";
        let outputCompletedAt: number | undefined;
        execution.child.stdout?.on("data", (chunk: string) => {
          outputBuffer += chunk;
          if (outputCompletedAt === undefined && outputBuffer.trimEnd().endsWith("}")) {
            outputCompletedAt = performance.now();
          }
        });
        const { stdout, stderr } = await execution;
        const exitedAt = performance.now();
        expect(JSON.parse(stdout)).toEqual({ ok: true });
        if (forceExit) {
          // runToExit already called process.exit; judge from the parent's
          // evidence that nothing was dropped and nothing lingered.
          // The synthetic immediate response never touches the fixture server,
          // so the remote send settles within microtasks — the worst-case race
          // for the forced exit to drop the pending local JSONL write.
          expect(requests).toHaveLength(0);
          const telemetryPath = join(directory, "telemetry.jsonl");
          expect(existsSync(telemetryPath), "runToExit dropped the in-flight local write").toBe(
            true,
          );
          const events = readFileSync(telemetryPath, "utf8")
            .split("\n")
            .filter((line) => line.trim() !== "")
            .map((line) => JSON.parse(line) as { command?: string });
          expect(events.some((entry) => entry.command === "probe")).toBe(true);
          expect(outputCompletedAt).toBeDefined();
          expect(exitedAt - outputCompletedAt!, "output completion to process exit").toBeLessThan(
            3_000,
          );
        } else {
          const { outputToRunMs, ...connectionStatus } = JSON.parse(stderr);
          expect(connectionStatus).toEqual({ requests: disabled ? 0 : 1, closed: !disabled });
          if (["fast", "headers", "body"].includes(mode)) {
            expect(outputToRunMs).toBeGreaterThanOrEqual(0);
            expect(outputToRunMs, "output completion to run() return").toBeLessThan(3_000);
            expect(outputCompletedAt).toBeDefined();
            expect(exitedAt - outputCompletedAt!, "output completion to process exit").toBeLessThan(
              3_000,
            );
          }
        }
        expect(dnsQueries).toBe(0);
        if (!disabled && !forceExit && !mode.startsWith("tls")) {
          expect(requests[0]?.method).toBe("POST");
          const body = JSON.parse(requests[0]!.body) as { gokey: string; gmkey: string };
          expect(body.gmkey).toBe("EXP");
          expect(decodeURIComponent(body.gokey)).toContain("probe");
        }
      } finally {
        isolated.dispose();
        rmSync(directory, { recursive: true, force: true });
        server.closeAllConnections();
        for (const socket of tlsSockets) socket.destroy();
      }
    });
  },
);

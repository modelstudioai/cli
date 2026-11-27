import dns from "node:dns";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { httpTransport } from "../../../core/src/client/transport.ts";

const [mode, origin, dnsServer, tlsOrigin] = process.argv.slice(2);
// "fast-run-to-exit" reuses the immediate-response endpoint but leaves through
// runToExit's forced process.exit instead of the natural event-loop exit.
const forceExit = mode === "fast-run-to-exit";
const remoteMode = forceExit ? "fast" : mode;
// Detect the old independent DNS preflight without touching system DNS.
if (remoteMode === "dns") {
  const resolver = new dns.Resolver({ timeout: 30_000, tries: 1 });
  resolver.setServers([dnsServer!]);
  dns.resolve = resolver.resolve.bind(resolver);
} else {
  dns.resolve = ((_hostname: string, callback: (error: null, addresses: string[]) => void) => {
    queueMicrotask(() => callback(null, ["127.0.0.1"]));
  }) as typeof dns.resolve;
}

const directFetch = process.versions.bun ? globalThis.fetch : httpTransport.fetch;
const redirectTelemetry = (fetcher: typeof fetch): typeof fetch =>
  ((input, options) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith("https://gm.mmstat.com/")) {
      throw new Error("Unexpected telemetry target");
    }
    if (forceExit) {
      // Synthetic microtask-resolved response: the remote send drains as fast
      // as possible without any socket round-trip, maximizing the race between
      // "flush sees nothing pending" and the still-queued local JSONL write.
      // Without this, loopback latency lets the old fire-and-forget write win.
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return fetcher(
      new URL(
        remoteMode === "dns" ? "/fast" : `/${remoteMode}`,
        remoteMode?.startsWith("tls") ? tlsOrigin : origin,
      ),
      options,
    );
  }) as typeof fetch;

if (process.versions.bun) {
  globalThis.fetch = redirectTelemetry(globalThis.fetch);
} else {
  const require = createRequire(new URL("../../../core/package.json", import.meta.url));
  const transport = require("undici") as { fetch: typeof fetch };
  transport.fetch = redirectTelemetry(transport.fetch);
}

const { createCli, runToExit } = await import("../../src/create-cli.ts");
let outputCompletedAt = 0;
const cli = createCli(
  {
    probe: {
      description: "Telemetry exit fixture",
      auth: "none",
      async run(context) {
        context.output.result({ ok: true });
        outputCompletedAt = performance.now();
      },
    },
  },
  {
    binName: "fixture-cli",
    version: "0",
    clientName: "telemetry-fixture",
    npmPackage: "telemetry-fixture",
  },
);
if (forceExit) {
  // runToExit force-exits once tracked stdout/stderr flush; the in-flight
  // local telemetry write must survive that exit.
  await runToExit(cli, ["probe", "--output", "json"]);
  throw new Error("runToExit returned without exiting the process");
}
await cli.run(["probe", "--output", "json"]);
const outputToRunMs = performance.now() - outputCompletedAt;

// Inspect closure while this process is still alive: exit must not hide a leak.
const status = await directFetch(new URL("/status", origin));
process.stderr.write(JSON.stringify({ ...(await status.json()), outputToRunMs }) + "\n");

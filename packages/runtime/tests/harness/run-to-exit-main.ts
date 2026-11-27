import { createServer } from "node:http";
import { runToExit } from "../../src/create-cli.ts";

const payloadBytes = Number(process.argv[2] ?? "2000000");
const exitCode = Number(process.argv[3] ?? "0");
const keepAliveMs = Number(process.argv[4] ?? "0");

async function holdKeepAlive(): Promise<void> {
  if (keepAliveMs <= 0) return;
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain", connection: "keep-alive" });
    response.end("ok");
  });
  server.keepAliveTimeout = keepAliveMs;
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP address");
  const response = await fetch(`http://127.0.0.1:${address.port}/`);
  await response.text();
  // Leave the server (and keep-alive socket) alive; runToExit must still exit.
  setTimeout(() => server.close(), keepAliveMs).unref?.();
}

await runToExit({
  async run() {
    await holdKeepAlive();
    process.stdout.write(`${JSON.stringify({ data: "x".repeat(payloadBytes) })}\n`);
    if (exitCode !== 0) process.exitCode = exitCode;
  },
});

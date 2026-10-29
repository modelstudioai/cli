import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, test } from "vite-plus/test";

const execFileAsync = promisify(execFile);
const runtimeRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = join(runtimeRoot, "../..");

test("native Web API initialization preserves an already installed dispatcher", async () => {
  const server = createServer((_incoming, response) => response.end("local response"));
  const directory = mkdtempSync(join(tmpdir(), "bl-http-init-"));
  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a local TCP listener");
    const script = join(directory, "probe.mts");
    writeFileSync(
      script,
      `
import { Agent, getGlobalDispatcher, setGlobalDispatcher } from ${JSON.stringify(join(runtimeRoot, "node_modules/undici/index.js"))};
let dispatches = 0;
const agent = new Agent();
const dispatcher = agent.compose(dispatch => (options, handler) => {
  dispatches++;
  return dispatch(options, handler);
});
setGlobalDispatcher(dispatcher);
try {
  const { httpTransport } = await import(${JSON.stringify(join(runtimeRoot, "../core/src/client/transport.ts"))});
  if (getGlobalDispatcher() !== dispatcher) throw new Error("Web API initialization replaced the dispatcher");
  const response = await httpTransport.fetch(${JSON.stringify(`http://127.0.0.1:${address.port}`)});
  console.log(JSON.stringify({ body: await response.text(), dispatches }));
} finally {
  await agent.destroy();
}
`,
    );
    const { stdout } = await execFileAsync(
      process.env.BAILIAN_TEST_NODE || process.execPath,
      [join(repositoryRoot, "node_modules/tsx/dist/cli.mjs"), script],
      {
        timeout: 15_000,
        env: { ...process.env, HTTP_PROXY: "", HTTPS_PROXY: "", http_proxy: "", https_proxy: "" },
      },
    );
    expect(JSON.parse(stdout)).toEqual({ body: "local response", dispatches: 1 });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(directory, { recursive: true, force: true });
  }
});

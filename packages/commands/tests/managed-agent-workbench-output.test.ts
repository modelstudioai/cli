import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { buildSettings, Client, httpTransport, type LocalizedText } from "bailian-cli-core";
import { createOutputReporter } from "bailian-cli-runtime";
import { enterIsolatedHome } from "e2e/isolation";
const children = vi.hoisted(() => ({ spawn: vi.fn(), query: vi.fn() }));
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: children.spawn,
  execFile: (
    command: string,
    args: string[],
    options: unknown,
    callback: (error: Error | null, output: { stdout: string }) => void,
  ) => {
    children.query(command, args, options);
    callback(null, { stdout: '"0.7.0"' });
  },
}));
import { launchManagedAgentPlayground } from "../src/commands/managed-agent/_engine/playground-launcher.ts";
let isolation: ReturnType<typeof enterIsolatedHome>;
let directory: string;
let binary: string;
beforeEach(async () => {
  isolation = enterIsolatedHome();
  directory = await mkdtemp(join(tmpdir(), "managed-workbench-output-"));
  binary = join(directory, "playground.js");
  await writeFile(binary, "");
  vi.stubEnv("BAILIAN_MANAGED_AGENT_PLAYGROUND_BIN", binary);
  vi.stubEnv("AGENTS_PLAYGROUND_BIN", "");
  children.spawn.mockReset();
  children.query.mockReset();
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  isolation.restore();
  await rm(directory, { recursive: true, force: true });
});
function setup(output: "json" | "text", quiet = false, language: "en-US" | "zh-CN" = "en-US") {
  let stdout = "";
  let stderr = "";
  const settings = {
    ...buildSettings({ flags: {}, env: {}, file: {} }),
    output,
    quiet,
    verbose: false,
  };
  const localize = (text: LocalizedText) => (typeof text === "string" ? text : text[language]);
  const reporter = createOutputReporter({
    settings,
    localize,
    stdout: {
      write: (chunk) => {
        stdout += chunk;
      },
    },
    stderr: {
      write: (chunk) => {
        stderr += chunk;
      },
    },
  });
  const options = {
    surface: "workbench" as const,
    project: directory,
    port: 4848,
    open: false,
    settings,
    localize,
    output: reporter.output,
    client: new Client({
      identity: { binName: "bl", version: "0.0.0", clientName: "test", npmPackage: "test" },
      settings,
      baseUrl: "https://example.test",
    }),
  };
  return { options, stdout: () => stdout, stderr: () => stderr };
}
function health() {
  return {
    playground: {
      version: "0.7.0",
      pid: 123456789,
      project_id: createHash("sha256").update(resolve(directory)).digest("hex").slice(0, 16),
    },
  };
}
test.each(["en-US", "zh-CN"] as const)(
  "Workbench JSON rejects all side effects (%s)",
  async (language) => {
    const streams = setup("json", true, language);
    vi.stubEnv("BAILIAN_MANAGED_AGENT_PLAYGROUND_BIN", "");
    const fetch = vi
      .spyOn(httpTransport, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(health())));
    const kill = vi.spyOn(process, "kill").mockImplementation(() => true);
    await expect(launchManagedAgentPlayground(streams.options)).rejects.toMatchObject({
      exitCode: 2,
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(kill).not.toHaveBeenCalled();
    expect(children.query).not.toHaveBeenCalled();
    expect(children.spawn).not.toHaveBeenCalled();
    expect(streams.stdout()).toBe("");
    expect(streams.stderr()).toBe("");
  },
);
test.each([false, true])("Workbench reused URL is a retained result quiet=%s", async (quiet) => {
  const streams = setup("text", quiet);
  vi.spyOn(httpTransport, "fetch").mockResolvedValue(new Response(JSON.stringify(health())));
  await launchManagedAgentPlayground(streams.options);
  expect(streams.stdout()).toBe(
    "Workbench already running at http://localhost:4848 (pid 123456789).\n",
  );
  expect(streams.stderr()).toBe("");
  expect(children.spawn).not.toHaveBeenCalled();
  expect(children.query).not.toHaveBeenCalled();
});
test("Workbench native child text remains raw while URL uses invocation result", async () => {
  const streams = setup("text");
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    exitCode: null as number | null,
    kill: vi.fn(),
    pid: 345678,
  });
  children.spawn.mockReturnValue(child);
  let native = "";
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    native += String(chunk);
    return true;
  });
  let calls = 0;
  vi.spyOn(httpTransport, "fetch").mockImplementation(async () => {
    calls += 1;
    if (calls === 1) return new Response("missing", { status: 404 });
    child.stdout.write("native\nWorkbench running at http://localhost:4848\n");
    child.exitCode = 0;
    return new Response(JSON.stringify(health()));
  });
  await launchManagedAgentPlayground(streams.options);
  expect(native).toBe("native\nWorkbench running at http://localhost:4848\n");
  expect(streams.stdout()).toBe("Workbench ready at http://localhost:4848\n");
  expect(children.spawn).toHaveBeenCalledWith(
    process.execPath,
    [binary],
    expect.objectContaining({ stdio: ["inherit", "pipe", "inherit"] }),
  );
  expect(process.listenerCount("SIGINT")).toBe(0);
  expect(process.listenerCount("SIGTERM")).toBe(0);
});

test("Workbench child failure retains the ready URL before throwing once", async () => {
  const streams = setup("text", true);
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    exitCode: null as number | null,
    kill: vi.fn(),
    pid: 345678,
  });
  children.spawn.mockReturnValue(child);
  let calls = 0;
  vi.spyOn(httpTransport, "fetch").mockImplementation(async () => {
    calls += 1;
    if (calls === 1) return new Response("missing", { status: 404 });
    child.exitCode = 7;
    return new Response(JSON.stringify(health()));
  });
  await expect(launchManagedAgentPlayground(streams.options)).rejects.toMatchObject({
    exitCode: 1,
    message: "Workbench exited with code 7.",
  });
  expect(streams.stdout()).toBe("Workbench ready at http://localhost:4848\n");
  expect(streams.stderr()).toBe("");
});
test("Workbench browser fallback warning survives quiet without losing URL", async () => {
  const streams = setup("text", true);
  streams.options.open = true;
  vi.spyOn(httpTransport, "fetch").mockResolvedValue(new Response(JSON.stringify(health())));
  children.spawn.mockImplementation(() => {
    throw new Error("fixture browser unavailable");
  });
  await launchManagedAgentPlayground(streams.options);
  expect(streams.stdout()).toBe(
    "Workbench already running at http://localhost:4848 (pid 123456789).\n",
  );
  expect(streams.stderr()).toBe(
    "Warning: Could not open a browser automatically. Visit http://localhost:4848\n",
  );
});

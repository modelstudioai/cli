import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

const registry = vi.hoisted(() => ({
  version: '"0.7.0"',
  error: null as Error | null,
  manifest: "",
  query: vi.fn(),
}));

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  execFile: (
    command: string,
    args: string[],
    options: unknown,
    callback: (error: Error | null, output: { stdout: string }) => void,
  ) => {
    registry.query(command, args, options);
    callback(registry.error, { stdout: registry.version });
  },
}));

vi.mock("node:module", () => ({
  createRequire: () => ({ resolve: () => registry.manifest }),
}));

import { resolveLauncher } from "../src/commands/managed-agent/_engine/playground-launcher.ts";

let directory: string;
let binary: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "playground-launcher-"));
  binary = join(directory, "playground.js");
  registry.manifest = join(directory, "package.json");
  registry.version = '"0.7.0"';
  registry.error = null;
  registry.query.mockClear();
  await writeFile(binary, "");
  vi.stubEnv("BAILIAN_MANAGED_AGENT_PLAYGROUND_BIN", "");
  vi.stubEnv("AGENTS_PLAYGROUND_BIN", "");
  vi.stubEnv("BAILIAN_MANAGED_AGENT_PLAYGROUND_VERSION", "");
  vi.spyOn(process, "cwd").mockReturnValue(directory);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});

async function install(version: string) {
  await writeFile(registry.manifest, JSON.stringify({ version, bin: "playground.js" }));
}

test("checks latest on every resolution and reuses only the matching installed version", async () => {
  await install("0.7.0");
  expect(await resolveLauncher()).toMatchObject({
    args: [binary],
    version: "0.7.0",
    fetched: false,
  });
  registry.version = '"0.8.0"';
  expect(await resolveLauncher()).toMatchObject({
    command: "npx",
    args: ["-y", "@openagentpack/playground@0.8.0"],
    version: "0.8.0",
    fetched: true,
  });
  expect(registry.query).toHaveBeenCalledTimes(2);
  expect(registry.query).toHaveBeenCalledWith(
    "npm",
    expect.arrayContaining([
      "view",
      "@openagentpack/playground@latest",
      "--prefer-online",
      "--fetch-timeout=10000",
    ]),
    expect.objectContaining({ timeout: 15_000 }),
  );
});

test("downloads the resolved exact version when local installation is old or missing", async () => {
  for (const version of ["0.6.0", undefined]) {
    if (version) await install(version);
    else await rm(registry.manifest);
    expect(await resolveLauncher()).toMatchObject({
      command: "npx",
      args: ["-y", "@openagentpack/playground@0.7.0"],
    });
  }
});

test("explicit version overrides an incompatible installed version", async () => {
  await install("0.6.0");
  vi.stubEnv("BAILIAN_MANAGED_AGENT_PLAYGROUND_VERSION", "0.7.0");
  expect(await resolveLauncher()).toMatchObject({ fetched: true, version: "0.7.0" });
  expect(registry.query.mock.calls[0]?.[1]).toContain("@openagentpack/playground@0.7.0");
});

test("explicit binary remains an offline development override", async () => {
  vi.stubEnv("BAILIAN_MANAGED_AGENT_PLAYGROUND_BIN", binary);
  expect(await resolveLauncher()).toMatchObject({ args: [binary], fetched: false });
  expect(registry.query).not.toHaveBeenCalled();
});

test("registry failure does not silently reuse an old installation", async () => {
  await install("0.6.0");
  registry.error = new Error("registry unavailable");
  await expect(resolveLauncher()).rejects.toThrow("registry unavailable");
});

test("rejects malformed or ambiguous registry metadata with localized diagnostics", async () => {
  for (const output of ["invalid", '["0.6.0","0.7.0"]', '"--unsafe"']) {
    registry.version = output;
    await expect(resolveLauncher()).rejects.toThrow("single valid Playground version");
    await expect(resolveLauncher()).rejects.toThrow("唯一有效的 Playground 版本号");
  }
});

test("local source builds must also match the resolved version", async () => {
  const packageRoot = join(directory, "packages/playground");
  const sourceBinary = join(packageRoot, "dist/bin/playground.js");
  await mkdir(join(packageRoot, "dist/bin"), { recursive: true });
  await writeFile(sourceBinary, "");
  await writeFile(join(packageRoot, "package.json"), JSON.stringify({ version: "0.6.0" }));
  expect(await resolveLauncher()).toMatchObject({ fetched: true });
  await writeFile(join(packageRoot, "package.json"), JSON.stringify({ version: "0.7.0" }));
  expect(await resolveLauncher()).toMatchObject({
    args: [sourceBinary],
    version: "0.7.0",
    fetched: false,
  });
});

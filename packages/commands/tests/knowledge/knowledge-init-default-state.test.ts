import { mkdtemp, readdir, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { RAG_PATHS } from "bailian-cli-core";
import command from "../../src/commands/knowledge/init.ts";
import { writeStateFile } from "../../src/commands/knowledge/state-store.ts";

vi.mock("node:os", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:os")>()),
  homedir: vi.fn(),
}));

const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "init-default-state-"));
  directories.push(directory);
  const homeDirectory = join(directory, "home");
  vi.mocked(homedir).mockReturnValue(homeDirectory);
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(directory);
  const requestJson = vi.fn(async (request: { path: string }) => {
    const path = new URL(request.path).pathname;
    if (path === RAG_PATHS.indexList || path === RAG_PATHS.agentList)
      return { data: { rows: [], total_count: 0 } };
    throw new Error(`unexpected mutation or request: ${path}`);
  });
  const prepare = (flags: { workspaceId: string; name?: string; stateFile?: string }) =>
    command.prepare!({
      flags,
      client: { requestJson },
      localize: (text: string | { "en-US": string }) =>
        typeof text === "string" ? text : text["en-US"],
    } as unknown as Parameters<NonNullable<typeof command.prepare>>[0]);
  return { directory, homeDirectory, cwd, prepare, requestJson };
}

test("default init checkpoints isolate workspace and name and resume the saved target", async () => {
  const { homeDirectory, prepare } = await fixture();
  const targets = [
    { workspaceId: "ws-first", name: "demo" },
    { workspaceId: "ws-second", name: "demo" },
    { workspaceId: "ws-first", name: "other" },
  ];
  const paths = new Set<string>();
  for (const flags of targets) {
    const prepared = await prepare(flags);
    expect(prepared.data.snapshot).toBeUndefined();
    paths.add(prepared.data.stateFile);
    const saved = {
      ...prepared.data.state,
      operationId: `saved-${flags.workspaceId}-${flags.name}`,
    };
    await writeStateFile(prepared.data.stateFile, saved);
  }
  expect(paths.size).toBe(targets.length);
  for (const flags of targets) {
    const restored = await prepare(flags);
    expect(restored.data.state.operationId).toBe(`saved-${flags.workspaceId}-${flags.name}`);
    expect(restored.data.snapshot).toBeDefined();
    expect(
      restored.data.stateFile.startsWith(join(homeDirectory, ".bailian", "knowledge", "init")),
    ).toBe(true);
  }
});

test("init preview selects a stable default name without writing a checkpoint directory", async () => {
  const { directory, prepare } = await fixture();
  const implicit = await prepare({ workspaceId: "ws" });
  const explicit = await prepare({ workspaceId: "ws", name: "cli-demo" });
  expect(implicit.data.stateFile).toBe(explicit.data.stateFile);
  expect(await readdir(directory)).toEqual([]);
});

test("init ignores the legacy checkpoint and honors explicit state-file with target validation", async () => {
  const { directory, prepare, requestJson } = await fixture();
  const legacyPath = join(directory, ".bailian", "knowledge", "init.json");
  await writeStateFile(legacyPath, { obsolete: true });
  const automatic = await prepare({ workspaceId: "ws" });
  expect(automatic.data.stateFile).not.toBe(legacyPath);
  expect(automatic.data.snapshot).toBeUndefined();

  const explicit = await prepare({ workspaceId: "ws", stateFile: "custom/state.json" });
  expect(explicit.data.stateFile).toBe(join(directory, "custom", "state.json"));
  await writeStateFile(explicit.data.stateFile, explicit.data.state);
  requestJson.mockClear();
  await expect(
    prepare({ workspaceId: "other-ws", stateFile: "custom/state.json" }),
  ).rejects.toThrow("different target");
  expect(requestJson).not.toHaveBeenCalled();
});

test("init path keys preserve tuple boundaries, case and filesystem-safe names", async () => {
  const { homeDirectory, prepare } = await fixture();
  const targets = [
    { workspaceId: "ab", name: "c" },
    { workspaceId: "a", name: "bc" },
    { workspaceId: "ab", name: "C" },
    { workspaceId: "ab", name: "../中文/name" },
  ];
  const paths: string[] = [];
  for (const flags of targets) {
    const prepared = await prepare(flags);
    const stateFile = prepared.data.stateFile;
    expect(stateFile).toMatch(/\/[a-f0-9]{64}\.json$/);
    expect(stateFile.startsWith(join(homeDirectory, ".bailian", "knowledge", "init"))).toBe(true);
    paths.push(stateFile.toLowerCase());
  }
  expect(new Set(paths).size).toBe(targets.length);
});

test("init resumes the same user-level checkpoint after changing working directory", async () => {
  const { directory, homeDirectory, cwd, prepare } = await fixture();
  const flags = { workspaceId: "ws", name: "demo" };
  const first = await prepare(flags);
  expect(
    first.data.stateFile.startsWith(join(homeDirectory, ".bailian", "knowledge", "init")),
  ).toBe(true);
  const saved = { ...first.data.state, operationId: "saved-before-changing-directory" };
  await writeStateFile(first.data.stateFile, saved);
  cwd.mockReturnValue(join(directory, "another-project"));
  const restored = await prepare(flags);
  expect(restored.data.stateFile).toBe(first.data.stateFile);
  expect(restored.data.state).toEqual(saved);
  expect(restored.data.snapshot).toBeDefined();
});

test("init does not read or migrate the previous project-local target checkpoint", async () => {
  const { directory, homeDirectory, prepare } = await fixture();
  const flags = { workspaceId: "ws", name: "demo" };
  const first = await prepare(flags);
  const previousPath = join(
    directory,
    ".bailian",
    "knowledge",
    "init",
    basename(first.data.stateFile),
  );
  await writeStateFile(previousPath, { obsolete: true });
  const repeated = await prepare(flags);
  expect(
    repeated.data.stateFile.startsWith(join(homeDirectory, ".bailian", "knowledge", "init")),
  ).toBe(true);
  expect(repeated.data.snapshot).toBeUndefined();
});

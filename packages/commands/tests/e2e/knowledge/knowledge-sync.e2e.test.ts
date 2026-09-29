import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vite-plus/test";
import { runCommandE2e, runCommandHelp } from "../helpers.ts";

const routes = { "knowledge doc sync": "knowledgeDocSync" };
const directory = mkdtempSync(join(tmpdir(), "sync-e2e-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));
const env = { BAILIAN_CONFIG_DIR: directory, DASHSCOPE_API_KEY: "", BAILIAN_API_KEY: "" };

test("sync help exposes preview, opt-in deletion and billing implications", async () => {
  const result = await runCommandHelp(routes, ["knowledge", "doc", "sync", "--help"]);
  expect(result.exitCode, result.stderr).toBe(0);
  for (const flag of ["--dir", "--index-id", "--delete", "--dry-run", "--state-file", "--yes"])
    expect(result.stderr).toContain(flag);
});

test.each([{ args: [] }, { args: ["--dir", directory] }, { args: ["--index-id", "index-test"] }])(
  "sync missing arguments %j exit before authentication",
  async ({ args }) => {
    const result = await runCommandE2e(
      routes,
      ["knowledge", "doc", "sync", "--output", "json", ...args],
      env,
    );
    expect(result.exitCode, result.stderr).toBe(2);
  },
);

test("sync introspection works without credentials and declares conditional preparation", async () => {
  const result = await runCommandE2e(routes, ["knowledge", "doc", "sync", "--introspect"], env);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).commands[0]).toMatchObject({
    path: ["knowledge", "doc", "sync"],
    preparation: "read-only",
    risk: { level: "high", reason: "destructive" },
  });
});

test("sync dry-run requires credentials for its inventory", async () => {
  const result = await runCommandE2e(
    routes,
    [
      "knowledge",
      "doc",
      "sync",
      "--dir",
      directory,
      "--index-id",
      "index-test",
      "--workspace-id",
      "ws-test",
      "--dry-run",
    ],
    env,
  );
  expect(result.exitCode, result.stderr).toBe(3);
});

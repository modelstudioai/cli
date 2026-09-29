import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vite-plus/test";
import { runCommandE2e, runCommandHelp } from "../helpers.ts";
import { KNOWLEDGE_INIT_ROUTES } from "../topic-routes.ts";

const directory = mkdtempSync(join(tmpdir(), "init-e2e-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

test("help exposes billing, state file and read-only network preview", async () => {
  const result = await runCommandHelp(KNOWLEDGE_INIT_ROUTES, ["knowledge", "init", "--help"]);
  expect(result.exitCode).toBe(0);
  expect(result.stderr).toContain("720");
  expect(result.stderr).toContain("--yes");
  expect(result.stderr).toContain("--state-file");
  expect(result.stderr).toContain("--dry-run");
});

test("introspection exposes preparation without login or resource creation", async () => {
  const result = await runCommandE2e(KNOWLEDGE_INIT_ROUTES, ["knowledge", "init", "--introspect"], {
    BAILIAN_CONFIG_DIR: directory,
  });
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.stderr).toBe("");
  expect(JSON.parse(result.stdout).commands[0]).toMatchObject({
    path: ["knowledge", "init"],
    preparation: "read-only",
    risk: { reason: "billing" },
  });
});

test("dry-run without credentials exits AUTH and does not create its checkpoint", async () => {
  const stateFile = join(directory, "absent", "state.json");
  const result = await runCommandE2e(
    KNOWLEDGE_INIT_ROUTES,
    [
      "knowledge",
      "init",
      "--workspace-id",
      "ws-test",
      "--state-file",
      stateFile,
      "--dry-run",
      "--output",
      "json",
    ],
    { BAILIAN_CONFIG_DIR: directory, DASHSCOPE_API_KEY: "", BAILIAN_API_KEY: "" },
  );
  expect(result.exitCode, result.stderr).toBe(3);
  expect(existsSync(stateFile)).toBe(false);
});

test("invalid polling interval is rejected before authentication", async () => {
  const result = await runCommandE2e(
    KNOWLEDGE_INIT_ROUTES,
    ["knowledge", "init", "--poll-interval", "0"],
    { BAILIAN_CONFIG_DIR: directory },
  );
  expect(result.exitCode, result.stderr).toBe(2);
});

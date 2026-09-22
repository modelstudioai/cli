import { describe, expect, test } from "vite-plus/test";
import { isMemoryE2EReady, parseStdoutJson, runCommandE2e } from "../helpers.ts";
import {
  MEMORY_ADD_ROUTES,
  MEMORY_PROFILE_DELETE_ROUTES,
  MEMORY_LIST_ROUTES,
  MEMORY_UPDATE_ROUTES,
  MEMORY_DELETE_ROUTES,
  MEMORY_PROFILE_CREATE_ROUTES,
  MEMORY_PROFILE_UPDATE_ROUTES,
} from "../topic-routes.ts";
import { memoryScopeCliArgs, TEST_WORKSPACE_ARGS } from "./shared.ts";

const DRY = [...TEST_WORKSPACE_ARGS, "--dry-run", "--output", "json"];

describe("memory 0921 verified contract", () => {
  test("empty content retains messages-only project semantics", async () => {
    const result = await runCommandE2e(MEMORY_ADD_ROUTES, [
      "memory",
      "add",
      "--user-id",
      "user1",
      "--content",
      "",
      "--messages",
      '[{"role":"user","content":"fact"}]',
      "--project-id",
      "first",
      "--project-id",
      "second",
      ...DRY,
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    const data = parseStdoutJson<{ request: Record<string, unknown> }>(result.stdout);
    expect(data.request.project_ids).toEqual(["first", "second"]);
    expect(data.request).not.toHaveProperty("project_id");
    expect(data.request).not.toHaveProperty("custom_content");
  });

  test("custom content binds one project using singular project_id", async () => {
    const result = await runCommandE2e(MEMORY_ADD_ROUTES, [
      "memory",
      "add",
      "--user-id",
      "user1",
      "--content",
      "fact",
      "--project-id",
      "project1",
      ...DRY,
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    const data = parseStdoutJson<{ request: Record<string, unknown> }>(result.stdout);
    expect(data.request.project_id).toBe("project1");
    expect(data.request).not.toHaveProperty("project_ids");
  });

  test.each(["content", "messages"])("rejects too many projects for %s", async (mode) => {
    const projects =
      mode === "content" ? ["first", "second"] : ["one", "two", "three", "four", "five", "six"];
    const result = await runCommandE2e(MEMORY_ADD_ROUTES, [
      "memory",
      "add",
      "--user-id",
      "user1",
      `--${mode}`,
      mode === "content" ? "fact" : '[{"role":"user","content":"fact"}]',
      ...projects.flatMap((project) => ["--project-id", project]),
      ...DRY,
    ]);
    expect(result.exitCode, result.stderr).toBe(2);
    expect(result.stderr).toContain("--project-id");
  });

  test("profile_only serializes schema and messages", async () => {
    const result = await runCommandE2e(MEMORY_ADD_ROUTES, [
      "memory",
      "add",
      "--user-id",
      "user1",
      "--messages",
      '[{"role":"user","content":"I like reading"}]',
      "--profile-schema",
      "schema1",
      "--extract-mode",
      "profile_only",
      ...DRY,
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(
      parseStdoutJson<{ request: Record<string, unknown> }>(result.stdout).request,
    ).toMatchObject({ extract_mode: "profile_only", profile_schema: "schema1" });
  });

  test.each([
    ["--messages", '[{"role":"user","content":"fact"}]'],
    ["--content", "fact", "--profile-schema", "schema1"],
  ])("profile_only rejects incomplete or conflicting inputs %j", async (...args) => {
    const result = await runCommandE2e(MEMORY_ADD_ROUTES, [
      "memory",
      "add",
      "--user-id",
      "user1",
      "--extract-mode",
      "profile_only",
      ...args,
      ...DRY,
    ]);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toMatch(/profile-schema|messages|content/);
  });

  test("update omits user_id and timestamp unless a timestamp is supplied", async () => {
    const result = await runCommandE2e(MEMORY_UPDATE_ROUTES, [
      "memory",
      "update",
      "--node-id",
      "node1",
      "--content",
      "changed",
      ...DRY,
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(parseStdoutJson<{ request: unknown }>(result.stdout).request).toEqual({
      custom_content: "changed",
    });
  });

  test("delete needs only node ID and retains library query", async () => {
    const result = await runCommandE2e(MEMORY_DELETE_ROUTES, [
      "memory",
      "delete",
      "--node-id",
      "node1",
      "--library-id",
      "lib1",
      ...DRY,
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    const data = parseStdoutJson<{ endpoint: string }>(result.stdout);
    expect(new URL(data.endpoint).searchParams.get("memory_library_id")).toBe("lib1");
    expect(new URL(data.endpoint).searchParams.has("user_id")).toBe(false);
  });

  test.each(["create", "update"])(
    "schema %s accepts extract_scene and server-configured description length",
    async (action) => {
      const routes =
        action === "create" ? MEMORY_PROFILE_CREATE_ROUTES : MEMORY_PROFILE_UPDATE_ROUTES;
      const args =
        action === "create"
          ? ["--name", "schema1", "--attributes", '[{"name":"hobby"}]']
          : ["--schema-id", "schema1"];
      const result = await runCommandE2e(routes, [
        "memory",
        "profile",
        action,
        ...args,
        "--extract-scene",
        "efficient",
        "--description",
        "d".repeat(129),
        ...DRY,
      ]);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(
        parseStdoutJson<{ request: Record<string, unknown> }>(result.stdout).request,
      ).toMatchObject({ extract_scene: "efficient", description: "d".repeat(129) });
    },
  );

  test("schema update can clear description", async () => {
    const result = await runCommandE2e(MEMORY_PROFILE_UPDATE_ROUTES, [
      "memory",
      "profile",
      "update",
      "--schema-id",
      "schema1",
      "--description",
      "",
      ...DRY,
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(parseStdoutJson<{ request: unknown }>(result.stdout).request).toEqual({
      description: "",
    });
  });
});

describe.skipIf(!isMemoryE2EReady())("memory 0921 profile_only (live)", () => {
  test("schema scene and profile-only extraction form a self-cleaning CLI journey", async () => {
    const routes = { ...MEMORY_PROFILE_DELETE_ROUTES, ...MEMORY_ADD_ROUTES, ...MEMORY_LIST_ROUTES };
    const userId = `cli-profile-only-${Date.now()}`;
    const scope = memoryScopeCliArgs();
    const created = await runCommandE2e(routes, [
      "memory",
      "profile",
      "create",
      ...scope,
      "--name",
      userId.slice(-25),
      "--attributes",
      '[{"name":"爱好","description":"用户喜欢的运动"}]',
      "--extract-scene",
      "efficient",
      "--plan-version",
      "lite",
      "--output",
      "json",
    ]);
    expect(created.exitCode, created.stderr).toBe(0);
    const schemaId = parseStdoutJson<{ profile_schema_id: string }>(
      created.stdout,
    ).profile_schema_id;
    expect(schemaId).toBeTruthy();
    try {
      const updated = await runCommandE2e(routes, [
        "memory",
        "profile",
        "update",
        ...scope,
        "--schema-id",
        schemaId,
        "--extract-scene",
        "efficient",
        "--output",
        "json",
      ]);
      expect(updated.exitCode, updated.stderr).toBe(0);
      const added = await runCommandE2e(routes, [
        "memory",
        "add",
        ...scope,
        "--user-id",
        userId,
        "--messages",
        '[{"role":"user","content":"我最喜欢的运动是游泳。"}]',
        "--profile-schema",
        schemaId,
        "--extract-mode",
        "profile_only",
        "--output",
        "json",
      ]);
      expect(added.exitCode, added.stderr).toBe(0);
      const result = parseStdoutJson<{
        events: Array<{
          resource_type: string;
          status: string;
          result: Array<{ memory_type: string; name: string }>;
        }>;
      }>(added.stdout);
      expect(result.events).toHaveLength(1);
      expect(result.events[0]).toMatchObject({
        resource_type: "user_profile",
        status: "SUCCEEDED",
      });
      expect(result.events[0].result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ memory_type: "user_profile", name: "爱好" }),
        ]),
      );
      const profile = await runCommandE2e(routes, [
        "memory",
        "profile",
        "get",
        ...scope,
        "--schema-id",
        schemaId,
        "--user-id",
        userId,
        "--output",
        "json",
      ]);
      expect(profile.exitCode, profile.stderr).toBe(0);
      expect(profile.stdout).toContain("游泳");
      const listed = await runCommandE2e(routes, [
        "memory",
        "list",
        ...scope,
        "--user-id",
        userId,
        "--output",
        "json",
      ]);
      expect(listed.exitCode, listed.stderr).toBe(0);
      expect(parseStdoutJson<{ total: number }>(listed.stdout).total).toBe(0);
    } finally {
      const deleted = await runCommandE2e(routes, [
        "memory",
        "profile",
        "delete",
        ...scope,
        "--schema-id",
        schemaId,
        "--yes",
        "--output",
        "json",
      ]);
      expect(deleted.exitCode, deleted.stderr).toBe(0);
    }
  }, 240_000);
});

import { describe, expect, test } from "vite-plus/test";
import { isMemoryE2EReady, parseStdoutJson, runCommandE2e } from "../helpers.ts";
import {
  MEMORY_ADD_ROUTES,
  MEMORY_PROFILE_DELETE_ROUTES,
  MEMORY_UPDATE_ROUTES,
  MEMORY_DELETE_ROUTES,
  MEMORY_PROFILE_CREATE_ROUTES,
  MEMORY_PROFILE_UPDATE_ROUTES,
} from "../topic-routes.ts";
import { memoryScopeCliArgs, TEST_WORKSPACE_ARGS, type UserProfileBody } from "./shared.ts";

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

  test("update omits user_id and internal timestamp", async () => {
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

// Every supported extraction mode × scene × tier gets its own isolated readback journey.
const extractionCases = ["profile_only", "combined"].flatMap((mode) =>
  ["efficient", "intelligent"].flatMap((scene) =>
    ["lite", "pro"].map((tier) => ({ mode, scene, tier })),
  ),
);

describe.skipIf(!isMemoryE2EReady())("memory profile extraction matrix (live)", () => {
  test.each(extractionCases)(
    "$mode / $scene / $tier checks compatibility and profile readback",
    async ({ mode, scene, tier }) => {
      const routes = { ...MEMORY_PROFILE_DELETE_ROUTES, ...MEMORY_DELETE_ROUTES };
      const userId = `profile-${mode}-${scene}-${tier}-${Date.now()}`;
      const scope = memoryScopeCliArgs();
      async function invoke<T>(args: string[]): Promise<T> {
        const result = await runCommandE2e(routes, [
          "memory",
          ...args,
          ...scope,
          "--output",
          "json",
        ]);
        expect(result.exitCode, result.stderr).toBe(0);
        return parseStdoutJson<T>(result.stdout);
      }
      const createArgs = [
        "profile",
        "create",
        "--name",
        userId.slice(-32),
        "--attributes",
        '[{"name":"爱好","description":"用户最喜欢的运动"}]',
        "--extract-scene",
        scene,
        "--plan-version",
        tier,
      ];
      if (scene === "intelligent" && tier === "lite") {
        const rejected = await runCommandE2e(routes, [
          "memory",
          ...createArgs,
          ...scope,
          "--output",
          "json",
        ]);
        if (rejected.exitCode === 0) {
          const unexpected = parseStdoutJson<{ profile_schema_id: string }>(rejected.stdout);
          await invoke(["profile", "delete", "--schema-id", unexpected.profile_schema_id, "--yes"]);
        }
        expect(rejected.exitCode, rejected.stderr).toBe(1);
        const { error } = parseStdoutJson<{
          error: { http_status: number; api_code: string; message: string; request_id: string };
        }>(rejected.stderr);
        expect(error.http_status).toBe(400);
        expect(error.api_code).toBe("InvalidParameter");
        expect(error.request_id).toBeTruthy();
        expect(error.message).toContain("lite is not compatible with extract scene intelligent");
        return;
      }
      const created = await invoke<{ profile_schema_id: string }>(createArgs);
      const schemaId = created.profile_schema_id;
      expect(schemaId).toBeTruthy();
      try {
        const schema = await invoke<{ extract_scene: string; plan_version: string }>([
          "profile",
          "show",
          "--schema-id",
          schemaId,
        ]);
        expect(schema).toMatchObject({ extract_scene: scene, plan_version: tier });
        const added = await invoke<{ events: Array<{ resource_type: string; status: string }> }>([
          "add",
          "--user-id",
          userId,
          "--messages",
          '[{"role":"user","content":"我最喜欢的运动是游泳。"}]',
          "--profile-schema",
          schemaId,
          ...(mode === "profile_only" ? ["--extract-mode", "profile_only"] : []),
        ]);
        const profileEvent = added.events.find((event) => event.resource_type === "user_profile");
        expect(profileEvent).toBeDefined();
        expect(profileEvent?.status).toMatch(/^(SUCCEEDED|SUCCESS)$/);
        if (mode === "profile_only") expect(added.events).toHaveLength(1);
        const profile = await invoke<UserProfileBody>([
          "profile",
          "get",
          "--schema-id",
          schemaId,
          "--user-id",
          userId,
        ]);
        expect(
          profile.profile?.attributes?.find((attribute) => attribute.name === "爱好")?.value,
        ).toContain("游泳");
        const listed = await invoke<{ total: number; memory_nodes: Array<{ content: string }> }>([
          "list",
          "--user-id",
          userId,
        ]);
        if (mode === "profile_only") {
          expect(listed.total).toBe(0);
          expect(listed.memory_nodes).toEqual([]);
        } else {
          expect(listed.total).toBeGreaterThan(0);
          expect(listed.memory_nodes.some((node) => node.content.includes("游泳"))).toBe(true);
        }
      } finally {
        try {
          // Read page 1 repeatedly while deleting, so pagination shifts cannot skip any fixture.
          for (let round = 0; round < 100; round += 1) {
            const listed = await invoke<{ memory_nodes: Array<{ memory_node_id: string }> }>([
              "list",
              "--user-id",
              userId,
            ]);
            expect(Array.isArray(listed.memory_nodes)).toBe(true);
            if (listed.memory_nodes.length === 0) break;
            for (const node of listed.memory_nodes)
              await invoke(["delete", "--node-id", node.memory_node_id, "--yes"]);
            expect(round, "Memory fixture cleanup did not terminate.").toBeLessThan(99);
          }
        } finally {
          await invoke(["profile", "delete", "--schema-id", schemaId, "--yes"]);
        }
      }
    },
    240_000,
  );
});

import { describe, expect, test } from "vite-plus/test";
import { isMemoryE2EReady, parseStdoutJson, runCommandE2e, runCommandHelp } from "../helpers.ts";
import { MEMORY_PROFILE_DELETE_ROUTES } from "../topic-routes.ts";
import {
  TEST_WORKSPACE_ARGS,
  memoryScopeCliArgs,
  memoryUserId,
  type MemoryDryRunBody,
  type ProfileSchemaCreateBody,
  type ProfileSchemaDetailBody,
  type ProfileSchemaListBody,
  type UserProfileBody,
} from "./shared.ts";

describe("e2e: memory profile delete", () => {
  test("--help 展示 flags", async () => {
    const { stderr, exitCode } = await runCommandHelp(MEMORY_PROFILE_DELETE_ROUTES, [
      "memory",
      "profile",
      "delete",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--schema-id/i);
    expect(stderr).toMatch(/--yes/i);
    expect(stderr).toMatch(/--memory-library-id/i);
    expect(stderr).toMatch(/--workspace-id/i);
  });

  test("缺 --schema-id 报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_PROFILE_DELETE_ROUTES, [
      "memory",
      "profile",
      "delete",
      "--yes",
    ]);
    expect(exitCode).toBe(2);
  });

  test("缺 --yes 报 CONFIRMATION_REQUIRED (7)", async () => {
    const { stderr, exitCode } = await runCommandE2e(MEMORY_PROFILE_DELETE_ROUTES, [
      "memory",
      "profile",
      "delete",
      "--schema-id",
      "schema_test",
      "--api-key",
      "sk-fake",
      ...TEST_WORKSPACE_ARGS,
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(7);
    expect(stderr).toMatch(/--yes/i);
  });

  test("--dry-run 断言 endpoint / DELETE，且不触发确认", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_PROFILE_DELETE_ROUTES, [
      "memory",
      "profile",
      "delete",
      "--schema-id",
      "schema_test",
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
      "--output",
      "json",
    ]);
    // dry-run must short-circuit before the runtime confirmation gate, otherwise
    // this non-TTY run would fail asking for --yes
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<MemoryDryRunBody>(stdout);
    expect(data.endpoint).toMatch(/api\/v2\/apps\/memory\/profile_schemas\/schema_test$/);
    expect(data.method).toBe("DELETE");
  });

  test("--dry-run 断言 --memory-library-id 进 query string", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_PROFILE_DELETE_ROUTES, [
      "memory",
      "profile",
      "delete",
      "--schema-id",
      "schema_test",
      "--memory-library-id",
      "lib_test",
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(exitCode, stderr).toBe(0);
    const data = parseStdoutJson<MemoryDryRunBody>(stdout);
    expect(data.endpoint).toMatch(/profile_schemas\/schema_test\?memory_library_id=lib_test$/);
  });
});

describe.skipIf(!isMemoryE2EReady())("e2e: memory profile delete (live)", () => {
  test("删除不存在的模板时服务端拒绝（非 0 退出）", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_PROFILE_DELETE_ROUTES, [
      "memory",
      "profile",
      "delete",
      ...memoryScopeCliArgs(),
      "--schema-id",
      `no-such-schema-${Date.now()}`,
      "--yes",
      "--output",
      "json",
    ]);
    expect(exitCode).not.toBe(0);
  });

  test("画像模板自清理闭环：create → list → show → update → show → get → delete → list", async () => {
    const marker = `vp-${Date.now()}`;
    const schemaName = `vp_profile_${marker}`;

    // plan_version lite keeps the per-call price at the cheaper tier
    const createRes = await runCommandE2e(MEMORY_PROFILE_DELETE_ROUTES, [
      "memory",
      "profile",
      "create",
      ...memoryScopeCliArgs(),
      "--name",
      schemaName,
      "--description",
      `CLI vp test ${marker}（可删）`,
      "--attributes",
      '[{"name":"plan","description":"套餐"},{"name":"tier","description":"等级"}]',
      "--plan-version",
      "lite",
      "--output",
      "json",
    ]);
    expect(createRes.exitCode, createRes.stderr).toBe(0);
    const created = parseStdoutJson<ProfileSchemaCreateBody>(createRes.stdout);
    const schemaId = created.profile_schema_id ?? "";
    expect(schemaId.length, createRes.stdout).toBeGreaterThan(0);

    try {
      const listRes = await runCommandE2e(MEMORY_PROFILE_DELETE_ROUTES, [
        "memory",
        "profile",
        "list",
        ...memoryScopeCliArgs(),
        "--page-size",
        "100",
        "--output",
        "json",
      ]);
      expect(listRes.exitCode, listRes.stderr).toBe(0);
      const listed = parseStdoutJson<ProfileSchemaListBody>(listRes.stdout);
      const listedSchema = listed.profile_schemas?.find(
        (schema) => schema.profile_schema_id === schemaId,
      );
      if (!listedSchema) {
        throw new Error(
          `memory profile list 未包含刚创建的模板 ${schemaId}。请确认 BAILIAN_E2E_MEMORY_LIBRARY_ID 与控制台「记忆库」ID 一致。stdout=${listRes.stdout}`,
        );
      }
      expect(listedSchema.name).toBe(schemaName);

      const showRes = await runCommandE2e(MEMORY_PROFILE_DELETE_ROUTES, [
        "memory",
        "profile",
        "show",
        ...memoryScopeCliArgs(),
        "--schema-id",
        schemaId,
        "--output",
        "json",
      ]);
      expect(showRes.exitCode, showRes.stderr).toBe(0);
      const detail = parseStdoutJson<ProfileSchemaDetailBody>(showRes.stdout);
      expect(detail.name).toBe(schemaName);
      const planAttribute = detail.attributes?.find((attribute) => attribute.name === "plan");
      const tierAttribute = detail.attributes?.find((attribute) => attribute.name === "tier");
      // attribute_id is the handle profile update needs; without it the
      // update / delete operations below cannot be expressed at all
      expect(planAttribute?.attribute_id, showRes.stdout).toBeTruthy();
      expect(tierAttribute?.attribute_id, showRes.stdout).toBeTruthy();

      const renamed = `${schemaName}_v2`;
      const updateRes = await runCommandE2e(MEMORY_PROFILE_DELETE_ROUTES, [
        "memory",
        "profile",
        "update",
        ...memoryScopeCliArgs(),
        "--schema-id",
        schemaId,
        "--name",
        renamed,
        "--attributes-operations",
        JSON.stringify([
          { op: "add", name: "region", description: "地域" },
          {
            op: "update",
            attribute_id: planAttribute!.attribute_id,
            description: "套餐（已更新）",
          },
          { op: "delete", attribute_id: tierAttribute!.attribute_id },
        ]),
        "--output",
        "json",
      ]);
      expect(updateRes.exitCode, updateRes.stderr).toBe(0);

      // Verify the mutation landed on the server rather than trusting the 200
      const afterUpdateRes = await runCommandE2e(MEMORY_PROFILE_DELETE_ROUTES, [
        "memory",
        "profile",
        "show",
        ...memoryScopeCliArgs(),
        "--schema-id",
        schemaId,
        "--output",
        "json",
      ]);
      expect(afterUpdateRes.exitCode, afterUpdateRes.stderr).toBe(0);
      const afterUpdate = parseStdoutJson<ProfileSchemaDetailBody>(afterUpdateRes.stdout);
      expect(afterUpdate.name, afterUpdateRes.stdout).toBe(renamed);
      const attributeNames = (afterUpdate.attributes ?? []).map((attribute) => attribute.name);
      expect(attributeNames, afterUpdateRes.stdout).toContain("region");
      expect(attributeNames, afterUpdateRes.stdout).not.toContain("tier");
      expect(
        afterUpdate.attributes?.find((attribute) => attribute.name === "plan")?.description,
        afterUpdateRes.stdout,
      ).toBe("套餐（已更新）");

      // No memory was written against this schema, so every attribute value
      // is expected to be empty — the point is that the endpoint resolves
      const getRes = await runCommandE2e(MEMORY_PROFILE_DELETE_ROUTES, [
        "memory",
        "profile",
        "get",
        ...memoryScopeCliArgs(),
        "--schema-id",
        schemaId,
        "--user-id",
        memoryUserId(),
        "--output",
        "json",
      ]);
      expect(getRes.exitCode, getRes.stderr).toBe(0);
      const profile = parseStdoutJson<UserProfileBody>(getRes.stdout);
      expect(profile.request_id?.length ?? 0, getRes.stdout).toBeGreaterThan(0);
    } finally {
      const deleteRes = await runCommandE2e(MEMORY_PROFILE_DELETE_ROUTES, [
        "memory",
        "profile",
        "delete",
        ...memoryScopeCliArgs(),
        "--schema-id",
        schemaId,
        "--yes",
        "--output",
        "json",
      ]);
      expect(deleteRes.exitCode, deleteRes.stderr).toBe(0);
    }

    const afterDeleteRes = await runCommandE2e(MEMORY_PROFILE_DELETE_ROUTES, [
      "memory",
      "profile",
      "list",
      ...memoryScopeCliArgs(),
      "--page-size",
      "100",
      "--output",
      "json",
    ]);
    expect(afterDeleteRes.exitCode, afterDeleteRes.stderr).toBe(0);
    const afterDelete = parseStdoutJson<ProfileSchemaListBody>(afterDeleteRes.stdout);
    expect(
      afterDelete.profile_schemas?.some((schema) => schema.profile_schema_id === schemaId) ?? false,
      afterDeleteRes.stdout,
    ).toBe(false);
  }, 240_000);
});

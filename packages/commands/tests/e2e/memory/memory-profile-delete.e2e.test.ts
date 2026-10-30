import { assertMemoryServiceRejection } from "./live-helpers.ts";
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
    expect(stderr).toMatch(/--library-id/i);
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

  test("--library-id 33 字符报 USAGE (2)", async () => {
    const { exitCode } = await runCommandE2e(MEMORY_PROFILE_DELETE_ROUTES, [
      "memory",
      "profile",
      "delete",
      "--schema-id",
      "schema_test",
      "--library-id",
      "l".repeat(33),
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
    ]);
    expect(exitCode).toBe(2);
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

  test("--dry-run 断言 --library-id 进 query string", async () => {
    const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_PROFILE_DELETE_ROUTES, [
      "memory",
      "profile",
      "delete",
      "--schema-id",
      "schema_test",
      "--library-id",
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
    const { exitCode, stderr } = await runCommandE2e(MEMORY_PROFILE_DELETE_ROUTES, [
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
    assertMemoryServiceRejection({ exitCode, stderr });
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
      '[{"name":"plan","description":"套餐","default_value":"free"},{"name":"tier","description":"等级"}]',
      "--plan-version",
      "lite",
      "--extract-scene",
      "efficient",
      "--output",
      "json",
    ]);
    expect(createRes.exitCode, createRes.stderr).toBe(0);
    const created = parseStdoutJson<ProfileSchemaCreateBody>(createRes.stdout);
    const schemaId = created.profile_schema_id ?? "";
    expect(schemaId.length, createRes.stdout).toBeGreaterThan(0);

    async function listAllSchemas() {
      const schemas: NonNullable<ProfileSchemaListBody["profile_schemas"]> = [];
      for (let page = 1; page <= 1000; page += 1) {
        const result = await runCommandE2e(MEMORY_PROFILE_DELETE_ROUTES, [
          "memory",
          "profile",
          "list",
          ...memoryScopeCliArgs(),
          "--page",
          String(page),
          "--page-size",
          "100",
          "--output",
          "json",
        ]);
        expect(result.exitCode, result.stderr).toBe(0);
        const data = parseStdoutJson<ProfileSchemaListBody>(result.stdout);
        expect(Array.isArray(data.profile_schemas), result.stdout).toBe(true);
        schemas.push(...data.profile_schemas!);
        if (
          data.profile_schemas!.length === 0 ||
          (data.total !== undefined && schemas.length >= data.total)
        ) {
          return { profile_schemas: schemas };
        }
      }
      throw new Error("Schema pagination did not terminate within 1000 pages.");
    }

    try {
      const listed = await listAllSchemas();
      const listedSchema = listed.profile_schemas?.find(
        (schema) => schema.profile_schema_id === schemaId,
      );
      if (!listedSchema) {
        throw new Error(
          `memory profile list 未包含刚创建的模板 ${schemaId}。请确认 BAILIAN_E2E_MEMORY_LIBRARY_ID 与控制台「记忆库」ID 一致。schemas=${JSON.stringify(listed)}`,
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
      expect(detail.description).toBe(`CLI vp test ${marker}（可删）`);
      expect(detail.plan_version).toBe("lite");
      expect(detail.extract_scene).toBe("efficient");
      const planAttribute = detail.attributes?.find((attribute) => attribute.name === "plan");
      const tierAttribute = detail.attributes?.find((attribute) => attribute.name === "tier");
      // attribute_id is the handle profile update needs; without it the
      // update / delete operations below cannot be expressed at all
      expect(planAttribute?.attribute_id, showRes.stdout).toBeTruthy();
      expect(planAttribute?.default_value, showRes.stdout).toBe("free");
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
        "--description",
        "更新后的画像说明",
        "--plan-version",
        "pro",
        "--extract-scene",
        "intelligent",
        "--attributes-operations",
        JSON.stringify([
          { op: "add", name: "region", description: "地域", default_value: "杭州" },
          {
            op: "update",
            attribute_id: planAttribute!.attribute_id,
            name: "plan_updated",
            description: "套餐（已更新）",
            default_value: "paid",
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
      expect(afterUpdate.description, afterUpdateRes.stdout).toBe("更新后的画像说明");
      expect(afterUpdate.plan_version, afterUpdateRes.stdout).toBe("pro");
      expect(afterUpdate.extract_scene, afterUpdateRes.stdout).toBe("intelligent");
      const attributeNames = (afterUpdate.attributes ?? []).map((attribute) => attribute.name);
      expect(attributeNames, afterUpdateRes.stdout).toContain("region");
      expect(attributeNames, afterUpdateRes.stdout).not.toContain("tier");
      expect(
        afterUpdate.attributes?.find((attribute) => attribute.name === "plan_updated")?.description,
        afterUpdateRes.stdout,
      ).toBe("套餐（已更新）");

      expect(
        afterUpdate.attributes?.find((attribute) => attribute.name === "plan_updated")
          ?.default_value,
      ).toBe("paid");
      expect(
        afterUpdate.attributes?.find((attribute) => attribute.name === "region")?.default_value,
      ).toBe("杭州");
      const nullUpdate = await runCommandE2e(MEMORY_PROFILE_DELETE_ROUTES, [
        "memory",
        "profile",
        "update",
        ...memoryScopeCliArgs(),
        "--schema-id",
        schemaId,
        "--attributes-operations",
        JSON.stringify([
          { op: "update", attribute_id: planAttribute!.attribute_id, default_value: null },
        ]),
        "--output",
        "json",
      ]);
      expect(nullUpdate.exitCode, nullUpdate.stderr).toBe(1);
      const nullError = parseStdoutJson<{
        error: { http_status: number; request_id: string; message: string };
      }>(nullUpdate.stderr).error;
      expect(nullError.http_status).toBe(400);
      expect(nullError.request_id).toBeTruthy();
      expect(nullError.message).toContain(
        "must provide at least one of name, description or default_value",
      );
      const cleared = await runCommandE2e(MEMORY_PROFILE_DELETE_ROUTES, [
        "memory",
        "profile",
        "update",
        ...memoryScopeCliArgs(),
        "--schema-id",
        schemaId,
        "--description",
        "",
        "--attributes-operations",
        JSON.stringify([
          { op: "update", attribute_id: planAttribute!.attribute_id, default_value: "" },
        ]),
        "--output",
        "json",
      ]);
      expect(cleared.exitCode, cleared.stderr).toBe(0);
      const clearedShow = await runCommandE2e(MEMORY_PROFILE_DELETE_ROUTES, [
        "memory",
        "profile",
        "show",
        ...memoryScopeCliArgs(),
        "--schema-id",
        schemaId,
        "--output",
        "json",
      ]);
      expect(clearedShow.exitCode, clearedShow.stderr).toBe(0);
      const clearedSchema = parseStdoutJson<ProfileSchemaDetailBody>(clearedShow.stdout);
      expect(clearedSchema.description, clearedShow.stdout).toBe("");
      const clearedPlan = clearedSchema.attributes?.find(
        (attribute) => attribute.attribute_id === planAttribute!.attribute_id,
      );
      expect(clearedPlan, clearedShow.stdout).toBeDefined();
      // Empty string is the server-supported clearing value; null is not a field update.
      expect(clearedPlan?.default_value, clearedShow.stdout).toBe("");
      expect(
        clearedSchema.attributes?.find((attribute) => attribute.name === "region")?.default_value,
      ).toBe("杭州");

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

    const afterDelete = await listAllSchemas();
    expect(
      afterDelete.profile_schemas.some((schema) => schema.profile_schema_id === schemaId),
    ).toBe(false);
  }, 240_000);
});

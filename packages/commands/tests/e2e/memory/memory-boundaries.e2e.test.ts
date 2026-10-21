import { describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCommandE2e } from "../helpers.ts";
import {
  MEMORY_ADD_ROUTES,
  MEMORY_UPDATE_ROUTES,
  MEMORY_SEARCH_ROUTES,
  MEMORY_PROFILE_CREATE_ROUTES,
  MEMORY_PROFILE_UPDATE_ROUTES,
} from "../topic-routes.ts";
import { TEST_WORKSPACE_ARGS } from "./shared.ts";

const dryArgs = [...TEST_WORKSPACE_ARGS, "--dry-run", "--output", "json"];

describe("memory parameter boundaries", () => {
  test.each(["add", "update"])("%s accepts maximum content and scope lengths", async (action) => {
    const result = await runCommandE2e(
      action === "add" ? MEMORY_ADD_ROUTES : MEMORY_UPDATE_ROUTES,
      [
        "memory",
        action,
        ...(action === "add" ? ["--user-id", "u".repeat(64)] : ["--node-id", "node1"]),
        "--content",
        "c".repeat(512),
        "--library-id",
        "l".repeat(32),
        ...dryArgs,
      ],
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(parseStdoutJson<{ request: unknown }>(result.stdout).request).toMatchObject({
      custom_content: "c".repeat(512),
      memory_library_id: "l".repeat(32),
    });
  });

  test("add accepts 50 messages and five projects", async () => {
    const messages = Array.from({ length: 50 }, () => ({ role: "user", content: "fact" }));
    const projects = ["one", "two", "three", "four", "five"];
    const result = await runCommandE2e(MEMORY_ADD_ROUTES, [
      "memory",
      "add",
      "--user-id",
      "user1",
      "--messages",
      JSON.stringify(messages),
      ...projects.flatMap((project) => ["--project-id", project]),
      ...dryArgs,
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(parseStdoutJson<{ request: unknown }>(result.stdout).request).toMatchObject({
      messages,
      project_ids: projects,
    });
  });

  test.each([
    [1, 0],
    [100, 1],
  ])("search accepts top-k %s and min-score %s", async (topK, minScore) => {
    const result = await runCommandE2e(MEMORY_SEARCH_ROUTES, [
      "memory",
      "search",
      "--user-id",
      "user1",
      "--query",
      "fact",
      "--top-k",
      String(topK),
      "--min-score",
      String(minScore),
      ...dryArgs,
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(parseStdoutJson<{ request: unknown }>(result.stdout).request).toMatchObject({
      top_k: topK,
      min_score: minScore,
    });
  });

  test("search rejects negative min-score", async () => {
    const result = await runCommandE2e(MEMORY_SEARCH_ROUTES, [
      "memory",
      "search",
      "--user-id",
      "user1",
      "--query",
      "fact",
      "--min-score",
      "-0.1",
      ...dryArgs,
    ]);
    expect(result.exitCode, result.stderr).toBe(2);
    expect(result.stderr).toContain("--min-score");
  });

  for (const action of ["create", "update"]) {
    const routes =
      action === "create" ? MEMORY_PROFILE_CREATE_ROUTES : MEMORY_PROFILE_UPDATE_ROUTES;
    const baseArgs = [
      "memory",
      "profile",
      action,
      ...(action === "create"
        ? ["--name", "n".repeat(32), "--attributes", '[{"name":"hobby"}]']
        : ["--schema-id", "schema1"]),
    ];

    test.each(["efficient", "intelligent"])(
      `profile ${action} maps extract-scene %s and pro tier`,
      async (scene) => {
        const result = await runCommandE2e(routes, [
          ...baseArgs,
          "--extract-scene",
          scene,
          "--plan-version",
          "pro",
          ...dryArgs,
        ]);
        expect(result.exitCode, result.stderr).toBe(0);
        expect(parseStdoutJson<{ request: unknown }>(result.stdout).request).toMatchObject({
          extract_scene: scene,
          plan_version: "pro",
        });
      },
    );

    test(`profile ${action} rejects invalid extract-scene`, async () => {
      const result = await runCommandE2e(routes, [
        ...baseArgs,
        "--extract-scene",
        "invalid",
        ...dryArgs,
      ]);
      expect(result.exitCode, result.stderr).toBe(2);
      expect(result.stderr).toContain("--extract-scene");
    });

    test.each([128, 129])(`profile ${action} attribute field boundary %s`, async (length) => {
      const attribute = {
        name: "a".repeat(32),
        description: "d".repeat(length),
        default_value: "v".repeat(length),
      };
      const args =
        action === "create"
          ? ["--name", "schema1", "--attributes", JSON.stringify([attribute])]
          : [
              "--schema-id",
              "schema1",
              "--attributes-operations",
              JSON.stringify([{ op: "add", ...attribute }]),
            ];
      const result = await runCommandE2e(routes, [
        "memory",
        "profile",
        action,
        ...args,
        ...dryArgs,
      ]);
      expect(result.exitCode, result.stderr).toBe(length === 128 ? 0 : 2);
      if (length === 128) {
        const body = parseStdoutJson<{ request: Record<string, unknown> }>(result.stdout).request;
        expect(body[action === "create" ? "attributes" : "attributes_operations"]).toEqual([
          action === "create" ? attribute : { op: "add", ...attribute },
        ]);
      } else expect(result.stderr).toContain("description");
    });

    test(`profile ${action} rejects oversized default_value independently`, async () => {
      const attribute = { name: "hobby", default_value: "v".repeat(129) };
      const args =
        action === "create"
          ? ["--name", "schema1", "--attributes", JSON.stringify([attribute])]
          : [
              "--schema-id",
              "schema1",
              "--attributes-operations",
              JSON.stringify([{ op: "update", attribute_id: "attr1", ...attribute }]),
            ];
      const result = await runCommandE2e(routes, [
        "memory",
        "profile",
        action,
        ...args,
        ...dryArgs,
      ]);
      expect(result.exitCode, result.stderr).toBe(2);
      expect(result.stderr).toContain("default_value");
    });
  }
});

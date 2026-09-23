import { readFileSync } from "node:fs";
import { describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCommandE2e } from "../helpers.ts";
import { MEMORY_PROFILE_CREATE_ROUTES } from "../topic-routes.ts";
import { TEST_WORKSPACE_ARGS, type MemoryDryRunBody } from "./shared.ts";

describe("personal memory skill profile asset", () => {
  test("the shipped profile can be created in the default library without invented defaults", async () => {
    const attributes = JSON.parse(
      readFileSync(
        new URL(
          "../../../../../skills/bailian-memory/assets/profile-attributes.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as Array<{ name: string; description: string; default_value?: string }>;
    const profileName = "pm_0123456789abcdef01234567";
    const result = await runCommandE2e(MEMORY_PROFILE_CREATE_ROUTES, [
      "memory",
      "profile",
      "create",
      "--name",
      profileName,
      "--attributes",
      JSON.stringify(attributes),
      "--extract-scene",
      "efficient",
      "--plan-version",
      "pro",
      ...TEST_WORKSPACE_ARGS,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    const body = parseStdoutJson<MemoryDryRunBody>(result.stdout);
    expect(body.method).toBe("POST");
    expect(body.request).toEqual({
      name: profileName,
      attributes,
      extract_scene: "efficient",
      plan_version: "pro",
    });
    expect(attributes).toHaveLength(7);
    expect(new Set(attributes.map((attribute) => attribute.name)).size).toBe(attributes.length);
    for (const attribute of attributes) {
      expect(attribute.description.trim().length).toBeGreaterThan(0);
      expect(attribute).not.toHaveProperty("default_value");
    }
  });
});

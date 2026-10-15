import { describe, expect, test } from "vite-plus/test";
import { cleanupNpmTags, parseCleanupInputs } from "./cleanup-npm-tags.mjs";

const onlyCli = {
  CLEANUP_CORE: "false",
  CLEANUP_RUNTIME: "false",
  CLEANUP_COMMANDS: "false",
  CLEANUP_KSCLI: "false",
  CLEANUP_DSH: "false",
};

describe("npm tag cleanup", () => {
  test("defaults to previewing all six packages and accepts mixed tag separators", () => {
    expect(parseCleanupInputs({ CLEANUP_TAGS: "skill, harness\nknowledge skill" })).toEqual({
      packages: [
        "bailian-cli",
        "bailian-cli-core",
        "bailian-cli-runtime",
        "bailian-cli-commands",
        "knowledge-studio-cli",
        "bailian-kb-dsh",
      ],
      tags: ["skill", "harness", "knowledge"],
      dryRun: true,
    });
  });

  test("explicit false package selections limit an actual run to bailian-cli", () => {
    expect(
      parseCleanupInputs({ ...onlyCli, CLEANUP_TAGS: "release-test", CLEANUP_DRY_RUN: "false" }),
    ).toEqual({ packages: ["bailian-cli"], tags: ["release-test"], dryRun: false });
  });

  test.each(["", "latest", "skill latest", "--registry=evil", "skill;echo", "*", "1.2.3"])(
    "rejects unsafe or empty tag input %j before requests",
    (tags) => {
      expect(() => parseCleanupInputs({ CLEANUP_TAGS: tags })).toThrow();
    },
  );

  test("rejects no selected package and malformed booleans", () => {
    expect(() =>
      parseCleanupInputs({ ...onlyCli, CLEANUP_CLI: "false", CLEANUP_TAGS: "skill" }),
    ).toThrow(/package/i);
    expect(() => parseCleanupInputs({ CLEANUP_TAGS: "skill", CLEANUP_DRY_RUN: "no" })).toThrow();
  });

  function registryFixture() {
    const registry = new Map([
      ["bailian-cli", { latest: "2.3.0", skill: "0.0.0-beta-old" }],
      ["bailian-cli-core", { latest: "2.3.0" }],
    ]);
    return {
      registry,
      operations: {
        readTags: async (packageName) => ({ ...registry.get(packageName) }),
        removeTag: async (packageName, tag) => {
          delete registry.get(packageName)[tag];
        },
        report: () => {},
      },
    };
  }

  test("preview reports present and absent tags without modifying the registry", async () => {
    const { registry, operations } = registryFixture();
    const result = await cleanupNpmTags(
      { packages: ["bailian-cli", "bailian-cli-core"], tags: ["skill"], dryRun: true },
      operations,
    );
    expect(result).toEqual([
      { packageName: "bailian-cli", tag: "skill", version: "0.0.0-beta-old", status: "preview" },
      { packageName: "bailian-cli-core", tag: "skill", version: null, status: "absent" },
    ]);
    expect(registry.get("bailian-cli")).toEqual({ latest: "2.3.0", skill: "0.0.0-beta-old" });
  });

  test("actual cleanup removes only the selected tag and preserves latest", async () => {
    const { registry, operations } = registryFixture();
    const result = await cleanupNpmTags(
      { packages: ["bailian-cli", "bailian-cli-core"], tags: ["skill"], dryRun: false },
      operations,
    );
    expect(result.map((entry) => entry.status)).toEqual(["deleted", "absent"]);
    expect(registry.get("bailian-cli")).toEqual({ latest: "2.3.0" });
    expect(registry.get("bailian-cli-core")).toEqual({ latest: "2.3.0" });
  });

  test("an unreadable package aborts preflight before deleting from any package", async () => {
    const { registry, operations } = registryFixture();
    const readTags = operations.readTags;
    operations.readTags = async (packageName) => {
      if (packageName === "bailian-cli-core") throw new Error("registry unavailable");
      return readTags(packageName);
    };
    await expect(
      cleanupNpmTags(
        { packages: ["bailian-cli", "bailian-cli-core"], tags: ["skill"], dryRun: false },
        operations,
      ),
    ).rejects.toThrow("registry unavailable");
    expect(registry.get("bailian-cli").skill).toBe("0.0.0-beta-old");
  });

  test("failed deletion verification is not reported as success", async () => {
    const { operations } = registryFixture();
    operations.removeTag = async () => {};
    await expect(
      cleanupNpmTags({ packages: ["bailian-cli"], tags: ["skill"], dryRun: false }, operations),
    ).rejects.toThrow(/still exists/i);
  });

  test("direct callers cannot bypass latest and package protections", async () => {
    const { registry, operations } = registryFixture();
    await expect(
      cleanupNpmTags({ packages: ["bailian-cli"], tags: ["latest"], dryRun: false }, operations),
    ).rejects.toThrow();
    await expect(
      cleanupNpmTags(
        { packages: ["unrelated-package"], tags: ["skill"], dryRun: false },
        operations,
      ),
    ).rejects.toThrow();
    expect(registry.get("bailian-cli").latest).toBe("2.3.0");
  });
});

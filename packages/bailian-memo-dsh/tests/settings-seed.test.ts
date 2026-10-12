import { expect, it } from "vite-plus/test";
import { initialSettingsPatch } from "../src/settings-seed.js";
import { resolveMemoryWorkspace } from "../src/personal-config.js";

it("migrates personal workspace before bl and preserves explicit dsh values", () => {
  expect(initialSettingsPatch(false, undefined, "personal", "bl")).toEqual({
    workspaceId: "personal",
    configInitialized: true,
  });
  expect(initialSettingsPatch(false, "explicit", "personal", "bl")).toEqual({
    configInitialized: true,
  });
  expect(initialSettingsPatch(false, "", "personal", "bl")).toEqual({ configInitialized: true });
});
it("does not reimport after the user clears an initialized setting", () => {
  expect(initialSettingsPatch(true, undefined, "personal", "bl")).toEqual({});
});
it("requires the current dsh Workspace and rejects an identity mismatch", () => {
  expect(() => resolveMemoryWorkspace(undefined, "personal")).toThrow(/dsh settings/);
  expect(() => resolveMemoryWorkspace("other", "personal")).toThrow(/mismatch/);
  expect(resolveMemoryWorkspace("personal", "personal")).toBe("personal");
});

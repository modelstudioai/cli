import { expect, it } from "vite-plus/test";
import { MEMO_SETTINGS_NAMESPACE } from "../src/config.ts";
import { PLUGIN_ENTRY_ID } from "../src/plugin-meta.ts";

it("uses the Loader entry id for settings", () => {
  expect(PLUGIN_ENTRY_ID).toBe("tool-bailian-memo");
  expect(MEMO_SETTINGS_NAMESPACE).toBe(PLUGIN_ENTRY_ID);
});

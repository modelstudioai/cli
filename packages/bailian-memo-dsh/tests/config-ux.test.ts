import { describe, expect, it } from "vite-plus/test";
import {
  MEMO_SETTINGS_FIELDS,
  isWorkspaceEndpointAccessDenied,
  parseBooleanSetting,
  parseScoreSetting,
  projectMemoryDisplayState,
} from "../src/web/config-ux-model.ts";
import {
  MEMO_ITEM_ID,
  MEMO_ROW_CONFIG_KEY,
  MEMO_SETTINGS_PAGE_TARGETS,
} from "../src/web/registration.ts";
import { en, zh } from "../src/web/locales.ts";

describe("memo configuration UX", () => {
  it("declares both the official item and installed bundle row registrations", () => {
    expect(MEMO_SETTINGS_PAGE_TARGETS).toEqual([
      {
        slot: "plugins.item",
        id: MEMO_ITEM_ID,
      },
      {
        slot: "plugins.row.config",
        key: MEMO_ROW_CONFIG_KEY,
      },
    ]);
  });

  it("keeps connection edits separate from automatic behavior controls", () => {
    expect(MEMO_SETTINGS_FIELDS).toEqual([
      { field: "enabled", kind: "toggle" },
      { field: "autoRecall", kind: "toggle" },
      { field: "autoCurate", kind: "toggle" },
      { field: "recallTopK", kind: "number" },
      { field: "minScore", kind: "score" },
    ]);
    expect(parseScoreSetting("0.3")).toEqual({ kind: "set", value: 0.3 });
    expect(parseScoreSetting("0")).toEqual({ kind: "set", value: 0 });
    expect(parseScoreSetting("1")).toEqual({ kind: "set", value: 1 });
    expect(parseScoreSetting("")).toEqual({ kind: "clear" });
    expect(parseScoreSetting("1.1")).toBeUndefined();
    expect(parseScoreSetting("-0.1")).toBeUndefined();
    expect(parseScoreSetting("low")).toBeUndefined();
    expect(parseBooleanSetting("true")).toEqual({ kind: "set", value: true });
    expect(parseBooleanSetting("false")).toEqual({ kind: "set", value: false });
    expect(parseBooleanSetting("not-a-toggle")).toBeUndefined();
  });

  it("recognizes the raw workspace endpoint denial for localized guidance", () => {
    expect(
      isWorkspaceEndpointAccessDenied("Endpoint.AccessDenied: Workspace endpoint access denied."),
    ).toBe(true);
    expect(isWorkspaceEndpointAccessDenied("another server error")).toBe(false);
  });

  it("projects personal and volatile state into one user-facing status", () => {
    const personal = {
      status: "active",
    };

    expect(projectMemoryDisplayState(null, true)).toBe("setupRequired");
    expect(projectMemoryDisplayState({ ...personal, status: "initializing" }, true)).toBe(
      "initializing",
    );
    expect(projectMemoryDisplayState({ ...personal, status: "paused" }, true)).toBe("paused");
    expect(projectMemoryDisplayState(personal, true)).toBe("active");
    expect(projectMemoryDisplayState(personal, false)).toBe("automaticDisabled");
  });

  it("keeps English and Chinese locale keys in lockstep", () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect(en[key].trim()).not.toBe("");
      expect(zh[key].trim()).not.toBe("");
    }
    expect(en.consoleLogin).toBe("Fetch from console login");
    expect(zh.consoleLogin).toBe("自动获取");
    expect(en.loginDone).toBe("Credentials updated");
    expect(zh.loginDone).toBe("凭据已更新");
    expect(Object.values(en).join("\n")).not.toContain("Signed in");
    expect(Object.values(zh).join("\n")).not.toContain("已登录");
  });
});

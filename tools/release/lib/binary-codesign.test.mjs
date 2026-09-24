import { describe, expect, test } from "vite-plus/test";
import { adhocSignPlan, RCODESIGN_VERSION } from "./binary-codesign.mjs";

describe("darwin ad-hoc sign plan", () => {
  test("darwin hosts use codesign and replace the linker signature", () => {
    expect(adhocSignPlan("darwin")).toEqual({
      command: "codesign",
      args: ["--force", "--sign", "-", "--identifier", "bl"],
    });
  });

  test("non-darwin hosts use rcodesign so Linux CI can sign Mach-O", () => {
    expect(RCODESIGN_VERSION).toBe("0.29.0");
    expect(adhocSignPlan("linux")).toEqual({ command: "rcodesign", args: ["sign"] });
    expect(adhocSignPlan("win32")).toEqual({ command: "rcodesign", args: ["sign"] });
  });
});

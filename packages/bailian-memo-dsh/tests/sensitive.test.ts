import { describe, expect, it } from "vite-plus/test";
import { filterForUpload, quotesMatchSource } from "../src/sensitive.ts";

describe("sensitive filters", () => {
  it("blocks credential-like material", () => {
    const result = filterForUpload("my key is sk-abcdefghijklmnopqrstuvwxyz");
    expect(result.blockedCredential).toBe(true);
    expect(result.safeText).toBeNull();
  });

  it("blocks sensitive hints without explicit grant", () => {
    const result = filterForUpload("我的病史是高血压");
    expect(result.blockedSensitive).toBe(true);
    expect(result.safeText).toBeNull();
  });

  it("allows sensitive when explicitly granted", () => {
    const result = filterForUpload("我的病史是高血压", { allowSensitive: true });
    expect(result.safeText).toContain("高血压");
  });

  it("checks quotes against source texts", () => {
    expect(quotesMatchSource("住杭州", ["我平时住杭州"])).toBe(true);
    expect(quotesMatchSource("住北京", ["我平时住杭州"])).toBe(false);
  });
});

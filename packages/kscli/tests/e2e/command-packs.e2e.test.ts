import { describe, expect, test } from "vite-plus/test";
import { runKscli } from "./helpers.ts";

describe("e2e: kscli Command Pack host", () => {
  test("keeps the shared host inactive with the default empty policy", async () => {
    const help = await runKscli(["--help"]);
    expect(help.exitCode, help.stderr).toBe(0);
    expect(help.stderr).not.toContain("plugin install");

    const result = await runKscli(["plugin", "list"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/Unknown command/i);
  });
});

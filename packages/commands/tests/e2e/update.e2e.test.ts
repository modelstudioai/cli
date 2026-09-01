import { describe, expect, test } from "vite-plus/test";
import { runCommandHelp, runCommandE2e } from "./helpers.ts";
import { UPDATE_ROUTES } from "./topic-routes.ts";

describe("e2e: update", () => {
  test("update --help 正常退出并展示 --to", async () => {
    const { stderr, exitCode } = await runCommandHelp(UPDATE_ROUTES, ["update", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/--to/);
    expect(stderr).toMatch(/<version>/);
  });

  test("update --help 包含 --to 示例", async () => {
    const { stderr, exitCode } = await runCommandHelp(UPDATE_ROUTES, ["update", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toContain("--to 0.1.14");
  });

  test("update --to 缺值时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(UPDATE_ROUTES, ["update", "--to"]);
    expect(exitCode, stderr).toBe(2);
  });

  test("update --to 非法版本时退出为用法错误 (2)", async () => {
    const { stderr, exitCode } = await runCommandE2e(UPDATE_ROUTES, [
      "update",
      "--to",
      "not-a-version",
    ]);
    expect(exitCode, stderr).toBe(2);
    expect(stderr).toMatch(/semver|--to/i);
  });
});

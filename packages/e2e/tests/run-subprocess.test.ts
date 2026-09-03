import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";
import { runNodeMain } from "../src/run-subprocess.ts";

const testsDir = dirname(fileURLToPath(import.meta.url));
const fixtureMainTs = join(testsDir, "fixtures", "echo-argv.ts");

test("runNodeMain 通过 Node 的 tsx loader 执行 TypeScript 入口", async () => {
  const result = await runNodeMain(fixtureMainTs, ["alpha", "beta"], {
    cwd: testsDir,
    env: { RUNNER_FIXTURE_MARKER: "forwarded" },
  });

  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.stderr).toBe("");
  const output = JSON.parse(result.stdout) as {
    args: string[];
    execArgv: string[];
    marker: string | null;
  };
  expect(output.args).toEqual(["alpha", "beta"]);
  expect(output.marker).toBe("forwarded");
  const importFlagIndex = output.execArgv.indexOf("--import");
  expect(importFlagIndex).toBeGreaterThanOrEqual(0);
  expect(output.execArgv[importFlagIndex + 1]).toMatch(/tsx/);
});

test("runNodeMain 返回 TypeScript 入口的 stderr 与非零退出码", async () => {
  const result = await runNodeMain(fixtureMainTs, ["--fail"], { cwd: testsDir });

  expect(result).toEqual({
    stdout: "",
    stderr: "fixture failure\n",
    exitCode: 7,
  });
});

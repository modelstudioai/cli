import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, test } from "vite-plus/test";
import { runNodeMain } from "e2e/runner";
import { runKscli } from "./helpers.ts";

const kscliPaths = ["config show", "config set", "update", "retrieve", "search", "chat"] as const;

const harnessMainTs = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../commands/tests/e2e/harness/main.ts",
);
const commandsPackageRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../commands");

/** 提取 Flags + Global Flags 段，忽略 Notes/Examples 中的产品 bin 差异 */
function extractFlagSections(text: string): string {
  const start = text.indexOf("Flags:");
  if (start < 0) return text.trim();
  const notesIdx = text.indexOf("\nNotes:", start);
  const examplesIdx = text.indexOf("\nExamples:", start);
  const endCandidates = [notesIdx, examplesIdx].filter((idx) => idx >= 0);
  const end = endCandidates.length > 0 ? Math.min(...endCandidates) : text.length;
  return text.slice(start, end).trim();
}

describe("e2e: kscli registry smoke", () => {
  test.each(kscliPaths)("已注册命令 %s --help 成功", async (path) => {
    const { stderr, exitCode } = await runKscli([...path.split(" "), "--help"]);
    expect(exitCode, stderr).toBe(0);
  });

  test("search --help flag 与 harness knowledge search --help 一致", async () => {
    const [kscliHelp, harnessHelp] = await Promise.all([
      runKscli(["search", "--help"]),
      runNodeMain(harnessMainTs, ["knowledge", "search", "--help"], {
        cwd: commandsPackageRoot,
      }),
    ]);

    expect(kscliHelp.exitCode, kscliHelp.stderr).toBe(0);
    expect(harnessHelp.exitCode, harnessHelp.stderr).toBe(0);

    expect(extractFlagSections(kscliHelp.stderr)).toBe(extractFlagSections(harnessHelp.stderr));
  });
});

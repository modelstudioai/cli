import { readdir, readFile, access } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
async function sources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) =>
        entry.isDirectory()
          ? sources(join(directory, entry.name))
          : entry.name.endsWith(".ts")
            ? [join(directory, entry.name)]
            : [],
      ),
    )
  ).flat();
}

// These are deliberate native/text protocols, covered by their command output tests.
// Adding a raw writer requires reviewing its format guard and documenting the exception.
const nativeWrites = {
  "commands/app/call.ts": 1,
  "commands/auth/login-console.ts": 1,
  "commands/knowledge/chat.ts": 3,
  "commands/managed-agent/_engine/playground-launcher.ts": 1,
  "commands/managed-agent/_engine/session-render.ts": 1,
  "commands/managed-agent/session-event.ts": 1,
  "commands/pipeline/run.ts": 1,
  "commands/speech/synthesize.ts": 1,
};

test("ordinary command output cannot bypass its invocation reporter", async () => {
  const root = join(repo, "packages/commands/src");
  const found: Record<string, number> = {};
  const forbidden: string[] = [];
  for (const path of await sources(root)) {
    const source = await readFile(path, "utf8");
    const name = relative(root, path).replaceAll("\\", "/");
    if (
      /\b(?:emitResult|emitBare|emitRequestId|createSpinner)\b/u.test(source) ||
      /\bconsole\.(?:log|info|warn|error|debug)\s*\(/u.test(source)
    )
      forbidden.push(name);
    const writes = [...source.matchAll(/\bprocess\.std(?:out|err)\.write\s*\(/gu)].length;
    if (writes) found[name] = writes;
  }
  expect(forbidden).toEqual([]);
  expect(found).toEqual(nativeWrites);
});

test("runtime no longer exposes output helpers that bypass resolved display policy", async () => {
  const index = await readFile(join(repo, "packages/runtime/src/index.ts"), "utf8");
  expect(index).not.toMatch(/\b(?:emitResult|emitBare|emitRequestId|createSpinner)\b/u);
  await expect(access(join(repo, "packages/runtime/src/output/output.ts"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});

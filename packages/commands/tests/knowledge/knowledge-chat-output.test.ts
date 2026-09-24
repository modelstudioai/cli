import { readFileSync } from "node:fs";
import { afterEach, expect, test, vi } from "vite-plus/test";
import chat from "../../src/commands/knowledge/chat.ts";
const fixture = readFileSync(new URL("./fixtures/rag-media-chat.sse", import.meta.url), "utf8");
const ttyDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
afterEach(() => {
  vi.restoreAllMocks();
  if (ttyDescriptor) Object.defineProperty(process.stdout, "isTTY", ttyDescriptor);
  else Reflect.deleteProperty(process.stdout, "isTTY");
});
async function run(output: string, tty: boolean, quiet = false, verbose = false) {
  const stdout: string[] = [],
    stderr: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr.push(String(chunk));
    return true;
  });
  Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: tty });
  await chat.run({
    flags: { message: ["hello"], agentId: "agent-fixture", workspaceId: "ws-fixture" },
    settings: { output, quiet, verbose },
    localize: (text: string | { "en-US": string }) =>
      typeof text === "string" ? text : text["en-US"],
    client: { request: vi.fn().mockResolvedValue(new Response(fixture)) },
  } as unknown as Parameters<typeof chat.run>[0]);
  return { stdout: stdout.join(""), stderr: stderr.join("") };
}
test.each([false, true])("JSON retains sources and final answer, tty=%s", async (tty) => {
  const result = await run("json", tty);
  expect(JSON.parse(result.stdout)).toMatchObject({
    answer: "最终答案",
    docs: [{ doc_id: "file-fixture" }],
    usage: { total_tokens: 12 },
  });
});
test.each([false, true])("quiet overrides text/TTY process rendering, tty=%s", async (tty) => {
  const result = await run("text", tty, true);
  expect(result.stdout.trim()).toBe("最终答案");
});
test("JSON + quiet retains bare answer semantics", async () => {
  expect((await run("json", true, true)).stdout.trim()).toBe("最终答案");
});
test("non-TTY text emits only final answer", async () => {
  expect((await run("text", false)).stdout.trim()).toBe("最终答案");
});
test("TTY text keeps phases distinct and includes media references", async () => {
  const result = await run("text", true);
  expect(result.stdout).toContain("规划内容");
  expect(result.stdout).toContain("最终答案");
  expect(result.stdout.match(/最终答案/g)).toHaveLength(1);
  expect(result.stdout).toContain("https://example.com/video.mp4");
});
test("verbose adds diagnostics only to stderr", async () => {
  const result = await run("json", false, false, true);
  expect(JSON.parse(result.stdout).answer).toBe("最终答案");
  expect(result.stderr).toContain("[event]");
});

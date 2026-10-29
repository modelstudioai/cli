import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, expect, test, vi } from "vite-plus/test";
import search from "../../src/commands/knowledge/search.ts";
import serviceCreate from "../../src/commands/knowledge/service-create.ts";
import type { AnyCommand, CommandContext } from "bailian-cli-core";
const directory = mkdtempSync(join(tmpdir(), "rag-options-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));
afterEach(() => vi.restoreAllMocks());
function fixture(name: string, body: unknown) {
  const path = join(directory, name);
  writeFileSync(path, JSON.stringify(body));
  return path;
}
async function preview(command: AnyCommand, flags: Record<string, unknown>) {
  const writes: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    writes.push(String(chunk));
    return true;
  });
  const client = { requestJson: vi.fn() };
  await command.run({
    flags: { workspaceId: "ws_test", ...flags },
    settings: { dryRun: true, output: "json" },
    localize: (text: string | { "en-US": string }) =>
      typeof text === "string" ? text : text["en-US"],
    client,
  } as unknown as CommandContext);
  expect(client.requestJson).not.toHaveBeenCalled();
  return JSON.parse(writes.join(""));
}
test("pure image search sends empty query", async () => {
  const result = await preview(search, {
    agentId: "agent-test",
    image: ["https://example.com/frame.png"],
  });
  expect(result.request).toEqual({
    agent_id: "agent-test",
    query: "",
    images: ["https://example.com/frame.png"],
  });
});
test("online filters preserve opaque filter fields", async () => {
  const configs = [
    { id: "index-test", search_filters: [{ meta: [{ key: "future", value: "test" }] }] },
  ];
  const result = await preview(search, {
    agentId: "agent-test",
    query: "hello",
    kbSearchConfigsFile: fixture("filters.json", configs),
  });
  expect(result.request.kb_search_configs).toEqual(configs);
});
test("online filters cannot override offline ranking", async () => {
  await expect(
    preview(search, {
      agentId: "agent-test",
      query: "hello",
      kbSearchConfigsFile: fixture("ranking.json", [{ id: "index-test", rerank_top_n: 42 }]),
    }),
  ).rejects.toMatchObject({ exitCode: 2 });
});
test("service create passes complete config and unknown fields", async () => {
  const config = {
    kb_search_configs: [{ id: "index-test", rerank: { model_name: "qwen3-vl-rerank" } }],
    hybrid_rerank: { model_name: "qwen3-vl-rerank" },
    future: { enabled: true },
  };
  const result = await preview(serviceCreate, {
    name: "test",
    scene: "search",
    configFile: fixture("service.json", config),
  });
  expect(result.request.agent_config).toEqual(config);
});

test("message files retain full tool history and chat options", async () => {
  const { default: chat } = await import("../../src/commands/knowledge/chat.ts");
  const messages = [
    {
      role: "assistant",
      content: "",
      tool_calls: [{ id: "call-test", function: { name: "semantic_search", arguments: "{}" } }],
    },
    { role: "tool", tool_call_id: "call-test", content: "source", future: { preserved: true } },
    { role: "user", content: "follow up" },
  ];
  const result = await preview(chat, {
    agentId: "agent-test",
    messagesFile: fixture("messages.json", messages),
    sessionFileId: ["file-first", "file-second"],
    enableCacheControl: false,
    requestId: "business-test",
  });
  expect(result.request.input).toEqual({ messages, request_id: "business-test" });
  expect(result.request.parameters.agent_options).toEqual({
    agent_id: "agent-test",
    session_files: ["file-first", "file-second"],
    enable_cache_control: false,
  });
});
test("JSON --message tool history is not converted to user text", async () => {
  const { default: chat } = await import("../../src/commands/knowledge/chat.ts");
  const message = { role: "tool", tool_call_id: "call-test", content: "source", extra_field: true };
  const result = await preview(chat, { agentId: "agent-test", message: [JSON.stringify(message)] });
  expect(result.request.input.messages).toEqual([message]);
});
test("session upload consistently sets both lease and registration category types", async () => {
  const { default: upload } = await import("../../src/commands/knowledge/doc-upload.ts");
  const source = join(directory, "session.txt");
  writeFileSync(source, "session fixture");
  const result = await preview(upload, { file: [source], categoryType: "SESSION_FILE" });
  const steps = result.steps as Array<{ step: string; request: Record<string, unknown> }>;
  expect(steps.find((step) => step.step === "addFile")?.request.categoryType).toBe("SESSION_FILE");
  expect(steps[0]?.request.categoryType).toBe("SESSION_FILE");
});

test.each([9, 10, 11])(
  "OSS object count %s and per-file parser mapping are offline",
  async (count) => {
    const { default: importOss } = await import("../../src/commands/knowledge/doc-import-oss.ts");
    const flags = {
      bucket: "fixture-bucket",
      region: "cn-beijing",
      ossKey: Array.from({ length: count }, (_, index) => `media/${index}.mp4`),
      parser: "DOCMIND_LLM_VERSION_MEDIA",
      parserConfigFile: fixture(`oss-${count}.json`, { future: false }),
    };
    const invalid = await importOss.validate?.(
      flags as Parameters<NonNullable<typeof importOss.validate>>[0],
    );
    if (count > 10) {
      expect(invalid).toBeTruthy();
      return;
    }
    expect(invalid).toBeUndefined();
    const result = await preview(importOss, flags);
    expect(result.request.fileDetails).toEqual(
      flags.ossKey.map((ossKey, index) => ({
        ossKey,
        fileName: `${index}.mp4`,
        parser: flags.parser,
        parserConfig: { future: false },
      })),
    );
  },
);

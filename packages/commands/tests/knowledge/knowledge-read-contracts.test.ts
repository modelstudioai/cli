import { afterEach, expect, test, vi } from "vite-plus/test";
import type { AnyCommand, CommandContext } from "bailian-cli-core";
import kbInfo from "../../src/commands/knowledge/kb-info.ts";
import kbList from "../../src/commands/knowledge/kb-list.ts";
import docList from "../../src/commands/knowledge/doc-list.ts";
afterEach(() => vi.restoreAllMocks());
function context(response: unknown, output: string, flags: Record<string, unknown>) {
  const requestJson = vi.fn().mockResolvedValue(response);
  const writes: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    writes.push(String(chunk));
    return true;
  });
  const ctx = {
    flags,
    settings: { output, workspaceId: "ws_test" },
    identity: { binName: "bl" },
    localize: (text: string | { "en-US": string }) =>
      typeof text === "string" ? text : text["en-US"],
    client: { requestJson },
  } as unknown as CommandContext;
  return { ctx, requestJson, result: () => writes.join("") };
}
test("info displays three media fields without additional requests", async () => {
  const row = {
    id: "index_test",
    knowledgeType: "multimedia",
    knowledgeScene: "basic_multimedia_qa",
    multimodalEmbeddingModelName: "fixture-vl-embedding",
  };
  const run = context({ data: { rows: [row] } }, "text", { indexId: "index_test" });
  await kbInfo.run(run.ctx as unknown as Parameters<typeof kbInfo.run>[0]);
  expect(run.result()).toContain("knowledgeType: multimedia");
  expect(run.result()).toContain("knowledgeScene: basic_multimedia_qa");
  expect(run.result()).toContain("multimodalEmbeddingModelName: fixture-vl-embedding");
  expect(run.requestJson).toHaveBeenCalledTimes(1);
});
test("null index fields and unknown fields survive JSON", async () => {
  const row = {
    id: "index_test",
    knowledgeType: null,
    knowledgeScene: null,
    multimodalEmbeddingModelName: null,
    future: { value: 42 },
  };
  const run = context({ data: { rows: [row] } }, "json", { indexId: "index_test" });
  await kbInfo.run(run.ctx as unknown as Parameters<typeof kbInfo.run>[0]);
  expect(JSON.parse(run.result())).toEqual(row);
  expect(run.requestJson).toHaveBeenCalledTimes(1);
});
test("list text includes server knowledge type", async () => {
  const run = context(
    { data: { rows: [{ id: "index_test", name: "sample", knowledgeType: "multimedia" }] } },
    "text",
    {},
  );
  await kbList.run(run.ctx as unknown as Parameters<typeof kbList.run>[0]);
  expect(run.result()).toContain("multimedia");
});
test("details text shows configuration and JSON preserves unknown fields", async () => {
  const response = {
    data: {
      rows: [
        {
          doc_id: "file_test",
          chunkSize: 600,
          overlapSize: 100,
          separator: "|",
          chunkMode: "auto",
          enableHeaders: false,
          future: { value: 42 },
        },
      ],
      total_count: 1,
    },
  };
  const run = context(response, "text", { indexId: "index_test", details: true });
  await docList.run(run.ctx as unknown as Parameters<typeof docList.run>[0]);
  expect(run.result()).toContain("chunkSize: 600");
  expect(run.result()).toContain("enableHeaders: false");
  expect(run.requestJson.mock.calls[0]![0]).toMatchObject({
    method: "POST",
    body: { indexId: "index_test", pageNumber: 1, pageSize: 10 },
  });
  vi.restoreAllMocks();
  const jsonRun = context(response, "json", { indexId: "index_test", details: true });
  await docList.run(jsonRun.ctx as unknown as Parameters<typeof docList.run>[0]);
  expect(JSON.parse(jsonRun.result())).toEqual(response);
});

test.each([false, true])(
  "document list empty second page preserves envelope (details=%s)",
  async (details) => {
    const response = { data: { rows: [], total_count: 0, future: false } };
    const run = context(response, "json", {
      indexId: "index_test",
      details,
      pageNumber: 2,
      pageSize: 5,
    });
    await docList.run(run.ctx as unknown as Parameters<typeof docList.run>[0]);
    expect(JSON.parse(run.result())).toEqual(response);
    const request = run.requestJson.mock.calls[0]![0];
    if (details)
      expect(request).toMatchObject({ method: "POST", body: { pageNumber: 2, pageSize: 5 } });
    else {
      expect(request.method).toBe("GET");
      expect(new URL(request.path).searchParams.get("page_num")).toBe("2");
      expect(new URL(request.path).searchParams.get("page_size")).toBe("5");
    }
  },
);

test.each([false, true])(
  "document list passes backend errors unchanged (details=%s)",
  async (details) => {
    const failure = new Error("raw server error");
    const run = context({}, "json", { indexId: "index_test", details });
    run.requestJson.mockRejectedValue(failure);
    await expect(docList.run(run.ctx as unknown as Parameters<typeof docList.run>[0])).rejects.toBe(
      failure,
    );
  },
);

test("file get preserves media parser, status and unknown JSON fields", async () => {
  const { default: fileGet } = await import("../../src/commands/knowledge/file-get.ts");
  const response = {
    data: {
      fileId: "file-test",
      parser: "DOCMIND_LLM_VERSION_MEDIA",
      status: "SUCCESS",
      future: { value: 0 },
    },
  };
  const run = context(response, "json", { fileId: "file-test" });
  await fileGet.run(run.ctx as unknown as Parameters<typeof fileGet.run>[0]);
  expect(JSON.parse(run.result())).toEqual(response);
  expect(run.requestJson).toHaveBeenCalledTimes(1);
});

test.each(["search", "chunk"])(
  "%s preserves raw media JSON and renders description for empty text",
  async (kind) => {
    const command: AnyCommand =
      kind === "search"
        ? (await import("../../src/commands/knowledge/search.ts")).default
        : (await import("../../src/commands/knowledge/chunk-list.ts")).default;
    const metadata = {
      _id: "chunk-test",
      doc_id: "file-test",
      content: "",
      clip_description: "画面说明",
      clip_start_time: 0,
      clip_end_time: 1000,
      video_url: ["https://example.com/video.mp4"],
      image_url: [],
      audio_segments: [{ end_time: 2000 }],
      future: false,
    };
    const response = {
      data: { nodes: [{ text: "", score: 0.9, metadata }] },
      future: { preserved: true },
    };
    const flags = {
      indexId: "index-test",
      docId: "file-test",
      agentId: "agent-test",
      query: "fixture",
    };
    const jsonRun = context(response, "json", flags);
    await command.run(jsonRun.ctx as unknown as Parameters<typeof command.run>[0]);
    expect(JSON.parse(jsonRun.result())).toEqual(response);
    vi.restoreAllMocks();
    const textRun = context(response, "text", flags);
    await command.run(textRun.ctx as unknown as Parameters<typeof command.run>[0]);
    expect(textRun.result()).toContain("画面说明");
    expect(textRun.result()).toContain("00:00.000");
    expect(textRun.result()).toContain("https://example.com/video.mp4");
    expect(response.data.nodes[0]?.metadata).toEqual(metadata);
  },
);

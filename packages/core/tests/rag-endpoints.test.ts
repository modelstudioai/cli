import { describe, expect, test } from "vite-plus/test";
import { ragEndpoint, RAG_PATHS } from "../src/client/endpoints.ts";

describe("ragEndpoint", () => {
  test("拼接 workspace 子域名与路径", () => {
    expect(ragEndpoint("ws_test", RAG_PATHS.indexList)).toBe(
      "https://ws_test.cn-beijing.maas.aliyuncs.com/api/v1/indices/rag/index/list",
    );
  });

  test("RAG_PATHS 覆盖全部管理端点域", () => {
    // indices domain
    expect(RAG_PATHS.indexCreateV2).toBe("/api/v1/indices/rag/index/create_v2");
    expect(RAG_PATHS.indexJobStatus).toBe("/api/v1/indices/rag/index_job/status");
    expect(RAG_PATHS.chunkList).toBe("/api/v1/indices/rag/index/chunklist");
    expect(RAG_PATHS.chunkCreate).toBe("/api/v1/indices/rag/index/chunk/create");
    // agent domain (the actual gateway prefix is rag/app/, not rag/agent/ as the public docs state)
    expect(RAG_PATHS.agentList).toBe("/api/v1/indices/rag/app/list");
    // connector domain
    expect(RAG_PATHS.listCategory).toBe("/api/v1/connector/dash/listCategory");
  });
});

import type { KnowledgeSearchResponse } from "bailian-cli-core";

const MARKER = "BAILIAN_CLI_INIT_SAMPLE_V1";

// Embedded so packaged executables do not depend on an external fixture file.
// A future sample revision must not silently replace documents in an existing base.
export const INIT_SAMPLE = {
  filename: "bailian-cli-init-sample-v1.md",
  query: "What is retrieval-augmented generation (RAG)? 什么是检索增强生成？",
  content: `# Knowledge retrieval sample / 知识检索样例

${MARKER}

RAG means retrieval-augmented generation. It retrieves relevant information from a knowledge base before generating an answer, so the answer can use your own documents.

RAG 是检索增强生成：先从知识库检索相关资料，再根据资料生成回答，让回答能够使用你自己的文档。

This document verifies the first knowledge retrieval. 本文档用于验证首次知识库检索。
`,
} as const;

export function matchesInitSample(response: {
  data?: { nodes?: ReadonlyArray<Partial<KnowledgeSearchResponse["data"]["nodes"][number]>> };
}): boolean {
  return (response.data?.nodes ?? []).some((node) =>
    [node.text, node.metadata?.content].some(
      (content) => typeof content === "string" && content.includes(MARKER),
    ),
  );
}

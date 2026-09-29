import { BailianError, ExitCode, type LocalizedText, type RagAgentConfig } from "bailian-cli-core";

export const INIT_RETRIEVAL_DEFAULTS = {
  rerank_min_score: 0.01,
  dense_similarity_top_k: 100,
  sparse_similarity_top_k: 50,
  enable_reranking: true,
  rerank_top_n: 5,
} as const;

/** Compute a patch without modifying the server response or unrelated bindings. */
export function completeInitRetrievalConfig(
  config: RagAgentConfig,
  indexId: string,
  owned: boolean,
  localize: (text: LocalizedText) => string,
): { config: RagAgentConfig; changed: boolean } {
  const bindings = config.kb_search_configs?.filter((binding) => binding.id === indexId) ?? [];
  if (bindings.length !== 1) {
    throw new BailianError(
      localize({
        "en-US":
          "Initialization requires exactly one service binding to the target knowledge base.",
        "zh-CN": "初始化要求检索服务恰好有一项配置绑定到目标知识库。",
      }),
      ExitCode.GENERAL,
    );
  }
  const binding = bindings[0]!;
  const missing = Object.keys(INIT_RETRIEVAL_DEFAULTS).filter((field) => binding[field] == null);
  if (missing.length === 0) return { config, changed: false };
  if (!owned) {
    throw new BailianError(
      localize({
        "en-US": `The existing service is missing retrieval settings: ${missing.join(", ")}. Initialization cannot change a service it does not own.`,
        "zh-CN": `已有服务缺少检索设置：${missing.join(", ")}。初始化不能修改不属于它的服务。`,
      }),
      ExitCode.GENERAL,
    );
  }
  const completed = { ...binding };
  for (const [field, defaultValue] of Object.entries(INIT_RETRIEVAL_DEFAULTS)) {
    completed[field] ??= defaultValue;
  }
  return {
    config: {
      ...config,
      kb_search_configs: config.kb_search_configs!.map((entry) =>
        entry === binding ? completed : entry,
      ),
    },
    changed: true,
  };
}

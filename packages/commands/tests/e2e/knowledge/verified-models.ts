// Model values verified against the live API, shared by the knowledge e2e cases so a
// server-side model rotation only needs one edit here.
//
// Deliberately test-only: the command layer must NOT mirror these lists into local
// validation. Model catalogs churn with server-side launches/deprecations, so a
// hardcoded allowlist in the CLI would block valid models until users upgrade.

/**
 * Accepted values for `agent_config.agent_model` (service create/update).
 * Everything else — including qwen-plus, qwen-max, qwen3-max, qwen3.7-flash,
 * qwen3.7-max and deepseek-v3 — is rejected with
 * HTTP 401 InvalidParameter "agent model not allowed: <name>".
 * The first entry is also the server-side default for a freshly created service.
 */
export const VERIFIED_AGENT_MODELS = ["qwen3.6-plus", "qwen3.7-plus"] as const;

/**
 * Accepted value for `rerank[].model_name` on index/retrieve.
 * Gotcha: the server only branches on the `-hybrid` suffix — the model prefix is
 * ignored (`qwen3-rerank` and `gte-rerank` score identically to omitting the field,
 * `qwen3-rerank-hybrid` and `gte-rerank-hybrid` score identically to each other), so
 * the effective scoring model is the index's own `rerankModelName`. Unknown names and
 * indexes without `rerankModelName` both fail with
 * HTTP 500 Index.IndexRerankError "index rerank config(<name>) error.".
 */
export const VERIFIED_RERANK_MODEL = "qwen3-rerank-hybrid";

/**
 * Pick a verified model that differs from the current one, so a write → read-back
 * assertion proves the value actually changed instead of re-writing the default.
 * Returns undefined when the allowlist has shrunk to the model already in use — the
 * caller must then skip the model assertion instead of asserting a no-op.
 */
export function pickDifferentAgentModel(currentModel: string | undefined): string | undefined {
  return VERIFIED_AGENT_MODELS.find((model) => model !== currentModel);
}

import { expect, test } from "vite-plus/test";
import type { LocalizedText } from "bailian-cli-core";
import {
  completeInitRetrievalConfig,
  INIT_RETRIEVAL_DEFAULTS,
} from "../../src/commands/knowledge/init-service-config.ts";

const localize = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]);

test("fills only missing fields for the owned index without mutating the response", () => {
  const config = {
    agent_policy: "turbo",
    kb_search_configs: [
      { id: "ours", rerank_top_n: 9 },
      { id: "other", custom: "preserved" },
    ],
  };
  const snapshot = structuredClone(config);
  const result = completeInitRetrievalConfig(config, "ours", true, localize);
  expect(result.changed).toBe(true);
  expect(result.config).toEqual({
    ...config,
    kb_search_configs: [
      { id: "ours", ...INIT_RETRIEVAL_DEFAULTS, rerank_top_n: 9 },
      config.kb_search_configs[1],
    ],
  });
  expect(config).toEqual(snapshot);
});

test("zero and false are user values; null and absent fields get defaults", () => {
  const result = completeInitRetrievalConfig(
    {
      kb_search_configs: [
        { id: "ours", rerank_min_score: 0, enable_reranking: false, rerank_top_n: null },
      ],
    },
    "ours",
    true,
    localize,
  );
  expect(result.config.kb_search_configs?.[0]).toEqual({
    id: "ours",
    ...INIT_RETRIEVAL_DEFAULTS,
    rerank_min_score: 0,
    enable_reranking: false,
  });
});

test("complete configurations do not request a write, even for a reused service", () => {
  const config = { kb_search_configs: [{ id: "ours", ...INIT_RETRIEVAL_DEFAULTS }] };
  expect(completeInitRetrievalConfig(config, "ours", false, localize)).toEqual({
    config,
    changed: false,
  });
});

test("incomplete configuration on an unowned service is reported without mutation", () => {
  const config = { kb_search_configs: [{ id: "ours" }] };
  expect(() => completeInitRetrievalConfig(config, "ours", false, localize)).toThrow(
    /rerank_min_score/,
  );
  expect(config).toEqual({ kb_search_configs: [{ id: "ours" }] });
});

test.each([
  {},
  { kb_search_configs: [{ id: "other" }] },
  { kb_search_configs: [{ id: "ours" }, { id: "ours" }] },
])("missing or ambiguous binding fails %#", (config) => {
  expect(() => completeInitRetrievalConfig(config, "ours", true, localize)).toThrow(/binding/);
});

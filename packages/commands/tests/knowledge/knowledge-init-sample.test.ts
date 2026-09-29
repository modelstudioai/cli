import { expect, test } from "vite-plus/test";
import { INIT_SAMPLE, matchesInitSample } from "../../src/commands/knowledge/init-sample.ts";

test("the embedded document contains the stable marker and its retrieval answer", () => {
  expect(INIT_SAMPLE.content).toContain("BAILIAN_CLI_INIT_SAMPLE_V1");
  expect(INIT_SAMPLE.content).toContain("retrieval-augmented generation");
  expect(INIT_SAMPLE.query).toContain("retrieval-augmented generation");
  expect(INIT_SAMPLE.filename).toMatch(/\.md$/);
});

test("successful API calls without the marker are not a successful initialization", () => {
  expect(matchesInitSample({ data: { nodes: [] } })).toBe(false);
  expect(
    matchesInitSample({ data: { nodes: [{ score: 1, text: "An unrelated document" }] } }),
  ).toBe(false);
});

test("marker in recalled text or content metadata verifies the sample", () => {
  expect(matchesInitSample({ data: { nodes: [{ score: 0.8, text: INIT_SAMPLE.content }] } })).toBe(
    true,
  );
  expect(
    matchesInitSample({
      data: { nodes: [{ score: 0.8, text: "", metadata: { content: INIT_SAMPLE.content } }] },
    }),
  ).toBe(true);
});

test("marker in an unrelated metadata field does not verify recalled content", () => {
  expect(
    matchesInitSample({
      data: {
        nodes: [
          {
            score: 0.8,
            text: "unrelated",
            metadata: { file_name: "BAILIAN_CLI_INIT_SAMPLE_V1.md" },
          },
        ],
      },
    }),
  ).toBe(false);
});

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vite-plus/test";
import { isMemoryE2EReady, parseStdoutJson, runCommandE2e } from "../helpers.ts";
import { MEMORY_ADD_ROUTES } from "../topic-routes.ts";
import { memoryJourney } from "./live-helpers.ts";
import { TEST_WORKSPACE_ARGS, type MemoryNodeDetailBody } from "./shared.ts";

const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/memory-multimodal.json", import.meta.url), "utf8"),
) as { messages: unknown[]; meta_data: Record<string, string> };
const inputArgs = [
  "--messages",
  JSON.stringify(fixture.messages),
  "--meta-data",
  JSON.stringify(fixture.meta_data),
];

test("memory multimodal dry-run preserves ordered text/images and metadata", async () => {
  const result = await runCommandE2e(MEMORY_ADD_ROUTES, [
    "memory",
    "add",
    "--user-id",
    "multimodal-offline",
    ...inputArgs,
    ...TEST_WORKSPACE_ARGS,
    "--dry-run",
    "--output",
    "json",
  ]);
  expect(result.exitCode, result.stderr).toBe(0);
  const body = parseStdoutJson<{ request: Record<string, unknown> }>(result.stdout);
  expect(body.request).toEqual({ user_id: "multimodal-offline", ...fixture });
});

// Fixture prerequisite: the selected library's default observation rule must
// have multimodal extraction enabled. The CLI does not configure that rule.
describe.skipIf(!isMemoryE2EReady())("memory multimodal (live)", () => {
  test("three images yield readable visual facts, metadata and searchable fruit preference", async () => {
    const journey = memoryJourney();
    try {
      const receipt = await journey.add([...inputArgs, "--wait", "180"]);
      expect(receipt.event_id).toBeTruthy();
      expect(receipt.events?.length).toBeGreaterThan(0);
      for (const event of receipt.events ?? [])
        expect(event.status).toMatch(/^(SUCCEEDED|SUCCESS)$/);
      const nodes = await journey.untilRows((rows) => rows.length > 0, ["--page-size", "100"]);
      const details = [];
      for (const node of nodes) {
        const detail = await journey.invoke<MemoryNodeDetailBody>([
          "node",
          "show",
          "--node-id",
          node.memory_node_id,
        ]);
        expect(detail.memory_node?.content).toBe(node.content);
        expect(detail.memory_node?.meta_data).toMatchObject(fixture.meta_data);
        details.push(detail.memory_node!);
      }
      const content = details.map((node) => node.content).join("\n");
      expect.soft(content).toMatch(/葡萄|grapes?/i);
      expect.soft(content).not.toMatch(/用户的生日|user's birthday/i);
      expect(content).toMatch(/生日|birthday/i);
      expect(content).toMatch(/女儿|daughter/i);
      expect(content).toMatch(/狗|犬|dog/i);
      const matches = await journey.search([
        "--query",
        "我最喜欢的水果是什么？",
        "--plan-version",
        "pro",
        "--top-k",
        "10",
        "--min-score",
        "0",
      ]);
      expect(matches.some((node) => /葡萄|grapes?/i.test(node.content))).toBe(true);
      const knownIds = new Set(nodes.map((node) => node.memory_node_id));
      for (const match of matches) expect(knownIds.has(match.memory_node_id)).toBe(true);
    } finally {
      await journey.cleanup();
    }
  }, 600_000);
  test("single fruit image contributes a fact absent from the text", async () => {
    const journey = memoryJourney();
    try {
      const receipt = await journey.add([
        "--messages",
        JSON.stringify([
          {
            role: "user",
            content: [
              { type: "text", text: "这是我最喜欢的水果，请记住。" },
              {
                type: "image_url",
                image_url: {
                  url: "https://search-data-all.oss-cn-hangzhou.aliyuncs.com/memory/fruit04.png",
                },
              },
            ],
          },
        ]),
        "--wait",
        "180",
      ]);
      expect(receipt.event_id).toBeTruthy();
      const nodes = await journey.list(["--page-size", "100"]);
      const matches = await journey.search([
        "--query",
        "我最喜欢的水果是什么？",
        "--plan-version",
        "pro",
        "--top-k",
        "10",
        "--min-score",
        "0",
      ]);
      expect.soft(nodes.some((node) => /葡萄|grapes?/i.test(node.content))).toBe(true);
      expect(matches.some((node) => /葡萄|grapes?/i.test(node.content))).toBe(true);
    } finally {
      await journey.cleanup();
    }
  }, 600_000);
});

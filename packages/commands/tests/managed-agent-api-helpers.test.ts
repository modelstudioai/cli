import { expect, test } from "vite-plus/test";
import { createZip, redactSensitiveValues } from "../src/commands/managed-agent/session-debug.ts";
import { searchCursorPages } from "../src/commands/managed-agent/_engine/api-helpers.ts";

test("searchCursorPages preserves opaque cursors and marks truncated scans", async () => {
  const cursors: Array<string | undefined> = [];
  const result = await searchCursorPages(
    async (page) => {
      cursors.push(page);
      if (!page) return { items: ["one"], hasMore: true, nextPage: "opaque-A" };
      return { items: ["two"], hasMore: true, nextPage: "opaque-B" };
    },
    (item) => item.includes("o"),
    2,
  );
  expect(cursors).toEqual([undefined, "opaque-A"]);
  expect(result.items).toEqual(["one", "two"]);
  expect(result.truncated).toBe(true);
  expect(result.nextPage).toBe("opaque-B");
});

test("session export ZIP is valid-shaped and redacts credential-like values", () => {
  const redacted = redactSensitiveValues({
    api_key: "secret",
    nested: { authorization: "Bearer secret", normal: "kept" },
  });
  expect(redacted).toEqual({
    api_key: "[REDACTED]",
    nested: { authorization: "[REDACTED]", normal: "kept" },
  });

  const zip = createZip([
    { name: "manifest.json", content: new TextEncoder().encode('{"schema_version":1}\n') },
    { name: "events.json", content: new TextEncoder().encode("[]\n") },
  ]);
  expect(Array.from(zip.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
  const decoded = new TextDecoder().decode(zip);
  expect(decoded).toContain("manifest.json");
  expect(decoded).toContain("events.json");
  expect(Array.from(zip.slice(-22, -18))).toEqual([0x50, 0x4b, 0x05, 0x06]);
});

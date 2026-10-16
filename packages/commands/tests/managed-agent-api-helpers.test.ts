import { expect, test } from "vite-plus/test";
import { createZip, redactSensitiveValues } from "../src/commands/managed-agent/session-debug.ts";
import { searchCursorPages } from "../src/commands/managed-agent/_engine/api-helpers.ts";
import { buildSkillListJsonResult } from "../src/commands/managed-agent/skill/list.ts";

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

test("legacy skill-list JSON keeps source alongside pagination fields", () => {
  expect(
    buildSkillListJsonResult("official", {
      items: [{ id: "skill-official" }],
      hasMore: true,
      nextPage: "opaque-next",
    }),
  ).toEqual({
    source: "official",
    skills: [{ id: "skill-official" }],
    has_more: true,
    next_page: "opaque-next",
  });
});

test("session export ZIP is valid-shaped and redacts credential-like values", () => {
  const redacted = redactSensitiveValues({
    api_key: "secret",
    nested: {
      authorization: "Bearer secret",
      normal: "kept",
      tool_input: "https://example.test/private?X-Amz-Signature=must-not-leak",
      download_url:
        "https://example.test/private?X-Amz-Credential=credential&X-Amz-Signature=must-not-leak",
      json_url:
        '{"url":"https://example.test/private?X-Amz-Signature=must-not-leak","status":"ok"}',
      message: 'request={"token":"must-not-leak"} Authorization: Bearer must-not-leak',
    },
  });
  expect(redacted).toEqual({
    api_key: "[REDACTED]",
    nested: {
      authorization: "[REDACTED]",
      normal: "kept",
      tool_input: "[REDACTED]",
      download_url:
        "https://example.test/private?X-Amz-Credential=[REDACTED]&X-Amz-Signature=[REDACTED]",
      json_url: '{"url":"https://example.test/private?X-Amz-Signature=[REDACTED]","status":"ok"}',
      message: 'request={"token":"[REDACTED]"} Authorization: [REDACTED]',
    },
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

test("session diagnostics redact every environment value while preserving names and input", () => {
  const variables = { LOG_LEVEL: "debug", CUSTOM_VALUE: "private-value", EMPTY: "" };
  const session = {
    environment_variables: variables,
    attributes: { environment_variables: variables },
  };
  const masked = { LOG_LEVEL: "[REDACTED]", CUSTOM_VALUE: "[REDACTED]", EMPTY: "[REDACTED]" };
  const redacted = redactSensitiveValues(session);

  expect(redacted).toEqual({
    environment_variables: masked,
    attributes: { environment_variables: masked },
  });
  expect(variables.CUSTOM_VALUE).toBe("private-value");
  const zip = createZip([
    { name: "session.json", content: new TextEncoder().encode(JSON.stringify(redacted)) },
  ]);
  const decoded = new TextDecoder().decode(zip);
  expect(decoded).toContain("CUSTOM_VALUE");
  expect(decoded).toContain("[REDACTED]");
  expect(decoded).not.toContain("private-value");
});

import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vite-plus/test";
import { readParserOptions } from "../../src/commands/knowledge/parser-config.ts";
const directory = mkdtempSync(join(tmpdir(), "rag-parser-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));
const localize = (text: { "en-US": string; "zh-CN": string } | string) =>
  typeof text === "string" ? text : text["en-US"];
test("unspecified parser options do not change OSS default body", () => {
  expect(readParserOptions({}, localize)).toEqual({});
});
test("explicit parser and unknown config fields survive", () => {
  const path = join(directory, "valid.json");
  writeFileSync(path, '{"future_option":{"enabled":true}}');
  expect(
    readParserOptions({ parser: "DOCMIND_LLM_VERSION_MEDIA", parserConfigFile: path }, localize),
  ).toEqual({
    parser: "DOCMIND_LLM_VERSION_MEDIA",
    parserConfig: { future_option: { enabled: true } },
  });
});
test.each(["[]", "null", '"text"', "{"])("reject invalid config object %s", (content) => {
  const path = join(directory, "invalid.json");
  writeFileSync(path, content);
  expect(() => readParserOptions({ parserConfigFile: path }, localize)).toThrow();
});
test("missing file preserves errno", () => {
  expect(() =>
    readParserOptions({ parserConfigFile: join(directory, "missing.json") }, localize),
  ).toThrow(/ENOENT/);
});

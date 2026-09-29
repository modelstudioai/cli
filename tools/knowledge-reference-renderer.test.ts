import { expect, test } from "vite-plus/test";
import { defineCommand } from "../packages/core/src/index.ts";
import { CommandRegistry } from "../packages/runtime/src/registry.ts";
import { buildCommandSchema } from "../packages/runtime/src/introspect.ts";
import {
  renderKnowledgeReference,
  renderKnowledgeReferenceIndex,
} from "./knowledge-reference-renderer.ts";

const command = defineCommand({
  auth: "apiKey",
  description: { "en-US": "Initialize | retrieve", "zh-CN": "初始化 | 检索" },
  usageArgs: "--mode <new|reuse> [flags]",
  flags: {
    mode: {
      type: "string",
      valueHint: "<mode>",
      choices: ["new", "reuse"],
      required: true,
      description: { "en-US": "Choose new | reuse", "zh-CN": "选择新建 | 复用" },
    },
  },
  risk: {
    level: "high",
    reason: "billing",
    message: { "en-US": "Charges start at creation", "zh-CN": "创建即计费" },
  },
  notes: [{ "en-US": "No automatic publishing", "zh-CN": "不自动发布" }],
  exampleArgs: ["--mode new --yes", "# Review the plan first"],
  async prepare() {
    return { data: undefined, preview: {}, risk: null, notices: [] };
  },
  async run() {},
});
function schema(bin: string, path: string) {
  return buildCommandSchema(new CommandRegistry({ [path]: command }, bin), {
    binName: bin,
    version: "2.0.1",
    npmPackage: "fixture",
    clientName: "fixture",
  });
}

test("actual product paths are preserved with no prefix substitution", () => {
  const bl = renderKnowledgeReference(schema("bl", "knowledge init"));
  const kscli = renderKnowledgeReference(schema("kscli", "init"));
  expect(bl).toContain("bl knowledge init --mode");
  expect(kscli).toContain("kscli init --mode");
  expect(kscli).not.toContain("kscli knowledge");
});
test("required flags, choices, billing risk and runtime confirmation survive rendering", () => {
  const output = renderKnowledgeReference(schema("bl", "knowledge init"));
  expect(output).toContain("--mode");
  expect(output).toContain("new\\|reuse");
  expect(output).toMatch(/--mode[^\n]+yes/i);
  expect(output).toContain("high (billing)");
  expect(output).toContain("Charges start at creation");
  expect(output).toContain("--yes");
  expect(output).toContain("only after");
  expect(output).toContain("read-only");
  expect(output).toContain("--api-key");
  expect(output).toContain("--output");
  expect(output).toContain("No automatic publishing");
});
test("comments retain their existing qualification and no defaults are inferred", () => {
  const output = renderKnowledgeReference(schema("kscli", "init"));
  expect(output).toContain("\n# Review the plan first\n");
  expect(output).not.toContain("kscli init #");
  expect(output).not.toContain("Default: new");
  expect(output).toContain("not exported");
});
test("locale selection is explicit and table pipes are escaped", () => {
  const output = renderKnowledgeReference(schema("bl", "knowledge init"), "zh-CN");
  expect(output).toContain("初始化 | 检索");
  expect(output).toContain("选择新建 \\| 复用");
  expect(output).toContain("创建即计费");
  expect(output).not.toContain("Charges start at creation");
});
test("rendering is deterministic and does not mutate schema", () => {
  const input = schema("kscli", "init");
  const snapshot = structuredClone(input);
  expect(renderKnowledgeReference(input)).toBe(renderKnowledgeReference(input));
  expect(input).toEqual(snapshot);
});
test("index links both actual product references", () => {
  const output = renderKnowledgeReferenceIndex();
  expect(output).toContain("(knowledge.md)");
  expect(output).toContain("(kscli.md)");
});

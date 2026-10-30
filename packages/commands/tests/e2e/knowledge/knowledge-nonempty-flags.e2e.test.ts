import { httpTransport } from "bailian-cli-core";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { runCommandInProcess } from "../helpers.ts";
import type { E2eRouteExports } from "../topic-routes.ts";
beforeEach(() => {
  vi.spyOn(httpTransport, "fetch").mockRejectedValue(new Error("Unexpected network request"));
});
afterEach(() => vi.restoreAllMocks());
const cases = [
  {
    path: "chunk add",
    exportName: "knowledgeChunkAdd",
    flag: "--index-id",
    args: ["chunk", "add", "--index-id", "", "--doc-id", "doc", "--content", "hello"],
  },
  {
    path: "chunk add",
    exportName: "knowledgeChunkAdd",
    flag: "--index-id",
    args: ["chunk", "add", "--index-id", " \t\n", "--doc-id", "doc", "--content", "hello"],
  },
  {
    path: "chunk add",
    exportName: "knowledgeChunkAdd",
    flag: "--doc-id",
    args: ["chunk", "add", "--index-id", "idx", "--doc-id", "", "--content", "hello"],
  },
  {
    path: "chunk add",
    exportName: "knowledgeChunkAdd",
    flag: "--doc-id",
    args: ["chunk", "add", "--index-id", "idx", "--doc-id", " \t\n", "--content", "hello"],
  },
  {
    path: "chunk add",
    exportName: "knowledgeChunkAdd",
    flag: "--content",
    args: ["chunk", "add", "--index-id", "idx", "--doc-id", "doc", "--content", ""],
  },
  {
    path: "chunk add",
    exportName: "knowledgeChunkAdd",
    flag: "--content",
    args: ["chunk", "add", "--index-id", "idx", "--doc-id", "doc", "--content", " \t\n"],
  },
  {
    path: "chunk list",
    exportName: "knowledgeChunkList",
    flag: "--index-id",
    args: ["chunk", "list", "--index-id", ""],
  },
  {
    path: "chunk list",
    exportName: "knowledgeChunkList",
    flag: "--index-id",
    args: ["chunk", "list", "--index-id", " \t\n"],
  },
  {
    path: "chunk delete",
    exportName: "knowledgeChunkDelete",
    flag: "--index-id",
    args: ["chunk", "delete", "--index-id", "", "--chunk-id", "chunk"],
  },
  {
    path: "chunk delete",
    exportName: "knowledgeChunkDelete",
    flag: "--index-id",
    args: ["chunk", "delete", "--index-id", " \t\n", "--chunk-id", "chunk"],
  },
  {
    path: "chunk delete",
    exportName: "knowledgeChunkDelete",
    flag: "--chunk-id",
    args: ["chunk", "delete", "--index-id", "idx", "--chunk-id", ""],
  },
  {
    path: "chunk delete",
    exportName: "knowledgeChunkDelete",
    flag: "--chunk-id",
    args: ["chunk", "delete", "--index-id", "idx", "--chunk-id", " \t\n"],
  },
  {
    path: "doc import-oss",
    exportName: "knowledgeDocImportOss",
    flag: "--bucket",
    args: ["doc", "import-oss", "--bucket", "", "--region", "cn-beijing", "--oss-key", "sample.md"],
  },
  {
    path: "doc import-oss",
    exportName: "knowledgeDocImportOss",
    flag: "--bucket",
    args: [
      "doc",
      "import-oss",
      "--bucket",
      " \t\n",
      "--region",
      "cn-beijing",
      "--oss-key",
      "sample.md",
    ],
  },
  {
    path: "doc import-oss",
    exportName: "knowledgeDocImportOss",
    flag: "--region",
    args: ["doc", "import-oss", "--bucket", "bucket", "--region", "", "--oss-key", "sample.md"],
  },
  {
    path: "doc import-oss",
    exportName: "knowledgeDocImportOss",
    flag: "--region",
    args: [
      "doc",
      "import-oss",
      "--bucket",
      "bucket",
      "--region",
      " \t\n",
      "--oss-key",
      "sample.md",
    ],
  },
  {
    path: "doc import-oss",
    exportName: "knowledgeDocImportOss",
    flag: "--oss-key",
    args: ["doc", "import-oss", "--bucket", "bucket", "--region", "cn-beijing", "--oss-key", ""],
  },
  {
    path: "doc import-oss",
    exportName: "knowledgeDocImportOss",
    flag: "--oss-key",
    args: [
      "doc",
      "import-oss",
      "--bucket",
      "bucket",
      "--region",
      "cn-beijing",
      "--oss-key",
      " \t\n",
    ],
  },
  {
    path: "doc tag",
    exportName: "knowledgeDocTag",
    flag: "--doc-id",
    args: ["doc", "tag", "--doc-id", "", "--tag", "tag"],
  },
  {
    path: "doc tag",
    exportName: "knowledgeDocTag",
    flag: "--doc-id",
    args: ["doc", "tag", "--doc-id", " \t\n", "--tag", "tag"],
  },
  {
    path: "doc tag",
    exportName: "knowledgeDocTag",
    flag: "--tag",
    args: ["doc", "tag", "--doc-id", "file", "--tag", ""],
  },
  {
    path: "doc tag",
    exportName: "knowledgeDocTag",
    flag: "--tag",
    args: ["doc", "tag", "--doc-id", "file", "--tag", " \t\n"],
  },
  {
    path: "doc delete",
    exportName: "knowledgeDocDelete",
    flag: "--index-id",
    args: ["doc", "delete", "--index-id", "", "--doc-id", "doc"],
  },
  {
    path: "doc delete",
    exportName: "knowledgeDocDelete",
    flag: "--index-id",
    args: ["doc", "delete", "--index-id", " \t\n", "--doc-id", "doc"],
  },
  {
    path: "doc delete",
    exportName: "knowledgeDocDelete",
    flag: "--doc-id",
    args: ["doc", "delete", "--index-id", "idx", "--doc-id", ""],
  },
  {
    path: "doc delete",
    exportName: "knowledgeDocDelete",
    flag: "--doc-id",
    args: ["doc", "delete", "--index-id", "idx", "--doc-id", " \t\n"],
  },
  {
    path: "service create",
    exportName: "knowledgeServiceCreate",
    flag: "--name",
    args: ["service", "create", "--name", "", "--scene", "search"],
  },
  {
    path: "service create",
    exportName: "knowledgeServiceCreate",
    flag: "--name",
    args: ["service", "create", "--name", " \t\n", "--scene", "search"],
  },
  {
    path: "service get",
    exportName: "knowledgeServiceGet",
    flag: "--agent-id",
    args: ["service", "get", "--agent-id", ""],
  },
  {
    path: "service get",
    exportName: "knowledgeServiceGet",
    flag: "--agent-id",
    args: ["service", "get", "--agent-id", " \t\n"],
  },
];
test.each(cases)("rejects blank $path $flag: $args", async ({ path, exportName, flag, args }) => {
  for (const dryRun of [false, true]) {
    const result = await runCommandInProcess({ [path]: exportName } as E2eRouteExports, [
      ...args,
      ...(dryRun ? ["--dry-run"] : []),
      "--output",
      "json",
    ]);
    expect(result.exitCode, result.stderr).toBe(2);
    expect(result.stdout).toBe("");
    const diagnostic = JSON.parse(result.stderr);
    expect(diagnostic.error.code).toBe(2);
    expect(diagnostic.error.message).toContain(flag);
  }
});

test.each([
  {
    path: "doc import-oss",
    exportName: "knowledgeDocImportOss",
    args: [
      "doc",
      "import-oss",
      "--bucket",
      "bucket",
      "--region",
      "cn-beijing",
      "--oss-key",
      "valid.md",
      "--oss-key",
      "",
    ],
  },
  {
    path: "chunk delete",
    exportName: "knowledgeChunkDelete",
    args: ["chunk", "delete", "--index-id", "idx", "--chunk-id", "valid", "--chunk-id", " "],
  },
  {
    path: "doc delete",
    exportName: "knowledgeDocDelete",
    args: ["doc", "delete", "--index-id", "idx", "--doc-id", "valid", "--doc-id", ""],
  },
  {
    path: "doc tag",
    exportName: "knowledgeDocTag",
    args: ["doc", "tag", "--doc-id", "doc", "--tag", "valid", "--tag", " "],
  },
])(
  "rejects blank member after a valid repeated flag: $path",
  async ({ path, exportName, args }) => {
    const result = await runCommandInProcess({ [path]: exportName } as E2eRouteExports, [
      ...args,
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(result.exitCode, result.stderr).toBe(2);
    expect(result.stdout).toBe("");
  },
);

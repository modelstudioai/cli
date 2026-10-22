import { describe, expect, test } from "vite-plus/test";
import type { FlagsDef } from "bailian-cli-core";
import { parseStdoutJson, runCommandE2e } from "../helpers.ts";
import add from "../../../src/commands/memory/add.ts";
import search from "../../../src/commands/memory/search.ts";
import list from "../../../src/commands/memory/list.ts";
import node_show from "../../../src/commands/memory/node-show.ts";
import update from "../../../src/commands/memory/update.ts";
import memoryDelete from "../../../src/commands/memory/delete.ts";
import skill_export from "../../../src/commands/memory/skill-export.ts";
import profile_create from "../../../src/commands/memory/profile-create.ts";
import profile_list from "../../../src/commands/memory/profile-list.ts";
import profile_show from "../../../src/commands/memory/profile-show.ts";
import profile_update from "../../../src/commands/memory/profile-update.ts";
import profile_delete from "../../../src/commands/memory/profile-delete.ts";
import profile_get from "../../../src/commands/memory/profile-get.ts";

interface Contract {
  command: { flags?: FlagsDef };
  path: string;
  exportName: string;
  flags: Record<string, string | number | string[]>;
  method: string;
  endpoint: string;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
}
const contracts: Contract[] = [
  {
    command: add,
    path: "memory add",
    exportName: "memoryAdd",
    flags: {
      userId: "user1",
      messages: '[{"role": "user", "content": "fact"}]',
      content: "fact",
      profileSchema: "schema1",
      projectId: ["project1"],
      metaData: '{"location": "\\u676d\\u5dde", "count": 2}',
      wait: 0,
      skillName: "summary",
      skillDescription: "summarize",
      skillTags: ["office", "notes"],
      libraryId: "lib1",
      workspaceId: "ws_test",
    },
    method: "POST",
    endpoint: "add-async",
    body: {
      user_id: "user1",
      messages: [{ role: "user", content: "fact" }],
      custom_content: "fact",
      profile_schema: "schema1",
      project_id: "project1",
      meta_data: { location: "杭州", count: 2 },
      memory_library_id: "lib1",
      skill_name: "summary",
      skill_description: "summarize",
      skill_tags: ["office", "notes"],
    },
  },
  {
    command: add,
    path: "memory add",
    exportName: "memoryAdd",
    flags: {
      userId: "user1",
      messages: '[{"role": "user", "content": "fact"}]',
      profileSchema: "schema1",
      extractMode: "profile_only",
      projectId: ["one", "two"],
      libraryId: "lib1",
      workspaceId: "ws_test",
    },
    method: "POST",
    endpoint: "add-async",
    body: {
      user_id: "user1",
      messages: [{ role: "user", content: "fact" }],
      profile_schema: "schema1",
      extract_mode: "profile_only",
      project_ids: ["one", "two"],
      memory_library_id: "lib1",
    },
  },
  {
    command: search,
    path: "memory search",
    exportName: "memorySearch",
    flags: {
      userId: "user1",
      query: "ignored",
      messages: '[{"role": "user", "content": "fact"}]',
      topK: 100,
      minScore: 0,
      memoryTypes: ["observation", "skill"],
      projectIds: ["one", "two"],
      planVersion: "pro",
      libraryId: "lib1",
      workspaceId: "ws_test",
    },
    method: "POST",
    endpoint: "memory_nodes/search",
    body: {
      user_id: "user1",
      messages: [{ role: "user", content: "fact" }],
      top_k: 100,
      min_score: 0,
      memory_types: ["observation", "skill"],
      project_ids: ["one", "two"],
      plan_version: "pro",
      memory_library_id: "lib1",
    },
  },
  {
    command: search,
    path: "memory search",
    exportName: "memorySearch",
    flags: {
      userId: "user1",
      query: "fact",
      memoryType: "observation",
      projectId: ["one", "two"],
      planVersion: "lite",
      libraryId: "lib1",
      workspaceId: "ws_test",
    },
    method: "POST",
    endpoint: "memory_nodes/search",
    body: {
      user_id: "user1",
      messages: [{ role: "user", content: "fact" }],
      memory_types: ["observation"],
      project_ids: ["one", "two"],
      plan_version: "lite",
      memory_library_id: "lib1",
    },
  },
  {
    command: list,
    path: "memory list",
    exportName: "memoryList",
    flags: {
      userId: "user1",
      page: 2,
      pageSize: 20,
      projectId: "project1",
      libraryId: "lib1",
      workspaceId: "ws_test",
    },
    method: "GET",
    endpoint: "memory_nodes",
    query: {
      user_id: "user1",
      page_num: "2",
      page_size: "20",
      project_id: "project1",
      memory_library_id: "lib1",
    },
  },
  {
    command: node_show,
    path: "memory node show",
    exportName: "memoryNodeShow",
    flags: { nodeId: "node/1", workspaceId: "ws_test" },
    method: "GET",
    endpoint: "memory_nodes/node%2F1",
  },
  {
    command: skill_export,
    path: "memory skill export",
    exportName: "memorySkillExport",
    flags: { nodeId: "node/1", workspaceId: "ws_test" },
    method: "GET",
    endpoint: "skill/export/node%2F1",
  },
  {
    command: update,
    path: "memory update",
    exportName: "memoryUpdate",
    flags: {
      nodeId: "node/1",
      content: "fact",
      metaData: '{"location": "\\u676d\\u5dde", "count": 2}',
      skillName: "summary",
      skillDescription: "summarize",
      skillTags: ["office", "notes"],
      libraryId: "lib1",
      workspaceId: "ws_test",
    },
    method: "PATCH",
    endpoint: "memory_nodes/node%2F1",
    body: {
      custom_content: "fact",
      meta_data: { location: "杭州", count: 2 },
      memory_library_id: "lib1",
      skill_name: "summary",
      skill_description: "summarize",
      skill_tags: ["office", "notes"],
    },
  },
  {
    command: memoryDelete,
    path: "memory delete",
    exportName: "memoryDelete",
    flags: { nodeId: "node/1", libraryId: "lib1", workspaceId: "ws_test" },
    method: "DELETE",
    endpoint: "memory_nodes/node%2F1",
    query: { memory_library_id: "lib1" },
  },
  {
    command: profile_create,
    path: "memory profile create",
    exportName: "memoryProfileCreate",
    flags: {
      name: "schema",
      description: "",
      attributes: '[{"name": "plan", "description": "\\u5957\\u9910", "default_value": "free"}]',
      planVersion: "lite",
      extractScene: "efficient",
      libraryId: "lib1",
      workspaceId: "ws_test",
    },
    method: "POST",
    endpoint: "profile_schemas",
    body: {
      name: "schema",
      description: "",
      attributes: [{ name: "plan", description: "套餐", default_value: "free" }],
      plan_version: "lite",
      extract_scene: "efficient",
      memory_library_id: "lib1",
    },
  },
  {
    command: profile_list,
    path: "memory profile list",
    exportName: "memoryProfileList",
    flags: { page: 2, pageSize: 20, libraryId: "lib1", workspaceId: "ws_test" },
    method: "GET",
    endpoint: "profile_schemas",
    query: { page_num: "2", page_size: "20", memory_library_id: "lib1" },
  },
  {
    command: profile_show,
    path: "memory profile show",
    exportName: "memoryProfileShow",
    flags: { schemaId: "schema/1", libraryId: "lib1", workspaceId: "ws_test" },
    method: "GET",
    endpoint: "profile_schemas/schema%2F1",
    query: { memory_library_id: "lib1" },
  },
  {
    command: profile_update,
    path: "memory profile update",
    exportName: "memoryProfileUpdate",
    flags: {
      schemaId: "schema/1",
      name: "new",
      description: "",
      attributesOperations:
        '[{"op": "add", "name": "plan", "description": "\\u5957\\u9910", "default_value": "free"}, {"op": "update", "attribute_id": "attr1", "name": "plan2", "description": "updated", "default_value": null}, {"op": "delete", "attribute_id": "attr2"}]',
      planVersion: "pro",
      extractScene: "intelligent",
      libraryId: "lib1",
      workspaceId: "ws_test",
    },
    method: "PATCH",
    endpoint: "profile_schemas/schema%2F1",
    body: {
      name: "new",
      description: "",
      attributes_operations: [
        { op: "add", name: "plan", description: "套餐", default_value: "free" },
        {
          op: "update",
          attribute_id: "attr1",
          name: "plan2",
          description: "updated",
          default_value: null,
        },
        { op: "delete", attribute_id: "attr2" },
      ],
      plan_version: "pro",
      extract_scene: "intelligent",
      memory_library_id: "lib1",
    },
  },
  {
    command: profile_delete,
    path: "memory profile delete",
    exportName: "memoryProfileDelete",
    flags: { schemaId: "schema/1", libraryId: "lib1", workspaceId: "ws_test" },
    method: "DELETE",
    endpoint: "profile_schemas/schema%2F1",
    query: { memory_library_id: "lib1" },
  },
  {
    command: profile_get,
    path: "memory profile get",
    exportName: "memoryProfileGet",
    flags: { schemaId: "schema/1", userId: "user1", libraryId: "lib1", workspaceId: "ws_test" },
    method: "GET",
    endpoint: "profile_schemas/schema%2F1/user_profile",
    query: { user_id: "user1", memory_library_id: "lib1" },
  },
];
function argv(flags: Contract["flags"]): string[] {
  return Object.entries(flags).flatMap(([key, value]) => {
    const flag = "--" + key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    return (Array.isArray(value) ? value : [value]).flatMap((item) => [flag, String(item)]);
  });
}

describe("memory complete positive parameter contract", () => {
  for (const contract of contracts) {
    test(`${contract.path}: ${Object.keys(contract.flags).join(", ")}`, async () => {
      const result = await runCommandE2e({ [contract.path]: contract.exportName }, [
        ...contract.path.split(" "),
        ...argv(contract.flags),
        "--dry-run",
        "--output",
        "json",
      ]);
      expect(result.exitCode, result.stderr).toBe(0);
      const data = parseStdoutJson<{ endpoint: string; method: string; request?: unknown }>(
        result.stdout,
      );
      const endpoint = new URL(data.endpoint);
      expect(endpoint.origin).toBe("https://ws_test.cn-beijing.maas.aliyuncs.com");
      expect(endpoint.pathname).toBe(`/api/v2/apps/memory/${contract.endpoint}`);
      expect(Object.fromEntries(endpoint.searchParams)).toEqual(contract.query ?? {});
      expect(data.method).toBe(contract.method);
      expect(data.request).toEqual(contract.body);
    });
  }
  // Adding a public flag without extending a positive contract must fail this suite.
  for (const path of new Set(contracts.map((contract) => contract.path))) {
    test(`${path}: every declared flag appears in a positive contract`, () => {
      const variants = contracts.filter((contract) => contract.path === path);
      const covered = [
        ...new Set(variants.flatMap((contract) => Object.keys(contract.flags))),
      ].sort();
      expect(covered).toEqual(Object.keys(variants[0].command.flags ?? {}).sort());
    });
  }
});

// Runtime required/choice guards must reject before run(); custom validate branches are
// exercised in the existing per-command tests and the dedicated supplements below.
for (const path of new Set(contracts.map((contract) => contract.path))) {
  const contract = contracts.find((candidate) => candidate.path === path)!;
  for (const [flag, definition] of Object.entries(contract.command.flags ?? {})) {
    if ("required" in definition && definition.required) {
      test(`${path}: required ${flag} cannot be omitted`, async () => {
        const flags = { ...contract.flags };
        delete flags[flag];
        const result = await runCommandE2e({ [path]: contract.exportName }, [
          ...path.split(" "),
          ...argv(flags),
          "--dry-run",
          "--output",
          "json",
        ]);
        expect(result.exitCode, result.stderr).toBe(2);
        expect(result.stderr).toContain(argv({ [flag]: "unused" })[0]);
      });
    }
    if ("choices" in definition && definition.choices) {
      for (const choice of definition.choices) {
        test(`${path}: ${flag} accepts ${choice}`, async () => {
          const flags = {
            ...contract.flags,
            [flag]: definition.type === "array" ? [choice] : choice,
          };
          if (flag === "extractScene" && choice === "intelligent") flags.planVersion = "pro";
          if (flag === "planVersion" && choice === "lite" && "extractScene" in flags)
            flags.extractScene = "efficient";
          if (flag === "memoryType") delete flags.memoryTypes;
          if (flag === "extractMode") delete flags.content;
          const result = await runCommandE2e({ [path]: contract.exportName }, [
            ...path.split(" "),
            ...argv(flags),
            "--dry-run",
            "--output",
            "json",
          ]);
          expect(result.exitCode, result.stderr).toBe(0);
          const wireKey: Record<string, string> = {
            planVersion: "plan_version",
            extractScene: "extract_scene",
            extractMode: "extract_mode",
            memoryType: "memory_types",
            memoryTypes: "memory_types",
          };
          const data = parseStdoutJson<{ request: Record<string, unknown> }>(result.stdout);
          expect(data.request[wireKey[flag]]).toEqual(
            flag === "memoryType" || definition.type === "array" ? [choice] : choice,
          );
        });
      }
      test(`${path}: ${flag} rejects invalid enum`, async () => {
        const result = await runCommandE2e({ [path]: contract.exportName }, [
          ...path.split(" "),
          ...argv({ ...contract.flags, [flag]: "invalid-enum" }),
          "--dry-run",
          "--output",
          "json",
        ]);
        expect(result.exitCode, result.stderr).toBe(2);
        expect(result.stderr).toContain(argv({ [flag]: "unused" })[0]);
      });
    }
  }
}

for (const path of new Set(contracts.map((contract) => contract.path))) {
  const contract = contracts.find((candidate) => candidate.path === path)!;
  for (const [flag, limit] of [
    ["userId", 64],
    ["libraryId", 32],
  ] as const) {
    if (!(flag in (contract.command.flags ?? {}))) continue;
    test(`${path}: validate rejects ${flag} above ${limit}`, async () => {
      const result = await runCommandE2e({ [path]: contract.exportName }, [
        ...path.split(" "),
        ...argv({ ...contract.flags, [flag]: "x".repeat(limit + 1) }),
        "--dry-run",
        "--output",
        "json",
      ]);
      expect(result.exitCode, result.stderr).toBe(2);
      expect(result.stderr).toContain(argv({ [flag]: "unused" })[0]);
    });
  }
}

const guardCases: Array<{
  path: string;
  patch: Contract["flags"];
  omit?: string[];
  error: string;
}> = [
  ...["memory add", "memory update"].flatMap((path) =>
    ["[]", "null", "42", '"text"'].map((value) => ({
      path,
      patch: { metaData: value },
      error: "JSON object",
    })),
  ),
  ...["memory add", "memory search"].map((path) => ({
    path,
    patch: { messages: "{}" },
    error: "JSON array",
  })),
  {
    path: "memory add",
    patch: { messages: '[{"role":"assistant","tool_calls":{}}]' },
    error: "tool_calls must be an array",
  },
  {
    path: "memory add",
    patch: { messages: '[{"role":"assistant","tool_calls":[{"function":{"name":"lookup"}}]}]' },
    error: ".id is required",
  },
  {
    path: "memory add",
    patch: { messages: '[{"role":"assistant","tool_calls":[{"id":"call1"}]}]' },
    error: ".function is required",
  },
  {
    path: "memory add",
    patch: { extractMode: "profile_only" },
    omit: ["messages", "content"],
    error: "messages",
  },
  {
    path: "memory profile create",
    patch: { attributes: '[{"description":"missing name"}]' },
    error: ".name is required",
  },
];
for (const path of ["memory add", "memory update"]) {
  const skillFlags = ["skillName", "skillDescription", "skillTags"];
  // All six incomplete subsets exercise the shared all-or-none guard.
  for (let mask = 1; mask < 7; mask += 1) {
    guardCases.push({
      path,
      patch: {},
      omit: skillFlags.filter((_, index) => (mask & (1 << index)) === 0),
      error: "must be provided together",
    });
  }
}
for (const [index, scenario] of guardCases.entries()) {
  test(`run/validate guard ${index}: ${scenario.path} ${scenario.error}`, async () => {
    const contract = contracts.find((candidate) => candidate.path === scenario.path)!;
    const flags = { ...contract.flags, ...scenario.patch };
    for (const flag of scenario.omit ?? []) delete flags[flag];
    const result = await runCommandE2e({ [contract.path]: contract.exportName }, [
      ...contract.path.split(" "),
      ...argv(flags),
      "--dry-run",
      "--output",
      "json",
    ]);
    expect(result.exitCode, result.stderr).toBe(2);
    expect(result.stderr).toContain(scenario.error);
  });
}

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import {
  buildSettings,
  Client,
  httpTransport,
  type AnyCommand,
  type LocalizedText,
} from "bailian-cli-core";
import { createCli, createOutputReporter } from "bailian-cli-runtime";
import { runInProcess } from "e2e/in-process";
import { buildIsolatedCliEnv } from "e2e/isolation";
import * as commands from "bailian-cli-commands";
import { E2E_HARNESS_IDENTITY } from "../e2e/harness/identity.ts";
import { withHarnessUpdateFixture } from "../e2e/harness/update-fixture.ts";

const identity = { binName: "bl", version: "test", clientName: "test", npmPackage: "test" };
const extra = { future: { retained: [0, false, null, []] } };
const node = {
  request_id: "request-node",
  ...extra,
  memory_node: {
    memory_node_id: "node-one",
    content: "Body\nSecond",
    memory_type: "skill",
    status: "VALID",
    project_id: "project-one",
    timestamp: 0,
    created_at: 0,
    updated_at: 1,
    meta_data: { flag: false, score: 0 },
    media_desc: "Caption",
    media_urls: ["https://media.invalid/one"],
  },
};
const skill = {
  request_id: "request-skill",
  ...extra,
  memory_node: {
    memory_node_id: "node-one",
    content: "# Skill\n\nBody\n",
    skill_name: "Demo",
    skill_description: "About",
    skill_tags: [],
  },
};
const profiles = {
  request_id: "request-list",
  ...extra,
  profile_schemas: [
    { profile_schema_id: "schema-one", name: "Profile", plan_version: "pro", description: "About" },
    { profile_schema_id: "schema-two", name: "Other" },
  ],
  total: 2,
};
const profile = {
  request_id: "request-profile",
  ...extra,
  name: "Profile",
  description: "About",
  attributes: [
    { attribute_id: "attr-one", name: "Flag", description: "Enabled", default_value: false },
    { attribute_id: "attr-two", name: "Count", default_value: 0 },
  ],
};
const mutation = {
  request_id: "request-mutation",
  ...extra,
  data: { agent_id: "aid-one", agent_status: "draft", agent_version: "2", agent_name: "Demo" },
};
const config = {
  agent_policy: "turbo",
  agent_model: "model-one",
  hybrid_rerank: false,
  temperature: 0,
  max_num_llm_calls: 3,
  future: { retain: true },
  kb_search_configs: [
    { id: "index-one", name: "Docs", rerank: false, rerank_top_n: 0, rerank_min_score: 0 },
  ],
};
const detail = {
  request_id: "request-service",
  ...extra,
  data: {
    agent_id: "aid-one",
    agent_name: "Demo",
    agent_desc: "About",
    agent_scene: "search",
    agent_status: "draft",
    agent_details: [
      { agent_version: "beta", agent_version_desc: "Draft", publish_time: 0, agent_config: config },
    ],
  },
};
const services = {
  request_id: "request-services",
  ...extra,
  data: {
    total_count: 7,
    rows: [
      {
        agent_id: "aid-one",
        agent_status: "draft",
        agent_version: "beta",
        agent_name: "Demo",
        pipeline_list: [{ pipeline_name: "Docs" }],
      },
    ],
  },
};
interface Scenario {
  name: string;
  command: AnyCommand;
  flags: Record<string, unknown>;
  response: unknown;
  method: string;
  path: string;
  text: string;
  chinese: string;
  body?: unknown;
}
const cases: Scenario[] = [
  {
    name: "memory node show",
    command: commands.memoryNodeShow,
    flags: { nodeId: "node-one" },
    response: node,
    method: "GET",
    path: "/api/v2/apps/memory/memory_nodes/node-one",
    text: '[node-one] Body\nSecond\n  type: skill  status: VALID\n  project: project-one\n  timestamp: 0\n  created_at: 0\n  updated_at: 1\n  meta: {"flag":false,"score":0}\n  media_desc: Caption\n  media_urls: https://media.invalid/one\n',
    chinese: "类型",
  },
  {
    name: "memory skill export",
    command: commands.memorySkillExport,
    flags: { nodeId: "node-one" },
    response: skill,
    method: "GET",
    path: "/api/v2/apps/memory/skill/export/node-one",
    text: "# Skill\n\nBody\n\n",
    chinese: "# Skill",
  },
  {
    name: "memory profile list",
    command: commands.memoryProfileList,
    flags: { libraryId: "lib-one", pageSize: 2, page: 3 },
    response: profiles,
    method: "GET",
    path: "/api/v2/apps/memory/profile_schemas?page_size=2&page_num=3&memory_library_id=lib-one",
    text: "[schema-one] Profile (pro)\n  About\n[schema-two] Other\n\nTotal: 2\n",
    chinese: "总数",
  },
  {
    name: "memory profile show",
    command: commands.memoryProfileShow,
    flags: { schemaId: "schema-one", libraryId: "lib-one" },
    response: profile,
    method: "GET",
    path: "/api/v2/apps/memory/profile_schemas/schema-one?memory_library_id=lib-one",
    text: "Name: Profile\nDescription: About\nAttributes:\n  [attr-one] Flag\n    desc: Enabled\n    default: false\n  [attr-two] Count\n    default: 0\n",
    chinese: "名称",
  },
  {
    name: "memory profile update",
    command: commands.memoryProfileUpdate,
    flags: { schemaId: "schema-one", libraryId: "lib-one", description: "" },
    response: { request_id: "request-update", ...extra },
    method: "PATCH",
    path: "/api/v2/apps/memory/profile_schemas/schema-one",
    body: { description: "", memory_library_id: "lib-one" },
    text: "Profile schema schema-one updated.\n",
    chinese: "已更新",
  },
  {
    name: "memory profile delete",
    command: commands.memoryProfileDelete,
    flags: { schemaId: "schema-one", libraryId: "lib-one" },
    response: { request_id: "request-delete", ...extra },
    method: "DELETE",
    path: "/api/v2/apps/memory/profile_schemas/schema-one?memory_library_id=lib-one",
    text: "Profile schema schema-one deleted.\n",
    chinese: "已删除",
  },
  {
    name: "knowledge service list",
    command: commands.knowledgeServiceList,
    flags: { scene: "search", pageNumber: 2, pageSize: 3, name: "Demo" },
    response: services,
    method: "POST",
    path: "/api/v1/indices/rag/app/list",
    body: { agent_scene: "search", agent_name: "Demo", page_number: 2, page_size: 3 },
    text: "aid-one  draft  beta  Demo  (kb: Docs)\ntotal: 7\nUse an agent_id above with the knowledge search command.\n",
    chinese: "总数",
  },
  {
    name: "knowledge service get",
    command: commands.knowledgeServiceGet,
    flags: { agentId: "aid-one" },
    response: detail,
    method: "POST",
    path: "/api/v1/indices/rag/app/get",
    body: { agent_id: "aid-one" },
    text: "Basic:\n  id: aid-one\n  name: Demo\n  desc: About\n  scene: search\n  status: draft\nVersion beta:\n  desc: Draft\n  published: 0\n  policy: turbo\n  model: model-one\n  hybrid_rerank: false\n  temperature: 0\n  kb: index-one  (Docs)\n    rerank: false\n    rerank_top_n: 0\n    rerank_min_score: 0\n",
    chinese: "基本信息",
  },
  {
    name: "knowledge service create",
    command: commands.knowledgeServiceCreate,
    flags: { name: "Demo", scene: "search", indexId: "index-one" },
    response: mutation,
    method: "POST",
    path: "/api/v1/indices/rag/app/create",
    body: {
      agent_name: "Demo",
      agent_scene: "search",
      agent_config: { kb_search_configs: [{ id: "index-one" }] },
    },
    text: "created: aid-one  (status: draft, version: 2)\nTest the draft with --agent-version beta on search/chat, then deploy it to publish.\n",
    chinese: "已创建",
  },
  {
    name: "knowledge service update",
    command: commands.knowledgeServiceUpdate,
    flags: { agentId: "aid-one", description: "" },
    response: mutation,
    method: "POST",
    path: "/api/v1/indices/rag/app/update",
    body: { agent_id: "aid-one", agent_desc: "" },
    text: "updated: aid-one\n",
    chinese: "已更新",
  },
  {
    name: "knowledge service deploy",
    command: commands.knowledgeServiceDeploy,
    flags: { agentId: "aid-one", versionDesc: "Release" },
    response: mutation,
    method: "POST",
    path: "/api/v1/indices/rag/app/deploy",
    body: { agent_id: "aid-one", agent_version_desc: "Release" },
    text: "deployed: aid-one  version 2\n",
    chinese: "已部署",
  },
  {
    name: "knowledge service delete",
    command: commands.knowledgeServiceDelete,
    flags: { agentId: "aid-one" },
    response: mutation,
    method: "POST",
    path: "/api/v1/indices/rag/app/delete",
    body: { agent_id: "aid-one" },
    text: "deleted: aid-one  (status: draft)\n",
    chinese: "已删除",
  },
  {
    name: "knowledge service copy",
    command: commands.knowledgeServiceCopy,
    flags: { agentId: "aid-one" },
    response: mutation,
    method: "POST",
    path: "/api/v1/indices/rag/app/copy",
    body: { agent_id: "aid-one" },
    text: "new agent_id: aid-one  (name: Demo, status: draft)\nTest the draft with --agent-version beta on search/chat, then deploy it to publish.\n",
    chinese: "新 agent_id",
  },
];
let directory: string;
let responses: unknown[];
let requests: Array<{ url: string; method: string; body?: unknown }>;
let failure: boolean;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "memory-service-output-"));
  responses = [];
  requests = [];
  failure = false;
  vi.spyOn(httpTransport, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    requests.push({
      url,
      method: init?.method ?? "GET",
      ...(typeof init?.body === "string" ? { body: JSON.parse(init.body) } : {}),
    });
    if (failure)
      return Response.json(
        { code: "Rejected", message: "original service error", request_id: "request-error" },
        { status: 403 },
      );
    if (!responses.length) throw new Error(`Unexpected request: ${url}`);
    return Response.json(responses.shift());
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});
interface Display {
  format: "json" | "text";
  quiet?: boolean;
  verbose?: boolean;
  language?: "en-US" | "zh-CN";
  dryRun?: boolean;
}
async function invoke(
  scenario: Scenario,
  display: Display,
  response: unknown = scenario.response,
  preceding: unknown[] = [],
) {
  responses = [...preceding, response];
  let stdout = "",
    stderr = "";
  const outSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  const errSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });
  const settings = buildSettings({
    flags: {
      output: display.format,
      quiet: display.quiet,
      verbose: display.verbose,
      dryRun: display.dryRun,
    },
    file: { language: display.language ?? "en-US", workspace_id: "ws-test" },
    env: {},
    configPath: join(directory, "config.json"),
  });
  const localize = (text: LocalizedText) =>
    typeof text === "string" ? text : text[display.language ?? "en-US"];
  const reporter = createOutputReporter({
    settings,
    localize,
    stdout: {
      write: (chunk) => {
        stdout += chunk;
      },
    },
    stderr: {
      write: (chunk) => {
        stderr += chunk;
      },
    },
  });
  const client = new Client({
    identity,
    settings,
    baseUrl: "https://fixture.invalid",
    apiCred: { token: "fixture-api-key", source: "flag", baseUrl: "https://fixture.invalid" },
    debug: (diagnostic) => reporter.output.debug(diagnostic),
  });
  let exitCode = 0;
  try {
    try {
      await scenario.command.run({
        identity,
        settings,
        client,
        output: reporter.output,
        localize,
        flags: scenario.flags,
      } as never);
    } catch (error) {
      exitCode = reporter.error(error);
    }
    return { stdout, stderr, exitCode };
  } finally {
    outSpy.mockRestore();
    errSpy.mockRestore();
  }
}
const modes = ["json", "text"].flatMap((format) =>
  [false, true].flatMap((quiet) =>
    [false, true].map((verbose) => ({ format: format as "json" | "text", quiet, verbose })),
  ),
);
for (const scenario of cases) {
  test.each(modes)(`${scenario.name} preserves full result and requests: %j`, async (display) => {
    const result = await invoke(scenario, display);
    expect(result.exitCode, result.stderr).toBe(0);
    if (display.format === "json") expect(JSON.parse(result.stdout)).toEqual(scenario.response);
    else expect(result.stdout).toBe(scenario.text);
    expect(requests).toEqual([
      {
        url: `https://ws-test.cn-beijing.maas.aliyuncs.com${scenario.path}`,
        method: scenario.method,
        ...(scenario.body === undefined ? {} : { body: scenario.body }),
      },
    ]);
    const records =
      display.format === "json" && result.stderr
        ? result.stderr
            .trimEnd()
            .split("\n")
            .map((line) => JSON.parse(line))
        : [];
    expect(records.every((record) => record.debug !== undefined)).toBe(true);
    expect(result.stdout + result.stderr).not.toContain("fixture-api-key");
  });
  test(`${scenario.name} localizes text and keeps the same JSON data`, async () => {
    const text = await invoke(scenario, { format: "text", language: "zh-CN", quiet: true });
    expect(text.exitCode, text.stderr).toBe(0);
    expect(text.stdout).toContain(scenario.chinese);
    const json = await invoke(scenario, { format: "json", language: "zh-CN", quiet: true });
    expect(JSON.parse(json.stdout)).toEqual(scenario.response);
  });
  test(`${scenario.name} dry-run has complete preview and performs no HTTP`, async () => {
    const result = await invoke(scenario, { format: "json", quiet: true, dryRun: true });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      endpoint: `https://ws-test.cn-beijing.maas.aliyuncs.com${scenario.path}`,
    });
    expect(requests).toEqual([]);
  });
  test(`${scenario.name} preserves server failure as one JSONL error`, async () => {
    failure = true;
    const result = await invoke(scenario, { format: "json", quiet: true });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const records = result.stderr
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(records).toHaveLength(1);
    expect(records[0].error).toMatchObject({
      message: "original service error",
      request_id: "request-error",
      http_status: 403,
      api_code: "Rejected",
    });
    expect(requests).toHaveLength(1);
  });
}
const empties = [
  {
    index: 0,
    response: { request_id: "empty-node", memory_node: null },
    text: "Memory node not found.\n",
  },
  {
    index: 1,
    response: { request_id: "empty-skill", memory_node: null },
    text: "Skill memory node not found.\n",
  },
  {
    index: 2,
    response: { request_id: "empty-list", profile_schemas: [], total: 0 },
    text: "No profile schemas found.\n",
  },
  {
    index: 3,
    response: { request_id: "empty-profile", attributes: [] },
    text: "Name: (none)\nNo attributes.\n",
  },
  {
    index: 6,
    response: { request_id: "empty-services", data: { rows: [], total_count: 0 } },
    text: "No services found.\ntotal: 0\nUse an agent_id above with the knowledge search command.\n",
  },
];
for (const empty of empties) {
  test.each(modes)(
    `empty ${cases[empty.index]!.name} preserves response and text: %j`,
    async (display) => {
      const result = await invoke(cases[empty.index]!, display, empty.response);
      expect(result.exitCode, result.stderr).toBe(0);
      if (display.format === "json") expect(JSON.parse(result.stdout)).toEqual(empty.response);
      else expect(result.stdout).toBe(empty.text);
    },
  );
}
test("JSON does not evaluate text-only details", async () => {
  for (const index of [0, 1, 2, 3, 6, 7]) {
    const response = {
      request_id: "opaque",
      memory_node: null,
      profile_schemas: "opaque",
      attributes: "opaque",
      data: { rows: "opaque", agent_details: "opaque" },
    };
    const result = await invoke(cases[index]!, { format: "json", quiet: true }, response);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(response);
  }
});
test("scalar service update preserves unknown beta config and zero/false values", async () => {
  const scenario = { ...cases[9]!, flags: { agentId: "aid-one", temperature: 0 } };
  const result = await invoke(scenario, { format: "json", quiet: true }, mutation, [detail]);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual(mutation);
  expect(requests.map((request) => request.body)).toEqual([
    { agent_id: "aid-one", agent_version: "beta" },
    { agent_id: "aid-one", agent_config: { ...config, temperature: 0 } },
  ]);
  expect(JSON.parse(result.stderr).warning).toMatchObject({
    code: "KNOWLEDGE_SERVICE_UNKNOWN_CONFIG_FIELD",
    details: { field: "future" },
  });
});
test.each([8, 10, 11, 12])(
  "mutation %s keeps flat as well as nested response envelopes",
  async (index) => {
    const response = {
      request_id: "flat",
      agent_id: "aid-flat",
      agent_version: "3",
      agent_status: "deployed",
      agent_name: "Flat",
      ...extra,
    };
    const result = await invoke(cases[index]!, { format: "json", quiet: true }, response);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(response);
  },
);
test.each([5, 10, 11])("high-risk command %s still gates HTTP until --yes", async (index) => {
  const scenario = cases[index]!;
  const route = scenario.name;
  const args = [
    ...route.split(" "),
    ...(index === 5 ? ["--schema-id", "schema-one"] : ["--agent-id", "aid-one"]),
    "--workspace-id",
    "ws-test",
    "--api-key",
    "fixture-api-key",
    "--output",
    "json",
    "--quiet",
  ];
  const isolated = buildIsolatedCliEnv({
    overrides: {
      BAILIAN_CONFIG_DIR: directory,
      DASHSCOPE_QUIET: "",
      DASHSCOPE_OUTPUT: "",
      DASHSCOPE_VERBOSE: "",
    },
  });
  try {
    const run = (argv: string[]) =>
      runInProcess(
        () =>
          withHarnessUpdateFixture(() =>
            createCli({ [route]: scenario.command }, E2E_HARNESS_IDENTITY).run(argv),
          ),
        argv,
        { env: isolated.env },
      );
    const blocked = await run(args);
    expect(blocked.exitCode, blocked.stderr).toBe(7);
    expect(requests).toEqual([]);
    expect(JSON.parse(blocked.stderr).error.type).toBe("requires_confirmation");
    responses = [scenario.response];
    const confirmed = await run([...args, "--yes"]);
    expect(confirmed.exitCode, confirmed.stderr).toBe(0);
    expect(JSON.parse(confirmed.stdout)).toEqual(scenario.response);
    expect(requests).toHaveLength(1);
  } finally {
    isolated.dispose();
  }
});

test.each([8, 9])(
  "config-file command %s keeps warnings structured and passes through config",
  async (index) => {
    const configFile = join(directory, "config.json");
    const settings = {
      future_config: { retained: true },
      kb_search_configs: [
        {
          id: "index-one",
          rerank: { rerank_mode: "default", rerank_instruct: "Custom instruction" },
        },
      ],
    };
    await writeFile(configFile, JSON.stringify(settings));
    const scenario = {
      ...cases[index]!,
      flags:
        index === 8
          ? { name: "Demo", scene: "search", configFile }
          : { agentId: "aid-one", configFile },
    };
    const result = await invoke(scenario, { format: "json", quiet: true, dryRun: true });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).request.agent_config).toEqual(settings);
    const warnings = result.stderr
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line).warning);
    expect(warnings.map((warning) => warning.code)).toEqual([
      "KNOWLEDGE_SERVICE_RERANK_INSTRUCT_IGNORED",
      "KNOWLEDGE_SERVICE_UNKNOWN_CONFIG_FIELD",
    ]);
    expect(warnings[1].details).toEqual({ field: "future_config" });
    expect(requests).toEqual([]);
  },
);

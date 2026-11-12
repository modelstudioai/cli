import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { httpTransport } from "bailian-cli-core";
import type { CommandSchema } from "bailian-cli-runtime";
import { buildIsolatedCliEnv } from "e2e/isolation";
import { runCommandE2e, runCommandHelp, runCommandInProcess } from "./helpers.ts";
import { CONSOLE_READ_ROUTES } from "./topic-routes.ts";

// Offline only: real Console credentials and online acceptance are deliberately not used.
const offlineEnvironment: NodeJS.ProcessEnv = {
  DASHSCOPE_API_KEY: undefined,
  DASHSCOPE_ACCESS_TOKEN: undefined,
  DASHSCOPE_BASE_URL: undefined,
  BAILIAN_ACCESS_KEY_ID: undefined,
  BAILIAN_ACCESS_KEY_SECRET: undefined,
  BAILIAN_SECURITY_TOKEN: undefined,
  ALIBABA_CLOUD_ACCESS_KEY_ID: undefined,
  ALIBABA_CLOUD_ACCESS_KEY_SECRET: undefined,
  ALIBABA_CLOUD_SECURITY_TOKEN: undefined,
  BAILIAN_WORKSPACE_ID: undefined,
  DASHSCOPE_OUTPUT: undefined,
  DASHSCOPE_VERBOSE: "0",
  DASHSCOPE_QUIET: "0",
  HTTP_PROXY: undefined,
  HTTPS_PROXY: undefined,
  ALL_PROXY: undefined,
  NO_PROXY: undefined,
  http_proxy: undefined,
  https_proxy: undefined,
  all_proxy: undefined,
  no_proxy: undefined,
  NODE_USE_ENV_PROXY: "0",
  NODE_OPTIONS: undefined,
  NO_UPDATE_NOTIFIER: "1",
  DO_NOT_TRACK: "1",
  NO_COLOR: "1",
  FORCE_COLOR: undefined,
};
const datasetApi = "zeldaEasy.broadscope-platform.dataset.queryByDatasetId.m_efm";
const groupsApi = "zeldaEasy.broadscope-platform.datasetGroup.query.m_efm";
const versionsApi = "zeldaEasy.broadscope-platform.dataset.query.m_efm";
const fileApi = "zeldaEasy.bmp.ossRpcService.download";
const instancesApi =
  "zeldaEasy.broadscope-platform.modelInstance.listIndependentDeployedModel.m_efm";
const workspaceApi = "zeldaEasy.bailian-dash-workspace.space.listWorkspaces";
const leaves = [
  {
    path: "dataset version",
    flags: ["--dataset-group-id", "--dataset-id", "--include-status"],
    english: "List Console dataset versions by group or get one version by ID",
    chinese: "按组列出 Console 数据集版本，或按版本 ID 查询详情",
  },
  {
    path: "file url",
    flags: ["--file-key"],
    english: "Resolve a Console business file key",
    chinese: "Console 业务文件键解析为文件 URL",
  },
  {
    path: "deploy instances",
    flags: ["--page", "--page-size", "--keyword", "--model-service-id"],
    english: "List Console independent deployment services",
    chinese: "查询 Console 独立部署服务列表",
  },
  {
    path: "dataset groups",
    flags: ["--page", "--page-size", "--name"],
    english: "List Console dataset groups",
    chinese: "查询 Console 数据集组列表",
  },
];
const previews = [
  {
    name: "dataset metadata",
    args: ["dataset", "version", "--dataset-id", "fixture-version"],
    plan: {
      action: "dataset.version",
      api: datasetApi,
      data: { input: { datasetId: "fixture-version" } },
    },
  },
  {
    name: "dataset with status",
    args: ["dataset", "version", "--dataset-id", "fixture-version", "--include-status"],
    plan: {
      action: "dataset.version",
      api: datasetApi,
      data: { input: { datasetId: "fixture-version" } },
      status_query: {
        api: versionsApi,
        input: {
          datasetId: "fixture-version",
          page: 1,
          itemsPerPage: 1,
          datasetTaskTypeList: [0],
          datasetTaskPageSize: 1,
        },
        datasetGroupIdFrom: "dataset.datasetGroupId",
      },
    },
  },
  {
    name: "file URL",
    args: ["file", "url", "--file-key", "fixture folder/object.jsonl"],
    plan: {
      action: "file.url",
      api: fileApi,
      data: { fileKey: "fixture folder/object.jsonl" },
    },
  },
  {
    name: "deployment defaults",
    args: ["deploy", "instances"],
    plan: {
      action: "deploy.instances",
      api: instancesApi,
      data: { input: { page: 1, itemsPerPage: 10 } },
    },
  },
  {
    name: "deployment second page with intersecting filters",
    args: [
      "deploy",
      "instances",
      "--page",
      "2",
      "--page-size",
      "101",
      "--keyword",
      "fixture service",
      "--model-service-id",
      "fixture-service",
    ],
    plan: {
      action: "deploy.instances",
      api: instancesApi,
      data: {
        input: {
          page: 2,
          itemsPerPage: 101,
          searchNameKeyword: "fixture service",
          modelServiceId: "fixture-service",
        },
      },
    },
  },
  {
    name: "dataset groups without type filters",
    args: ["dataset", "groups"],
    plan: {
      action: "dataset.groups",
      api: groupsApi,
      data: {
        input: {
          datasetGroupPageNo: 1,
          datasetGroupPageSize: 10,
          datasetPageSize: 1,
          datasetTaskTypeList: [0],
          datasetTaskPageSize: 1,
        },
      },
    },
  },
  {
    name: "dataset groups second page with trimmed name",
    args: [
      "dataset",
      "groups",
      "--page",
      "2",
      "--page-size",
      "101",
      "--name",
      " \t Fixture group \t ",
    ],
    plan: {
      action: "dataset.groups",
      api: groupsApi,
      data: {
        input: {
          datasetGroupPageNo: 2,
          datasetGroupPageSize: 101,
          name: "Fixture group",
          datasetPageSize: 1,
          datasetTaskTypeList: [0],
          datasetTaskPageSize: 1,
        },
      },
    },
  },
  {
    name: "dataset version list by group without pagination",
    args: ["dataset", "version", "--dataset-group-id", "fixture-group"],
    plan: {
      action: "dataset.version",
      api: versionsApi,
      data: {
        input: {
          datasetGroupId: "fixture-group",
          datasetTaskTypeList: [0],
          datasetTaskPageSize: 1,
        },
      },
    },
  },
];
let isolated: ReturnType<typeof buildIsolatedCliEnv>;

beforeEach(() => {
  isolated = buildIsolatedCliEnv({ overrides: offlineEnvironment });
  writeFileSync(
    join(isolated.env.BAILIAN_CONFIG_DIR!, "config.json"),
    JSON.stringify({ language: "en-US", telemetry: false }),
  );
  // Guard the process-internal dry-run/validation paths against accidental HTTP.
  vi.spyOn(httpTransport, "fetch").mockRejectedValue(new Error("Unexpected Console HTTP"));
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected offline HTTP"));
});
afterEach(() => {
  try {
    expect(httpTransport.fetch).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  } finally {
    vi.restoreAllMocks();
    isolated.dispose();
  }
});

function offline(args: string[]) {
  // Preserve explicit undefined overrides when the runner rebuilds its isolated environment.
  return runCommandInProcess(CONSOLE_READ_ROUTES, args, { ...isolated.env, ...offlineEnvironment });
}

describe("e2e: Console read offline contracts", () => {
  test.each(previews)(
    "$name rejects an explicit blank workspace before auth or fallback",
    async (scenario) => {
      for (const workspaceId of ["", "  "]) {
        const result = await offline([
          ...scenario.args,
          "--workspace-id",
          workspaceId,
          "--console-switch-agent",
          "111",
          "--output",
          "json",
        ]);
        expect(result.exitCode).toBe(2);
        expect(JSON.parse(result.stderr).error.message).toContain("--workspace-id");
        expect(result.stdout).toBe("");
      }
    },
  );
  test.each(leaves)("$path leaf help exposes its Console scope in English", async (leaf) => {
    const result = await runCommandHelp(CONSOLE_READ_ROUTES, [...leaf.path.split(" "), "--help"]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(`bl ${leaf.path}`);
    expect(result.stderr).toContain(leaf.english);
    for (const flag of [
      ...leaf.flags,
      "--console-region",
      "--console-site",
      "--console-switch-agent",
      "--workspace-id",
    ])
      expect(result.stderr).toContain(flag);
  });

  test.each(leaves)("$path leaf help honors an isolated Chinese profile", async (leaf) => {
    writeFileSync(
      join(isolated.env.BAILIAN_CONFIG_DIR!, "config.json"),
      JSON.stringify({ language: "zh-CN", telemetry: false }),
    );
    const result = await offline([...leaf.path.split(" "), "--help"]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(leaf.chinese);
    for (const flag of [...leaf.flags, "--workspace-id"]) expect(result.stderr).toContain(flag);
  });

  test("dataset version introspection exposes optional IDs and bilingual cross-flag constraints", async () => {
    const result = await offline(["dataset", "version", "--introspect"]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stderr).toBe("");
    const schema = JSON.parse(result.stdout) as CommandSchema;
    expect(schema.scope).toEqual(["dataset", "version"]);
    expect(schema.commands).toHaveLength(1);
    const command = schema.commands[0]!;
    expect(command.path).toEqual(["dataset", "version"]);
    expect(command.auth).toBe("console");
    expect(command.description).toEqual({
      "en-US": "List Console dataset versions by group or get one version by ID",
      "zh-CN": "按组列出 Console 数据集版本，或按版本 ID 查询详情",
    });
    expect(command.usage).toBe(
      "bl dataset version (--dataset-group-id <id> | --dataset-id <id> [--include-status])",
    );
    expect(Object.keys(command.flags).sort()).toEqual([
      "--dataset-group-id",
      "--dataset-id",
      "--include-status",
    ]);
    for (const name of ["--dataset-group-id", "--dataset-id"]) {
      expect(command.flags[name]).toMatchObject({ type: "string", valueHint: "<id>" });
      expect(command.flags[name]).not.toHaveProperty("required", true);
    }
    expect(command.flags["--include-status"]).toMatchObject({ type: "switch" });
    expect(command.constraints).toEqual({ crossFlagValidation: "not-exported" });
    for (const language of ["en-US", "zh-CN"] as const) {
      const notes = command.notes.map((note) => (typeof note === "string" ? note : note[language]));
      expect(
        notes.some(
          (note) =>
            note.includes("--dataset-group-id") &&
            note.includes("--dataset-id") &&
            (language === "en-US"
              ? /exactly one|mutually exclusive|not both|either .* or /i.test(note)
              : /二选一|互斥|不能同时|只能.*(?:一个|一种)/.test(note)),
        ),
      ).toBe(true);
      expect(
        notes.some(
          (note) =>
            note.includes("--include-status") &&
            note.includes("--dataset-id") &&
            (language === "en-US" ? /only/i.test(note) : /仅|只/.test(note)),
        ),
      ).toBe(true);
      expect(notes.join("\n")).not.toContain("dataset versions --dataset-group-id");
    }
  });

  test.each([{ extraArgs: [] }, { extraArgs: ["--include-status"] }])(
    "dataset version requires at least one ID before authentication: $extraArgs",
    async ({ extraArgs }) => {
      const result = await offline([
        "dataset",
        "version",
        ...extraArgs,
        "--quiet",
        "--output",
        "json",
      ]);
      expect(result.exitCode, result.stderr).toBe(2);
      expect(result.stdout).toBe("");
      const error = JSON.parse(result.stderr).error;
      expect(error.message).toContain("--dataset-id");
      expect(error.message).toContain("--dataset-group-id");
    },
  );

  test("missing --file-key fails before authentication", async () => {
    const result = await offline(["file", "url", "--quiet", "--output", "json"]);
    expect(result.exitCode, result.stderr).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--file-key");
  });

  test.each([
    { path: ["dataset", "version"], flag: "--dataset-id" },
    { path: ["dataset", "version"], flag: "--dataset-group-id" },
    { path: ["file", "url"], flag: "--file-key" },
    { path: ["dataset", "groups"], flag: "--name" },
    { path: ["deploy", "instances"], flag: "--keyword" },
    { path: ["deploy", "instances"], flag: "--model-service-id" },
  ])("$flag rejects empty and whitespace values", async ({ path, flag }) => {
    for (const value of ["", " \t "]) {
      const result = await offline([...path, flag, value, "--dry-run", "--output", "json"]);
      expect(result.exitCode, result.stderr).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain(flag);
    }
  });

  test.each(
    ["fixture-version", "", " \t "].flatMap((datasetId) =>
      ["fixture-group", "", " \t "].map((datasetGroupId) => ({ datasetId, datasetGroupId })),
    ),
  )("dataset version rejects both supplied IDs, including blanks: %j", async (ids) => {
    for (const dryRun of [false, true]) {
      const result = await offline([
        "dataset",
        "version",
        "--dataset-id",
        ids.datasetId,
        "--dataset-group-id",
        ids.datasetGroupId,
        "--workspace-id",
        "fixture-workspace",
        ...(dryRun ? ["--dry-run"] : []),
        "--output",
        "json",
      ]);
      expect(result.exitCode, result.stderr).toBe(2);
      expect(result.stdout).toBe("");
      expect(JSON.parse(result.stderr).error.message).toMatch(/--dataset-(?:group-)?id/);
      expect(httpTransport.fetch).not.toHaveBeenCalled();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    }
  });

  test.each([false, true])(
    "dataset version rejects group-only --include-status before any request (dry-run=%s)",
    async (dryRun) => {
      const result = await offline([
        "dataset",
        "version",
        "--dataset-group-id",
        "fixture-group",
        "--include-status",
        "--workspace-id",
        "fixture-workspace",
        ...(dryRun ? ["--dry-run"] : []),
        "--output",
        "json",
      ]);
      expect(result.exitCode, result.stderr).toBe(2);
      expect(result.stdout).toBe("");
      const error = JSON.parse(result.stderr).error;
      expect(error.message).toContain("--include-status");
      expect(error.message).toContain("--dataset-id");
      expect(httpTransport.fetch).not.toHaveBeenCalled();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    },
  );

  test.each([
    { extraArgs: [] },
    { extraArgs: ["--dataset-group-id", "fixture-group"] },
    { extraArgs: ["--introspect"] },
    { extraArgs: ["--help"] },
  ])("removed dataset versions path is not an alias: $extraArgs", async ({ extraArgs }) => {
    // Intentionally absent from the route map: exercise CLI rejection, not the help-only runner.
    expect(CONSOLE_READ_ROUTES).not.toHaveProperty("dataset versions");
    expect(Object.values(CONSOLE_READ_ROUTES)).not.toContain("datasetVersions");
    const result = await offline(["dataset", "versions", ...extraArgs, "--output", "json"]);
    expect(result.exitCode, result.stderr).toBe(2);
    expect(result.stdout).toBe("");
    const error = JSON.parse(result.stderr).error;
    expect(error.message).toMatch(/Unknown command/i);
    expect(error.message).toContain("dataset versions");
  });

  test.each([
    "https://files.example.invalid/already-signed?Signature=fixture-signature",
    "http://files.example.invalid/object",
    "oss://fixture-bucket/object.jsonl",
    "  HTTPS://files.example.invalid/object  ",
    "  OSS://fixture-bucket/object  ",
  ])("file-key rejects existing URL/URI: %s", async (fileKey) => {
    const result = await offline(["file", "url", "--file-key", fileKey, "--dry-run"]);
    expect(result.exitCode, result.stderr).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("--file-key");
    expect(result.stderr).not.toContain("fixture-signature");
  });

  for (const command of [
    { path: ["deploy", "instances"], pageField: "page", pageSizeField: "itemsPerPage" },
    {
      path: ["dataset", "groups"],
      pageField: "datasetGroupPageNo",
      pageSizeField: "datasetGroupPageSize",
    },
  ]) {
    for (const flag of ["--page", "--page-size"]) {
      test.each(["0", "-1", "1.5", "9007199254740992", "NaN", "Infinity"])(
        `${command.path.join(" ")} ${flag} rejects non-positive/non-safe-integer %s`,
        async (value) => {
          const result = await offline([...command.path, flag, value, "--dry-run"]);
          expect(result.exitCode, result.stderr).toBe(2);
          expect(result.stdout).toBe("");
          expect(result.stderr).toContain(flag);
        },
      );
    }

    test(`${command.path.join(" ")} pagination accepts the positive safe-integer boundary without an invented max100`, async () => {
      const result = await offline([
        ...command.path,
        "--page",
        String(Number.MAX_SAFE_INTEGER),
        "--page-size",
        String(Number.MAX_SAFE_INTEGER),
        "--dry-run",
        "--output",
        "json",
      ]);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        data: {
          input: {
            [command.pageField]: Number.MAX_SAFE_INTEGER,
            [command.pageSizeField]: Number.MAX_SAFE_INTEGER,
          },
        },
      });
    });
  }

  test.each(["--page", "--page-size", "--list"])(
    "dataset version group query rejects unsupported %s before auth or HTTP",
    async (flag) => {
      const result = await offline([
        "dataset",
        "version",
        "--dataset-group-id",
        "fixture-group",
        flag,
        ...(flag === "--list" ? [] : ["1"]),
        "--dry-run",
        "--output",
        "json",
      ]);
      expect(result.exitCode, result.stderr).toBe(2);
      expect(result.stdout).toBe("");
      expect(JSON.parse(result.stderr).error.message).toContain(flag);
    },
  );

  test.each([
    { flag: "--dataset-id", field: "datasetId", api: datasetApi },
    { flag: "--dataset-group-id", field: "datasetGroupId", api: versionsApi },
  ])(
    "dataset version dispatches only by $flag, never by ID shape",
    async ({ flag, field, api }) => {
      for (const identifier of ["file-fixture", "000123"]) {
        const result = await offline([
          "dataset",
          "version",
          flag,
          identifier,
          "--dry-run",
          "--output",
          "json",
        ]);
        expect(result.exitCode, result.stderr).toBe(0);
        expect(result.stderr).toBe("");
        expect(JSON.parse(result.stdout)).toEqual({
          action: "dataset.version",
          api,
          data: {
            input: {
              [field]: identifier,
              ...(field === "datasetGroupId"
                ? { datasetTaskTypeList: [0], datasetTaskPageSize: 1 }
                : {}),
            },
          },
          consoleRegion: "cn-beijing",
          consoleSite: "domestic",
        });
      }
    },
  );

  for (const scoped of [false, true]) {
    test.each(previews)(
      `$name static preview without credentials (workspace=${scoped})`,
      async (scenario) => {
        const result = await offline([
          ...scenario.args,
          "--dry-run",
          "--output",
          "json",
          "--console-region",
          "ap-southeast-1",
          "--console-site",
          "international",
          "--console-switch-agent",
          "111",
          ...(scoped ? ["--workspace-id", "fixture-workspace"] : []),
        ]);
        expect(result.exitCode, result.stderr).toBe(0);
        expect(result.stderr).toBe("");
        expect(JSON.parse(result.stdout)).toEqual({
          ...scenario.plan,
          consoleRegion: "ap-southeast-1",
          consoleSite: "international",
          ...(scoped
            ? {
                workspaceIdentity: {
                  api: workspaceApi,
                  workspaceId: "fixture-workspace",
                  switchAgentFrom: "tenantId",
                },
              }
            : { consoleSwitchAgent: 111 }),
        });
      },
    );
  }

  test.each(previews)("$name defaults to a complete JSON preview", async (scenario) => {
    const result = await offline([...scenario.args, "--dry-run"]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      ...scenario.plan,
      consoleRegion: "cn-beijing",
      consoleSite: "domestic",
    });
  });

  test("one subprocess preserves argv with spaces, stdout/stderr and process exit", async () => {
    // The only child: verifies the real process/stdio boundary; all matrices stay in-worker.
    const args = [
      "file",
      "url",
      "--file-key",
      "fixture folder/object.jsonl",
      "--dry-run",
      "--output",
      "json",
      "--workspace-id",
      "fixture-workspace",
      "--console-switch-agent",
      "111",
    ];
    const expected = await offline(args);
    expect(expected.exitCode, expected.stderr).toBe(0);
    const child = await runCommandE2e(CONSOLE_READ_ROUTES, args, {
      ...isolated.env,
      ...offlineEnvironment,
    });
    expect(child).toEqual(expected);
    expect(child.stderr).toBe("");
    expect(JSON.parse(child.stdout)).toMatchObject({
      data: { fileKey: "fixture folder/object.jsonl" },
      workspaceIdentity: { workspaceId: "fixture-workspace", switchAgentFrom: "tenantId" },
    });
  });
});

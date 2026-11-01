import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import {
  buildSettings,
  Client,
  httpTransport,
  makeAuthStore,
  makeConfigStore,
  writeConfigFile,
  writeSkillLock,
  type SkillIndexEntry,
  type AnyCommand,
  type LocalizedText,
} from "bailian-cli-core";
import { createOutputReporter } from "bailian-cli-runtime";
import { enterIsolatedHome } from "e2e/isolation";
import authLogin from "../../src/commands/auth/login.ts";
import authLogout from "../../src/commands/auth/logout.ts";
import authStatus from "../../src/commands/auth/status.ts";
import authToken from "../../src/commands/auth/generate-access-token.ts";
import configList from "../../src/commands/config/list.ts";
import configShow from "../../src/commands/config/show.ts";
import configSet from "../../src/commands/config/set.ts";
import configUse from "../../src/commands/config/use.ts";
import configAgent from "../../src/commands/config/agent/index.ts";
import configUi from "../../src/commands/config/ui.ts";
import skillList from "../../src/commands/skill/list.ts";
import skillAdd from "../../src/commands/skill/add.ts";
import skillRemove from "../../src/commands/skill/remove.ts";
import skillUpdate from "../../src/commands/skill/update.ts";
import skillInit from "../../src/commands/skill/init.ts";
import mcpList from "../../src/commands/mcp/list.ts";
import mcpTools from "../../src/commands/mcp/tools.ts";
import mcpCall from "../../src/commands/mcp/call.ts";
import mcpConnect from "../../src/commands/mcp/connect.ts";
import mcpDisconnect from "../../src/commands/mcp/disconnect.ts";
import update from "../../src/commands/update.ts";

const identity = { binName: "bl", version: "test", clientName: "fixture", npmPackage: "fixture" };
let registrySkills: Record<string, SkillIndexEntry> = {};
const retained = { future: { values: [false, 0, null, []] } };
beforeEach(() => {
  vi.stubEnv("NO_COLOR", "1");
  vi.stubEnv("BAILIAN_INSTALL_METHOD", "brew");
  vi.spyOn(httpTransport, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith("/index.json")) return Response.json({ version: 1, skills: registrySkills });
    if (new URL(url).pathname.endsWith("/models")) return Response.json({ data: [] });
    if (new Headers(init?.headers).get("x-acs-action") === "GenerateCLIAccessToken")
      return Response.json({ cliAccessToken: "fixture-generated-token", ...retained });
    throw new Error(`Unexpected fake HTTP request ${url}`);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

interface Scenario {
  name: string;
  command: AnyCommand;
  flags: Record<string, unknown>;
  dryRun?: boolean;
  seedSkill?: boolean;
  registry?: Record<string, SkillIndexEntry>;
}
const scenarios: Scenario[] = [
  {
    name: "skill list installed",
    command: skillList,
    flags: {},
    seedSkill: true,
    registry: {
      "bailian-fixture": {
        contentHash: "fixture",
        description: "Fixture skill",
        publishedAt: "2026-01-02T00:00:00Z",
      },
    },
  },
  {
    name: "skill update up-to-date",
    command: skillUpdate,
    flags: {},
    seedSkill: true,
    registry: { "bailian-fixture": { contentHash: "fixture" } },
  },
  { name: "skill update delisted", command: skillUpdate, flags: {}, seedSkill: true },
  { name: "skill remove installed", command: skillRemove, flags: { name: "all" }, seedSkill: true },
  {
    name: "skill remove preview",
    command: skillRemove,
    flags: { name: "all" },
    seedSkill: true,
    dryRun: true,
  },
  {
    name: "skill add preview",
    command: skillAdd,
    flags: { all: true },
    registry: { "bailian-fixture": {} },
    dryRun: true,
  },
  {
    name: "skill init preview",
    command: skillInit,
    flags: {},
    registry: { "bailian-fixture": {} },
    dryRun: true,
  },
  {
    name: "auth login API key",
    command: authLogin,
    flags: { apiKey: "sk-fixture", baseUrl: "https://fixture.invalid" },
  },
  { name: "auth login preview", command: authLogin, flags: { apiKey: "sk-fixture" }, dryRun: true },
  { name: "auth console preview", command: authLogin, flags: { console: true }, dryRun: true },
  { name: "auth OpenAPI preview", command: authLogin, flags: { openApi: true }, dryRun: true },
  { name: "auth logout", command: authLogout, flags: {} },
  { name: "auth logout console", command: authLogout, flags: { console: true } },
  { name: "auth logout OpenAPI", command: authLogout, flags: { openApi: true } },
  { name: "auth logout preview", command: authLogout, flags: {}, dryRun: true },
  { name: "auth status", command: authStatus, flags: {} },
  {
    name: "auth token",
    command: authToken,
    flags: { accessKeyId: "fixture-ak", accessKeySecret: "fixture-secret" },
  },
  { name: "config list", command: configList, flags: {} },
  { name: "config show", command: configShow, flags: {} },
  { name: "config set", command: configSet, flags: { key: "watermark", value: "false" } },
  { name: "config use", command: configUse, flags: { name: "default" } },
  {
    name: "config agent",
    command: configAgent,
    flags: {
      agent: "qwen-code",
      model: "qwen-fixture",
      apiKey: "sk-fixture",
      baseUrl: "https://fixture.invalid/compatible-mode/v1",
    },
  },
  { name: "config UI preview", command: configUi, flags: {}, dryRun: true },
  { name: "skill list empty", command: skillList, flags: {} },
  { name: "skill add empty", command: skillAdd, flags: { all: true } },
  { name: "skill remove empty", command: skillRemove, flags: { name: "all" } },
  { name: "skill update empty", command: skillUpdate, flags: {} },
  { name: "skill init empty", command: skillInit, flags: {} },
  { name: "MCP list", command: mcpList, flags: {} },
  { name: "MCP tools", command: mcpTools, flags: { server: "fixture" } },
  { name: "MCP call", command: mcpCall, flags: { target: "fixture.tool", json: '{"keep":false}' } },
  {
    name: "MCP connect preview",
    command: mcpConnect,
    flags: { server: "fixture", transport: "streamable-http", agent: "cursor" },
    dryRun: true,
  },
  { name: "MCP disconnect", command: mcpDisconnect, flags: { server: "fixture", agent: "cursor" } },
  { name: "update package manager", command: update, flags: {} },
];
async function invoke(
  scenario: Scenario,
  format: "json" | "text",
  quiet: boolean,
  verbose = false,
) {
  const isolation = enterIsolatedHome();
  try {
    registrySkills = scenario.registry ?? {};
    await writeConfigFile({ language: "en-US", watermark: true });
    if (scenario.seedSkill) {
      const directory = join(isolation.configDir, "skills", "bailian-fixture");
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        join(directory, "SKILL.md"),
        "---\nname: bailian-fixture\ndescription: Fixture skill\n---\n",
      );
      writeSkillLock({
        version: 1,
        skills: {
          "bailian-fixture": {
            installedAt: "2026-01-01",
            sourceType: "oss",
            contentHash: "fixture",
            links: [],
          },
        },
      });
    }
    let stdout = "",
      stderr = "",
      stray = "";
    const outSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      stray += String(chunk);
      return true;
    });
    const errSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      stray += String(chunk);
      return true;
    });
    const settings = buildSettings({
      flags: { output: format, quiet, verbose, dryRun: scenario.dryRun },
      file: { console_region: "cn-beijing", console_site: "domestic" },
      env: {},
    });
    const localize = (message: LocalizedText) =>
      typeof message === "string" ? message : message["en-US"];
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
    const finalResult = vi.spyOn(reporter.output, "result");
    const client = new Client({
      identity,
      settings,
      baseUrl: "https://fixture.invalid",
      apiCred: { source: "flag", token: "sk-fixture", baseUrl: "https://fixture.invalid" },
    });
    vi.spyOn(client, "console").mockResolvedValue({
      data: { DataV2: { data: { data: { total: 0, mcpServerDetailList: [] } } } },
    });
    const closed = vi.fn();
    vi.spyOn(client, "connectBailianMcp").mockResolvedValue({
      url: "https://fixture.invalid/mcp",
      client: {
        listTools: async () => [],
        callTool: async () => ({ content: [], ...retained }),
        close: closed,
      },
    } as never);
    let error: unknown;
    try {
      await scenario.command.run({
        identity,
        settings,
        flags: scenario.flags,
        client,
        localize,
        output: reporter.output,
        configStore: makeConfigStore(),
        authStore: makeAuthStore({ flags: {}, file: {}, env: {} }),
      } as never);
    } catch (caught) {
      error = caught;
    }
    outSpy.mockRestore();
    errSpy.mockRestore();
    return {
      home: isolation.home,
      stdout,
      stderr,
      stray,
      error,
      count: finalResult.mock.calls.length,
      data: finalResult.mock.calls[0]?.[0],
      closed: closed.mock.calls.length,
    };
  } finally {
    isolation.restore();
  }
}
for (const scenario of scenarios) {
  test(`${scenario.name}: one scoped result and quiet parity`, async () => {
    const normal = await invoke(scenario, "json", false);
    const quiet = await invoke(scenario, "json", true);
    for (const result of [normal, quiet]) {
      expect(result.error).toBeUndefined();
      expect(result.stray).toBe("");
      expect(result.count).toBe(1);
      expect(JSON.parse(result.stdout)).toEqual(result.data);
      expect(result.stdout).not.toContain("sk-fixture");
    }
    const text = await invoke(scenario, "text", false);
    const quietText = await invoke(scenario, "text", true);
    for (const result of [text, quietText]) {
      expect(result.error).toBeUndefined();
      expect(result.stray).toBe("");
      expect(result.count).toBe(1);
    }
    expect(quietText.stdout.replaceAll(quietText.home, "<HOME>")).toBe(
      text.stdout.replaceAll(text.home, "<HOME>"),
    );
    expect(quietText.stderr).toBe("");
    // HOME-dependent config paths differ; field schemas and primary values remain equal.
    expect(Object.keys(JSON.parse(normal.stdout))).toEqual(Object.keys(JSON.parse(quiet.stdout)));
    if (scenario.name === "MCP tools" || scenario.name === "MCP call") expect(quiet.closed).toBe(1);
  });
}
test("interactive browser commands reject JSON before opening a browser or server", async () => {
  for (const command of [configUi, authLogin]) {
    const result = await invoke(
      { name: "interactive", command, flags: command === authLogin ? { console: true } : {} },
      "json",
      true,
    );
    expect(result.error).toMatchObject({ exitCode: 2 });
    expect(result.stdout + result.stray).toBe("");
  }
});

test("skill partial failure retains the business report before throwing", async () => {
  const result = await invoke(
    {
      name: "failure",
      command: skillAdd,
      flags: { all: true },
      registry: { "bailian-fixture": { compression: "zip" } },
    },
    "json",
    true,
  );
  expect(result.error).toMatchObject({ exitCode: 1 });
  expect(result.stray).toBe("");
  expect(result.count).toBe(1);
  expect(JSON.parse(result.stdout)).toMatchObject({
    skills: [
      {
        name: "bailian-fixture",
        status: "failed",
        reason: expect.stringContaining("unsupported compression"),
      },
    ],
  });
});
test("skill default format is an ordinary metadata fallback", () => {
  for (const command of [skillList, skillAdd, skillRemove, skillUpdate, skillInit]) {
    expect(command.defaultOutput).toBe("json");
    expect(command.defaultOutputOverridesProfile).not.toBe(true);
  }
});

test("agent writer warnings remain visible in quiet JSON without credentials", async () => {
  const result = await invoke(
    {
      name: "legacy Codex",
      command: configAgent,
      flags: {
        agent: "codex",
        model: "fixture",
        apiKey: "sk-fixture",
        baseUrl: "https://fixture.invalid",
        wireApi: "chat",
      },
    },
    "json",
    true,
  );
  expect(result.error).toBeUndefined();
  expect(result.stray).toBe("");
  expect(result.count).toBe(1);
  expect(JSON.parse(result.stderr)).toMatchObject({ warning: { code: "AGENT_CONFIG_WARNING" } });
  expect(result.stdout + result.stderr).not.toContain("sk-fixture");
});

test("quiet plus verbose retains safe API-key validation diagnostics", async () => {
  const scenario = scenarios.find((candidate) => candidate.name === "auth login API key")!;
  const result = await invoke(scenario, "json", true, true);
  expect(result.error).toBeUndefined();
  expect(result.stray).toBe("");
  expect(result.count).toBe(1);
  const records = result.stderr
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(records.length).toBeGreaterThan(0);
  expect(records.every((record) => record.debug)).toBe(true);
  expect(result.stderr).not.toContain("sk-fixture");
});

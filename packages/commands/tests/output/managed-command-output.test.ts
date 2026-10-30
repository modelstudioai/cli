import { mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import {
  buildSettings,
  Client,
  httpTransport,
  type AnyCommand,
  type FlagsDef,
  type LocalizedText,
} from "bailian-cli-core";
import {
  AGENTS_PROVIDER_FIELDS,
  LocalFileStateBackend,
  planProjectWithStateBackend,
  resolveProjectConfig,
  StateManager,
} from "@openagentpack/sdk";
import { createOutputReporter } from "bailian-cli-runtime";
import { buildIsolatedCliEnv, enterIsolatedHome } from "e2e/isolation";
import { runInProcess } from "e2e/in-process";
import {
  commitProjectBuild,
  createDirectoryWorkspaceVersionService,
  initializeDirectoryProject,
  previewProjectBuild,
} from "@openagentpack/sdk/project-workspace";
import mapping from "./fixtures/managed-command-map.json" with { type: "json" };
import baseline from "./fixtures/managed-command-baseline.json" with { type: "json" };
const root = fileURLToPath(new URL("../../../../", import.meta.url));
interface CapturedOutput {
  stdout: string;
  stderr: string;
  strayOut: string;
  strayErr: string;
  fixtureVersionId: string;
  calls: unknown[];
}
const expected = baseline as Record<string, { json: CapturedOutput; text: CapturedOutput }>;
const identity = {
  binName: "bl",
  version: "fixture-version",
  clientName: "managed-fixture",
  npmPackage: "fixture",
};
const retained = { future: { values: [false, 0, null, []] } };
const item = {
  id: "fixture-id",
  name: "Fixture",
  display_name: "Fixture",
  description: "Fixture resource",
  version: 1,
  type: "custom",
  source: "custom",
  status: "completed",
  agent: { id: "fixture-agent" },
  agent_id: "fixture-agent",
  environment_id: "fixture-env",
  deployment_id: "fixture-deployment",
  session_id: "fixture-session",
  vault_ids: [],
  memory_store_ids: [],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  filename: "fixture.txt",
  mime_type: "text/plain",
  size_bytes: 4,
  latest_version: "1",
  secret: "fixture-one-time-secret",
  signing_secret: "fixture-signing-secret",
  ...retained,
};
const event = {
  id: "event-fixture",
  type: "status",
  status: "completed",
  created_at: "2026-01-01T00:00:00Z",
};
beforeEach(() => {
  for (const key of [
    ...Object.values(AGENTS_PROVIDER_FIELDS).flatMap((fields) => fields.map((field) => field.key)),
    "BAILIAN_API_KEY",
    "CLAUDE_API_KEY",
    "QODER_API_KEY",
    "DASHSCOPE_BASE_URL",
  ])
    vi.stubEnv(key, undefined);
  vi.stubEnv("DASHSCOPE_API_KEY", "fixture-api-key");
  vi.stubEnv("BAILIAN_BASE_URL", "https://managed.fixture.invalid/api/v1/agentstudio");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
function scrub(value: string, directory: string) {
  return value
    .replaceAll(directory, "<ROOT>")
    .replaceAll(/\b20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z\b/g, "<TIMESTAMP>");
}
async function invoke(
  entry: (typeof mapping)[number],
  display: { format: "json" | "text"; quiet: boolean; verbose: boolean },
  options: {
    dryRun?: boolean;
    fail?: boolean;
    existingOutput?: boolean;
    interruptStream?: boolean;
    flags?: Record<string, unknown>;
  } = {},
) {
  const isolation = enterIsolatedHome();
  const directory = join(isolation.home, "owned-project");
  await mkdir(directory, { recursive: true });
  const configPath = join(directory, "agents.yaml");
  await writeFile(
    configPath,
    `version: "1"
name: fixture
providers:
  bailian:
    api_key: \${DASHSCOPE_API_KEY}
    base_url: https://managed.fixture.invalid/api/v1/agentstudio
defaults:
  provider: bailian
environments:
  dev:
    config:
      type: cloud
      networking:
        type: unrestricted
vaults:
  secrets:
    display_name: Fixture
    credentials: []
agents:
  assistant:
    model: qwen-fixture
    instructions: Fixture instruction
    environment: dev
`,
  );
  const skillDirectory = join(directory, "fixture-skill");
  await mkdir(skillDirectory);
  await writeFile(
    join(skillDirectory, "SKILL.md"),
    "---\nname: fixture-skill\ndescription: Fixture skill\n---\n# Fixture",
  );
  await writeFile(join(directory, "content.txt"), "fixture");
  const projectDirectory = join(directory, "directory-project");
  await initializeDirectoryProject({ projectRoot: projectDirectory });
  const buildPreview = await previewProjectBuild(projectDirectory);
  await commitProjectBuild({
    projectRoot: projectDirectory,
    baseRevision: buildPreview.project_revision,
  });
  const state = StateManager.initialize(join(directory, "agents.state.json"));
  state.setResource({
    address: { provider: "bailian", type: "agent", name: "assistant" },
    remote_id: "fixture-agent",
    content_hash: "fixture-hash",
  });
  if (options.dryRun === false && entry.name === "managedAgentSessionRun")
    state.setResource({
      address: { provider: "bailian", type: "environment", name: "dev" },
      remote_id: "fixture-env",
      content_hash: "fixture-hash",
    });
  await state.save();
  const versions = createDirectoryWorkspaceVersionService(projectDirectory);
  await versions.enable("fixture version");
  const history = await versions.listVersions();
  const versionId = history.versions?.[0]?.version_id ?? "0".repeat(64);
  const command: AnyCommand = (
    await import(`${root}/packages/commands/src/commands/managed-agent/${entry.module}`)
  )[entry.exported];
  if (entry.name === "managedAgentVaultCredentialCreate") {
    const loaded = await resolveProjectConfig(configPath, {
      environment: { DASHSCOPE_API_KEY: "fixture-api-key" },
    });
    const backend = new LocalFileStateBackend({ configPath });
    const scope = { projectId: loaded.projectName ?? "owned-project" };
    const planned = await planProjectWithStateBackend(
      {
        projectName: loaded.projectName,
        config: loaded.config,
        configPath,
        providers: loaded.config.providers,
        stateBackend: backend,
        stateScope: scope,
      },
      { provider: "bailian", refresh: false, quiet: true },
    );
    const action = planned.plan.actions.find((action) => action.address.type === "vault");
    const after = action?.after as { content_hash?: string } | undefined;
    const contentHash = after?.content_hash;
    if (!contentHash) throw new Error("Fixture vault plan is missing its content hash.");
    await backend.write(scope, (current) => {
      current.setResource({
        address: { provider: "bailian", type: "vault", name: "secrets" },
        remote_id: "fixture-vault",
        content_hash: contentHash,
      });
    });
  }
  const values: Record<string, unknown> = {
    file: configPath,
    name: "Fixture",
    model: "qwen-fixture",
    instructions: "Fixture instruction",
    agent: "assistant",
    agentId: "fixture-agent",
    environmentId: "fixture-env",
    deploymentId: "fixture-deployment",
    runId: "fixture-run",
    vaultId: "fixture-vault",
    skillId: "fixture-skill",
    skillVersion: "1",
    sessionId: "fixture-session",
    storeId: "fixture-store",
    memoryId: "fixture-memory",
    versionId,
    webhookId: "fixture-webhook",
    query: "fixture",
    prompt: "Fixture prompt",
    message: "Fixture message",
    title: "Fixture title",
    metadata: '{"owner":"fixture"}',
    content: "Fixture content",
    path: join(directory, "content.txt"),
    source: skillDirectory,
    outputFile: join(directory, "result.bin"),
    project: projectDirectory,
    address: "bailian.agent.assistant",
    remoteId: "fixture-agent",
    vault: "secrets",
    secretName: "FIXTURE_SECRET",
    secretEnv: "FIXTURE_SECRET",
    event: ['{"type":"message","content":[{"type":"text","text":"fixture"}]}'],
    url: "https://receiver.fixture.invalid",
    noRefresh: true,
    noStream: true,
    noOpen: true,
    force: true,
    limit: 2,
    pageLimit: 1,
  };
  if (entry.name.includes("Skill") && entry.name !== "managedAgentSkillCreate")
    values.source = "custom";
  if (entry.name.includes("Memory")) values.path = "notes.md";
  if (entry.name.includes("MemoryVersion")) values.versionId = "fixture-memory-version";
  if (entry.name === "managedAgentDeploymentCreate")
    values.event = ['{"type":"system.message","content":"Fixture"}'];
  if (entry.name.includes("Webhook")) values.event = ["session.updated"];
  const flags = Object.fromEntries(
    Object.entries((command.flags ?? {}) as FlagsDef)
      .filter(([key]) => values[key] !== undefined)
      .map(([key, definition]) => {
        let value = values[key];
        if (definition.type === "array" && !Array.isArray(value))
          value = key === "metadata" ? ["owner=fixture"] : [value];
        if (definition.type === "string" && Array.isArray(value))
          value = JSON.stringify(
            value.map((item) =>
              typeof item === "string" && item.startsWith("{") ? JSON.parse(item) : item,
            ),
          );
        return [key, value];
      }),
  );
  // Avoid optional selectors that conflict with required resource IDs.
  if (flags.deploymentId) delete flags.deployment;
  if (entry.name === "managedAgentInit") flags.file = join(directory, "new-agents.yaml");
  if (entry.name === "managedAgentProjectInit") flags.project = join(directory, "new-directory");
  const defaultDryRun =
    !entry.name.includes("Webhook") &&
    !entry.name.includes("MemoryVersion") &&
    !entry.name.match(/Memory(StoreGet|StoreList|List|Get)$/);
  const dryRun = options.dryRun ?? defaultDryRun;
  Object.assign(flags, options.flags);
  if (options.existingOutput) await writeFile(join(directory, "result.bin"), "keep existing");
  const envHandle = buildIsolatedCliEnv({
    overrides: {
      HOME: isolation.home,
      BAILIAN_CONFIG_DIR: isolation.configDir,
      DASHSCOPE_API_KEY: "fixture-api-key",
      BAILIAN_BASE_URL: "https://managed.fixture.invalid/api/v1/agentstudio",
      FIXTURE_SECRET: "fixture-secret-value",
      BAILIAN_INSTALL_METHOD: "brew",
      DO_NOT_TRACK: "1",
    },
  });
  const calls: unknown[] = [];
  const fetchSpy = vi.spyOn(httpTransport, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    const method = init?.method ?? "GET";
    calls.push({
      path: url.pathname,
      query: url.search,
      method,
      body: typeof init?.body === "string" ? init.body : null,
    });
    if (options.fail)
      return Response.json(
        {
          code: "Original.ServiceFailure",
          message: "Original service failure",
          request_id: "fixture-error-request",
        },
        { status: 503 },
      );
    const sessionRun = options.dryRun === false && entry.name === "managedAgentSessionRun";
    const sessionEvents = sessionRun
      ? [
          {
            id: "fixture-assistant-event",
            type: "message",
            role: "assistant",
            content: [{ type: "text", text: "Fixture final answer" }],
          },
          {
            id: "fixture-status-event",
            type: "session_status",
            content: [{ type: "data", data: { session_status: "completed" } }],
          },
        ]
      : [event];
    if (url.pathname.endsWith("/events/stream")) {
      if (options.interruptStream)
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error("fixture iterator interrupted"));
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        );
      return new Response(
        sessionEvents.map((entry) => `data: ${JSON.stringify(entry)}\n\n`).join(""),
        { headers: { "content-type": "text/event-stream" } },
      );
    }
    if (sessionRun && method === "POST" && url.pathname.endsWith("/events"))
      return Response.json({ id: "fixture-user-event" });
    if (url.pathname.includes("/events") && !url.pathname.includes("webhook"))
      return Response.json({
        data: sessionEvents,
        has_more: false,
        next_page: null,
        event_ids: ["event-fixture"],
      });
    if (url.pathname.includes("/skills/") && url.pathname.endsWith("/content"))
      return Response.json({ file_url: "https://managed.fixture.invalid/asset.zip" });
    if (
      url.pathname === "/asset.zip" ||
      url.pathname.endsWith("/download") ||
      url.pathname.endsWith("/content")
    )
      return new Response("fixture-bytes");
    const basename = url.pathname.split("/").at(-1) ?? "";
    if (
      method === "GET" &&
      [
        "agents",
        "environments",
        "skills",
        "vaults",
        "deployments",
        "runs",
        "files",
        "sessions",
        "versions",
        "webhook_endpoints",
        "memories",
        "memory_stores",
      ].includes(basename)
    )
      return Response.json({
        data: [item],
        has_more: false,
        next_page: null,
        request_id: "fixture-request",
        ...retained,
      });
    return Response.json(item);
  });
  let stdout = "",
    stderr = "",
    strayOut = "",
    strayErr = "",
    resultCount = 0,
    exitCode = 0;
  try {
    const capturedRun = await runInProcess(
      async () => {
        const settings = buildSettings({
          flags: { output: display.format, quiet: display.quiet, verbose: display.verbose, dryRun },
          file: {},
          env: {},
        });
        const localize = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]);
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
        const resultSpy = vi.spyOn(reporter.output, "result");
        const client = new Client({
          identity,
          settings,
          baseUrl: "https://managed.fixture.invalid/api/v1/agentstudio",
          apiCred: {
            token: "fixture-api-key",
            source: "flag",
            baseUrl: "https://managed.fixture.invalid/api/v1/agentstudio",
          },
          debug: (record) => reporter.output.debug(record),
        });
        try {
          await command.run({
            identity,
            settings,
            flags,
            client,
            output: reporter.output,
            localize,
          } as never);
        } catch (error) {
          exitCode = reporter.error(error);
        }
        resultCount = resultSpy.mock.calls.length;
      },
      [],
      { cwd: directory, env: envHandle.env },
    );
    strayOut = capturedRun.stdout;
    strayErr = capturedRun.stderr;
    const outputBytes = await readFile(join(directory, "result.bin")).catch(() => undefined);
    const outputNames = await readdir(directory);
    return {
      outputBytes: outputBytes?.toString("base64"),
      outputNames,
      fixtureVersionId: versionId,
      stdout: scrub(stdout, directory),
      stderr: scrub(stderr, directory),
      strayOut: scrub(strayOut, directory),
      strayErr: scrub(strayErr, directory),
      exitCode,
      resultCount,
      calls,
    };
  } finally {
    fetchSpy.mockRestore();
    envHandle.dispose();
    isolation.restore();
  }
}
for (const entry of mapping) {
  test(`${entry.name} scoped output and display parity`, async () => {
    for (const format of ["json", "text"] as const)
      for (const quiet of [false, true])
        for (const verbose of [false, true]) {
          const result = await invoke(entry, { format, quiet, verbose });
          expect(result.exitCode, result.stderr + result.strayErr).toBe(0);
          const nativeStream = entry.name === "managedAgentSessionEventStream" && format === "text";
          expect((nativeStream ? "" : result.strayOut) + result.strayErr).toBe("");
          expect(result.resultCount).toBe(1);
          const baseline = expected[entry.name]?.[format];
          expect(baseline).toBeDefined();
          const canonical = (value: string, version: string) =>
            value
              .replaceAll(version, "<VERSION_ID>")
              .replaceAll(version.slice(0, 12), "<SHORT_VERSION>");
          if (format === "json")
            expect(JSON.parse(canonical(result.stdout, result.fixtureVersionId))).toEqual(
              JSON.parse(canonical(baseline.stdout + baseline.strayOut, baseline.fixtureVersionId)),
            );
          else if (nativeStream) {
            expect(result.strayOut).toBe(baseline.strayOut);
            expect(result.stdout).toBe("\n");
          } else
            expect(canonical(result.stdout, result.fixtureVersionId)).toBe(
              canonical(baseline.stdout + baseline.strayOut, baseline.fixtureVersionId),
            );
          expect(result.calls).toEqual(baseline.calls);
          expect(result.stderr).not.toContain("fixture-api-key");
          expect(result.stderr).not.toContain("fixture-secret-value");
          if (
            entry.name === "managedAgentWebhookCreate" ||
            entry.name === "managedAgentWebhookResetSecret"
          ) {
            expect(result.stdout).toContain("fixture-signing-secret");
            expect(result.stderr).not.toContain("fixture-signing-secret");
            if (format === "json")
              expect(
                result.stderr
                  .split("\n")
                  .filter(Boolean)
                  .map((line) => JSON.parse(line))
                  .some((record) => record.warning?.code === "AGENT_WEBHOOK_SECRET_ONCE"),
              ).toBe(true);
            else expect(result.stderr).toContain("Signing Secret");
          }
        }
  }, 60000);
}

const find = (name: string) => mapping.find((entry) => entry.name === name)!;
for (const name of [
  "managedAgentAgentGet",
  "managedAgentSessionGet",
  "managedAgentWebhookGet",
  "managedAgentMemoryGet",
])
  test(`${name} server failure remains one terminal JSONL error`, async () => {
    const result = await invoke(
      find(name),
      { format: "json", quiet: true, verbose: true },
      {
        fail: true,
      },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.strayOut + result.strayErr).toBe("");
    expect(result.resultCount).toBe(0);
    const diagnostics = result.stderr
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(diagnostics.filter((record) => record.error)).toHaveLength(1);
    expect(diagnostics.find((record) => record.error).error.message).toContain(
      "Original service failure",
    );
    expect(result.stderr).not.toContain("fixture-api-key");
  });
for (const name of [
  "managedAgentFileDownload",
  "managedAgentSkillDownload",
  "managedAgentSessionExport",
])
  test(`${name} writes a real owned output before returning metadata`, async () => {
    const result = await invoke(
      find(name),
      { format: "json", quiet: true, verbose: false },
      { dryRun: false },
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.strayOut + result.strayErr).toBe("");
    expect(result.resultCount).toBe(1);
    expect(JSON.parse(result.stdout).output_file).toBe("<ROOT>/result.bin");
    expect(result.outputBytes?.length).toBeGreaterThan(0);
    const bytes = Buffer.from(result.outputBytes!, "base64");
    if (name === "managedAgentSessionExport") {
      expect(bytes.subarray(0, 4).toString("hex")).toBe("504b0304");
      expect(bytes.includes(Buffer.from("fixture-one-time-secret"))).toBe(false);
      expect(bytes.includes(Buffer.from("fixture-api-key"))).toBe(false);
    } else expect(bytes.toString()).toBe("fixture-bytes");
  });
test("managed file output collision preserves existing contents and emits no result", async () => {
  const result = await invoke(
    find("managedAgentFileDownload"),
    { format: "json", quiet: true, verbose: false },
    { dryRun: false, existingOutput: true, flags: { force: false } },
  );
  expect(result.exitCode).toBe(2);
  expect(result.stdout).toBe("");
  expect(result.resultCount).toBe(0);
  expect(Buffer.from(result.outputBytes!, "base64").toString()).toBe("keep existing");
  expect(result.stderr.trim().split("\n")).toHaveLength(1);
});

for (const noStream of [false, true])
  for (const quiet of [false, true])
    test(`real SDK Session run ${noStream ? "polling" : "streaming"} retains complete JSON in quiet=${quiet}`, async () => {
      const result = await invoke(
        find("managedAgentSessionRun"),
        { format: "json", quiet, verbose: true },
        { dryRun: false, flags: { noStream, vault: undefined, environment: undefined } },
      );
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.strayOut + result.strayErr).toBe("");
      expect(result.resultCount).toBe(1);
      expect(JSON.parse(result.stdout)).toMatchObject({
        session_id: "fixture-id",
        provider: "bailian",
        agent: "assistant",
        events: expect.arrayContaining([
          expect.objectContaining({
            type: "message",
            content: [{ type: "text", text: "Fixture final answer" }],
          }),
        ]),
      });
      expect(result.stderr).not.toContain("AGENT_SESSION_INTERRUPTED");
      expect(result.calls.some((call) => (call as { method: string }).method === "POST")).toBe(
        true,
      );
    });
test("created streaming Session retains its ID once when the real SDK iterator fails", async () => {
  const result = await invoke(
    find("managedAgentSessionRun"),
    { format: "json", quiet: true, verbose: false },
    {
      dryRun: false,
      interruptStream: true,
      flags: { noStream: false, vault: undefined, environment: undefined },
    },
  );
  expect(result.exitCode).toBe(1);
  expect(result.stdout + result.strayOut + result.strayErr).toBe("");
  expect(result.resultCount).toBe(0);
  const diagnostics = result.stderr
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(diagnostics.filter((record) => record.error)).toHaveLength(1);
  const warnings = diagnostics.filter(
    (record) => record.warning?.code === "AGENT_SESSION_INTERRUPTED",
  );
  expect(warnings).toHaveLength(1);
  expect(warnings[0].warning.details.session_id).toBe("fixture-id");
});

for (const name of ["managedAgentPlayground", "managedAgentProjectWorkbench"])
  test(`${name} rejects effective JSON before listener or package side effects`, async () => {
    const result = await invoke(
      find(name),
      { format: "json", quiet: true, verbose: false },
      { dryRun: false },
    );
    expect(result.exitCode).toBe(2);
    expect(result.stdout + result.strayOut + result.strayErr).toBe("");
    expect(result.resultCount).toBe(0);
    expect(result.calls).toEqual([]);
    expect(result.stderr.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(result.stderr).error.code).toBe(2);
  });

test.each([false, true])(
  "destroy partial failure retains resource diagnostics in quiet=%s",
  async (quiet) => {
    const result = await invoke(
      find("managedAgentDestroy"),
      { format: "json", quiet, verbose: false },
      { dryRun: false, fail: true },
    );
    expect(result.exitCode, result.stderr).toBe(1);
    expect(result.resultCount).toBe(1);
    expect(JSON.parse(result.stdout)).toEqual({ destroyed: 0, total: 1 });
    const diagnostics = result.stderr
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(diagnostics.filter((record) => record.error)).toHaveLength(1);
    const warnings = diagnostics.filter(
      (record) => record.warning?.code === "AGENT_DESTROY_RESOURCE_FAILED",
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0].warning).toMatchObject({
      message: expect.stringContaining("Original service failure"),
      details: {
        status: "failed",
        remote_id: "fixture-agent",
        address: { provider: "bailian", type: "agent", name: "assistant" },
      },
    });
  },
);

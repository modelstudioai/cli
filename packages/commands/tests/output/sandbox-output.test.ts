import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vite-plus/test";
import {
  buildSettings,
  Client,
  httpTransport,
  type AnyCommand,
  type LocalizedText,
} from "bailian-cli-core";
import { createOutputReporter } from "bailian-cli-runtime";
import baseline from "./fixtures/sandbox-output.json" with { type: "json" };
import * as instance from "../../src/commands/sandbox/instance.ts";
import * as template from "../../src/commands/sandbox/template.ts";
import { sandboxFileUpload } from "../../src/commands/sandbox/file.ts";
import { sandboxOfficialImages } from "../../src/commands/sandbox/images.ts";

const identity = { binName: "bl", version: "0.0.0", clientName: "test", npmPackage: "test" };
const extras = { future: { values: [false, 0, null, []] } };
const sandbox = {
  sandboxID: "sandbox/fixture",
  templateID: "template-fixture",
  state: "running",
  cpuCount: 1,
  memoryMB: 2048,
  startedAt: "start",
  endAt: "end",
  envdAccessToken: "envd-fixture-secret",
  connection: { trafficAccessToken: "traffic-fixture-secret", hostname: "fixture.invalid" },
  ...extras,
};
const submitted = {
  templateID: "template/fixture",
  buildID: "build fixture",
  buildStatus: "building",
  ...extras,
};
const ready = {
  templateID: submitted.templateID,
  buildID: submitted.buildID,
  status: "ready",
  ...extras,
};
const templateInfo = {
  templateID: "template-fixture",
  templateName: "Fixture",
  cpuCount: 1,
  memoryMB: 2048,
  spawnCount: 0,
  buildCount: 2,
  updatedAt: "updated",
  ...extras,
};
const fileResponse = {
  id: "file-fixture",
  filename: "fixture.bin",
  status: "checking",
  token: "file-fixture-secret",
  size_bytes: 5,
  ...extras,
};
interface Scenario {
  name: string;
  command: AnyCommand;
  flags: Record<string, unknown>;
  response?: unknown;
  poll?: boolean;
  dryRun?: boolean;
  file?: boolean;
}
const createFlags = { name: "Fixture", cpuCount: 1, memoryMb: 2048 };
const scenarios: Scenario[] = [
  {
    name: "instance create",
    command: instance.sandboxCreate,
    flags: { templateId: "template-fixture", env: ["SECRET=fixture"] },
    response: sandbox,
    dryRun: true,
  },
  {
    name: "instance get",
    command: instance.sandboxGet,
    flags: { sandboxId: "sandbox/fixture" },
    response: sandbox,
  },
  {
    name: "instance get credentials",
    command: instance.sandboxGet,
    flags: { sandboxId: "sandbox/fixture", showCredentials: true },
    response: sandbox,
  },
  {
    name: "instance list",
    command: instance.sandboxList,
    flags: {
      templateId: "template-fixture",
      sandboxId: "sandbox/fixture",
      state: "running",
      limit: 5,
    },
    response: [sandbox],
  },
  { name: "instance list empty", command: instance.sandboxList, flags: {}, response: [] },
  {
    name: "instance connect",
    command: instance.sandboxConnect,
    flags: { sandboxId: "sandbox/fixture", instanceTimeout: 900 },
    response: sandbox,
    dryRun: true,
  },
  {
    name: "instance resume",
    command: instance.sandboxResume,
    flags: { sandboxId: "sandbox/fixture" },
    response: sandbox,
    dryRun: true,
  },
  {
    name: "instance pause",
    command: instance.sandboxPause,
    flags: { sandboxId: "sandbox/fixture" },
    dryRun: true,
  },
  {
    name: "instance delete",
    command: instance.sandboxDelete,
    flags: { sandboxId: "sandbox/fixture" },
    dryRun: true,
  },
  {
    name: "template create async",
    command: template.sandboxTemplateCreate,
    flags: { ...createFlags, async: true, env: ["SECRET=fixture"] },
    response: submitted,
    dryRun: true,
  },
  {
    name: "template create wait",
    command: template.sandboxTemplateCreate,
    flags: createFlags,
    response: submitted,
    poll: true,
  },
  {
    name: "template update async",
    command: template.sandboxTemplateUpdate,
    flags: { templateId: "template-fixture", description: "changed", async: true },
    response: submitted,
    dryRun: true,
  },
  {
    name: "template update wait",
    command: template.sandboxTemplateUpdate,
    flags: { templateId: "template-fixture", description: "changed" },
    response: submitted,
    poll: true,
  },
  {
    name: "template list",
    command: template.sandboxTemplateList,
    flags: { limit: 10, cursor: "cursor/fixture" },
    response: [templateInfo],
  },
  { name: "template list empty", command: template.sandboxTemplateList, flags: {}, response: [] },
  {
    name: "template get",
    command: template.sandboxTemplateGet,
    flags: { templateId: "template-fixture" },
    response: templateInfo,
  },
  {
    name: "template build status",
    command: template.sandboxTemplateBuildStatus,
    flags: { templateId: "template-fixture", buildId: "build/fixture" },
    response: ready,
  },
  {
    name: "template build failed status",
    command: template.sandboxTemplateBuildStatus,
    flags: { templateId: "template-fixture", buildId: "build/fixture" },
    response: { status: "error", reason: { message: "original build failure" }, ...extras },
  },
  {
    name: "template delete",
    command: template.sandboxTemplateDelete,
    flags: { templateId: "template-fixture" },
    dryRun: true,
  },
  {
    name: "file upload",
    command: sandboxFileUpload,
    flags: { filename: "fixture.bin", mimeType: "application/octet-stream" },
    response: fileResponse,
    dryRun: true,
    file: true,
  },
  { name: "official images", command: sandboxOfficialImages, flags: {} },
];
const displays = ["text", "json"].flatMap((format) =>
  [false, true].flatMap((quiet) =>
    [false, true].map((verbose) => ({ format: format as "text" | "json", quiet, verbose })),
  ),
);
afterEach(() => vi.restoreAllMocks());
async function execute(
  scenario: Scenario,
  display: (typeof displays)[number],
  options: {
    dryRun?: boolean;
    failure?: "service" | "network" | "build" | "timeout";
    language?: "en-US" | "zh-CN";
  } = {},
) {
  let stdout = "";
  let stderr = "";
  const directory = await mkdtemp(join(tmpdir(), "sandbox-output-"));
  const file = join(directory, "input.bin");
  await writeFile(file, new Uint8Array([0, 255, 13, 10, 65]));
  const requests: unknown[] = [];
  const settings = buildSettings({
    flags: {
      output: display.format,
      quiet: display.quiet,
      verbose: display.verbose,
      dryRun: options.dryRun,
      timeout: 30,
    },
    env: {},
    file: {},
  });
  if (options.failure === "timeout") settings.timeout = 0;
  const localize = (message: LocalizedText) =>
    typeof message === "string" ? message : message[options.language ?? "en-US"];
  const reporter = createOutputReporter({
    settings,
    localize,
    stdout: {
      write(chunk) {
        stdout += chunk;
      },
    },
    stderr: {
      write(chunk) {
        stderr += chunk;
      },
    },
  });
  const result = vi.spyOn(reporter.output, "result");
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });
  const transport = vi.spyOn(httpTransport, "fetch").mockImplementation(async (url, init) => {
    const address = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    let body: unknown = init?.body ?? null;
    if (typeof body === "string") body = JSON.parse(body);
    if (body instanceof FormData) {
      const fields: Record<string, unknown> = {};
      for (const [key, value] of body.entries())
        fields[key] =
          typeof value === "string"
            ? value
            : {
                name: value.name,
                type: value.type,
                bytes: [...new Uint8Array(await value.arrayBuffer())],
              };
      body = fields;
    }
    requests.push({ url: address, method: init?.method ?? "GET", body });
    const polling = address.includes("/builds/") && scenario.poll;
    if (options.failure === "network" && polling)
      throw new TypeError("fetch failed", { cause: { code: "ECONNRESET" } });
    if (options.failure === "service" && (!scenario.poll || polling))
      return Response.json(
        {
          code: "FixtureFailure",
          message: "original service failure",
          request_id: "request-fixture",
        },
        { status: 503 },
      );
    if (options.failure === "build" && polling)
      return Response.json({ status: "error", reason: { message: "original build failure" } });
    if (polling) return Response.json(ready);
    return scenario.response === undefined
      ? new Response(null, { status: 204 })
      : Response.json(scenario.response);
  });
  const client = new Client({
    identity,
    settings,
    apiCred: { token: "sk-test-only", source: "flag", baseUrl: "https://gateway.fixture.invalid" },
    baseUrl: "https://gateway.fixture.invalid",
    debug: (record) => reporter.output.debug(record),
  });
  let thrown: unknown;
  let exitCode = 0;
  try {
    await scenario.command.run({
      identity,
      settings,
      flags: { ...scenario.flags, ...(scenario.file ? { path: file } : {}) },
      client,
      localize,
      output: reporter.output,
    } as never);
  } catch (error) {
    thrown = error;
    exitCode = reporter.error(error);
  } finally {
    transport.mockRestore();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    await rm(directory, { recursive: true, force: true });
  }
  return {
    stdout: stdout.replaceAll(file, "$FILE"),
    stderr,
    requests,
    resultCount: result.mock.calls.length,
    thrown,
    exitCode,
  };
}

for (const scenario of scenarios)
  for (const display of displays)
    test(`${scenario.name} ${JSON.stringify(display)} preserves complete result and requests`, async () => {
      const actual = await execute(scenario, display);
      const expected = baseline[(scenario.name + ":" + display.format) as keyof typeof baseline];
      expect(actual.exitCode, actual.stderr).toBe(0);
      expect(actual.resultCount).toBe(1);
      expect(actual.stdout).toBe(expected.stdout);
      expect(actual.requests).toEqual(expected.requests);
      if (display.format === "json") {
        expect(JSON.parse(actual.stdout)).toEqual(JSON.parse(expected.stdout));
        const diagnostics = actual.stderr
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line));
        expect(diagnostics.every((entry) => entry.debug)).toBe(true);
        expect(diagnostics.length > 0).toBe(display.verbose && actual.requests.length > 0);
      } else if (display.quiet && !display.verbose) expect(actual.stderr).toBe("");
      if (!display.verbose) expect(actual.stderr).not.toContain("sk-test-only");
    });
for (const scenario of scenarios.filter((entry) => entry.dryRun))
  for (const display of displays)
    test(`${scenario.name} dryrun ${JSON.stringify(display)} is one redacted result without requests`, async () => {
      const actual = await execute(scenario, display, { dryRun: true });
      expect(actual.exitCode, actual.stderr).toBe(0);
      expect(actual.resultCount).toBe(1);
      expect(actual.requests).toEqual([]);
      expect(actual.stdout).not.toContain('"SECRET": "fixture"');
      expect(actual.stderr).toBe("");
      if (display.format === "json")
        expect(JSON.parse(actual.stdout)).toMatchObject({
          method: expect.any(String),
          endpoint: expect.any(String),
        });
    });
for (const name of ["instance get", "template get", "file upload"])
  test(`${name} keeps raw service error with one terminal record`, async () => {
    const actual = await execute(
      scenarios.find((entry) => entry.name === name)!,
      { format: "json", quiet: true, verbose: false },
      { failure: "service" },
    );
    expect(actual.exitCode).toBe(1);
    expect(actual.stdout).toBe("");
    expect(actual.resultCount).toBe(0);
    const diagnostics = actual.stderr
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].error.message).toContain("original service failure");
    expect(diagnostics[0].error).toMatchObject({
      code: 1,
      api_code: "FixtureFailure",
      request_id: "request-fixture",
    });
  });
for (const name of ["template create wait", "template update wait"])
  for (const failure of ["service", "network", "build", "timeout"] as const)
    for (const verbose of [false, true])
      test(`${name} ${failure} verbose=${verbose} keeps recovery IDs and terminal error`, async () => {
        const actual = await execute(
          scenarios.find((entry) => entry.name === name)!,
          { format: "json", quiet: true, verbose },
          { failure },
        );
        expect(actual.stdout).toBe("");
        expect(actual.resultCount).toBe(0);
        expect(actual.exitCode).toBe(failure === "timeout" ? 5 : failure === "network" ? 6 : 1);
        const diagnostics = actual.stderr
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line));
        const warnings = diagnostics.filter((entry) => entry.warning);
        const errors = diagnostics.filter((entry) => entry.error);
        expect(warnings).toHaveLength(1);
        expect(warnings[0].warning).toMatchObject({
          code: "SANDBOX_TEMPLATE_BUILD_SUBMITTED",
          details: { templateID: submitted.templateID, buildID: submitted.buildID },
        });
        expect(errors).toHaveLength(1);
        expect(actual.stderr).not.toContain("sk-test-only");
        expect(
          actual.requests.filter((entry) => (entry as { method: string }).method !== "GET"),
        ).toHaveLength(1);
      });

for (const name of ["instance list", "template list"])
  for (const response of [false, 0, null])
    test(`${name} preserves raw JSON ${JSON.stringify(response)} without text formatting`, async () => {
      const scenario = scenarios.find((entry) => entry.name === name)!;
      const actual = await execute(
        { ...scenario, response },
        { format: "json", quiet: true, verbose: false },
      );
      expect(actual.exitCode, actual.stderr).toBe(0);
      expect(actual.resultCount).toBe(1);
      expect(JSON.parse(actual.stdout)).toEqual(response);
    });

import { chmod, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { buildSettings, Client, type LocalizedText } from "bailian-cli-core";
import { createOutputReporter } from "bailian-cli-runtime";
import { enterIsolatedHome } from "e2e/isolation";
import {
  loadScopedCreateProject,
  replaceConfigAtomically,
  runScopedTopLevelCreate,
} from "../src/commands/managed-agent/_engine/scoped-create.ts";
import baseline from "./output/fixtures/managed-scoped-output.json" with { type: "json" };
import applyBaseline from "./output/fixtures/managed-scoped-apply.json" with { type: "json" };

const matrix = (["text", "json"] as const).flatMap((output) =>
  [false, true].flatMap((quiet) => [false, true].map((verbose) => ({ output, quiet, verbose }))),
);
const identity = { binName: "bl", version: "0.0.0", clientName: "test", npmPackage: "test" };
const localize = (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]);
const directories: string[] = [];
let isolation: ReturnType<typeof enterIsolatedHome>;
beforeEach(() => {
  isolation = enterIsolatedHome();
  vi.stubEnv("DASHSCOPE_API_KEY", "fixture-key");
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  isolation.restore();
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
function host(display: (typeof matrix)[number]) {
  let stdout = "";
  let stderr = "";
  const settings = { ...buildSettings({ flags: {}, env: {}, file: {} }), ...display, dryRun: true };
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
  return {
    context: {
      settings,
      identity,
      localize,
      client: new Client({
        settings,
        identity,
        baseUrl: "https://example.test",
        apiCred: { token: "fixture-key", baseUrl: "https://example.test", source: "flag" },
      }),
      output: reporter.output,
    },
    stdout: () => stdout,
    stderr: () => stderr,
  };
}
async function configFile() {
  const directory = await mkdtemp(join(tmpdir(), "managed-scoped-output-"));
  directories.push(directory);
  const configPath = join(directory, "agents.yaml");
  const source =
    'version: "1"\nproviders:\n  bailian:\n    api_key: fixture-key\n    base_url: https://example.test/api/v1/agentstudio\ndefaults:\n  provider: bailian\n';
  await writeFile(configPath, source);
  await chmod(configPath, 0o640);
  return { directory, configPath, source };
}
async function execute(
  context: ReturnType<typeof host>["context"],
  configPath: string,
  yes = false,
) {
  const project = await loadScopedCreateProject(context, configPath);
  const declaration = {
    display_name: "Fixture Vault",
    provider: "bailian",
    credentials: [],
    metadata: { empty: "", count: "0" },
  };
  await runScopedTopLevelCreate({
    host: context,
    project,
    group: "vaults",
    resourceType: "vault",
    displayName: "Fixture Vault",
    rawDeclaration: declaration,
    resolvedDeclaration: declaration,
    existingDeclarations: {},
    effectiveName: (key, entry) =>
      typeof entry.display_name === "string" ? entry.display_name : key,
    fallbackKey: "vault",
    yes,
  });
}
test.each(matrix)(
  "scoped offline preview matches immutable baseline $output quiet=$quiet verbose=$verbose",
  async (display) => {
    const file = await configFile();
    const streams = host(display);
    await execute(streams.context, file.configPath);
    const current = streams.stdout().replaceAll(file.configPath, "<config>");
    if (display.output === "json") expect(JSON.parse(current)).toEqual(JSON.parse(baseline.json));
    else expect(current).toBe(baseline.text);
    expect(streams.stderr()).toBe("");
    expect(await readFile(file.configPath, "utf8")).toBe(file.source);
    expect((await stat(file.configPath)).mode & 0o777).toBe(0o640);
    expect(await readdir(file.directory)).toEqual(["agents.yaml"]);
  },
);
test("scoped compare-and-swap rejects stale YAML without modifying files", async () => {
  const file = await configFile();
  await writeFile(file.configPath, "changed source\n");
  await expect(
    replaceConfigAtomically(file.configPath, file.source, "new source\n"),
  ).rejects.toMatchObject({ exitCode: 1 });
  expect(await readFile(file.configPath, "utf8")).toBe("changed source\n");
  expect(await readdir(file.directory)).toEqual(["agents.yaml"]);
});

test.each(matrix.flatMap((display) => [false, true].map((failed) => ({ ...display, failed }))))(
  "scoped real SDK apply preserves baseline $output quiet=$quiet verbose=$verbose failed=$failed",
  async ({ failed, ...display }) => {
    const file = await configFile();
    const streams = host(display);
    streams.context.settings.dryRun = false;
    const requests: Array<{ url: string; method: string; body: unknown }> = [];
    const { httpTransport } = await import("bailian-cli-core");
    vi.spyOn(httpTransport, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method ?? "GET";
      requests.push({ url, method, body: init?.body ? JSON.parse(init.body as string) : null });
      if (method === "GET")
        return new Response(JSON.stringify({ data: [], has_more: false }), {
          headers: { "content-type": "application/json" },
        });
      return new Response(
        JSON.stringify(
          failed
            ? {
                code: "FixtureDenied",
                message: "original server fixture",
                request_id: "fixture-request",
              }
            : {
                id: "vault_created",
                display_name: "Fixture Vault",
                metadata: { empty: "", count: "0" },
              },
        ),
        { status: failed ? 403 : 200, headers: { "content-type": "application/json" } },
      );
    });
    const execution = execute(streams.context, file.configPath, true);
    if (failed) await expect(execution).rejects.toMatchObject({ exitCode: 1 });
    else await execution;
    const normalize = (value: unknown) =>
      JSON.parse(
        JSON.stringify(value)
          .replaceAll(file.configPath, "<config>")
          .replaceAll(file.directory, "<directory>")
          .replaceAll(basename(file.directory), "<project>"),
      );
    const expected = applyBaseline[failed ? "true" : "false"];
    expect(normalize(requests)).toEqual(expected.requests);
    if (display.output === "json")
      expect(normalize(JSON.parse(streams.stdout()))).toEqual(expected.result);
    else
      expect(streams.stdout()).toBe(
        `Wrote ${file.configPath} with vault key 'fixture-vault'.\n${failed ? "" : "Created vault 'Fixture Vault'.\n"}`,
      );
    const source = await readFile(file.configPath, "utf8");
    expect(source).toContain("fixture-vault:");
    expect(source).toContain("display_name: Fixture Vault");
    expect((await stat(file.configPath)).mode & 0o777).toBe(0o640);
    expect(
      requests.some((request) => request.method === "POST" && request.url.endsWith("/vaults")),
    ).toBe(true);
    expect(requests.find((request) => request.method === "POST")!.body).toMatchObject({
      display_name: "Fixture Vault",
      metadata: { empty: "", count: "0" },
    });
    if (display.output === "json") {
      for (const line of streams.stderr().trim().split("\n").filter(Boolean)) {
        const record = JSON.parse(line);
        expect(record.warning ?? record.debug).toBeDefined();
      }
    }
    expect(streams.stderr().includes("HTTP request")).toBe(display.verbose);
    if (failed) expect(streams.stderr()).toContain("original server fixture");
    expect(streams.stderr()).not.toContain("fixture-key");
  },
);

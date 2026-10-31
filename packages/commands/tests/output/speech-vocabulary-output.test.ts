import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { runCommandE2e, runCommandInProcess } from "../e2e/helpers.ts";

const routes = {
  "speech vocabulary create": "speechVocabularyCreate",
  "speech vocabulary update": "speechVocabularyUpdate",
  "speech vocabulary delete": "speechVocabularyDelete",
  "speech vocabulary get": "speechVocabularyGet",
  "speech vocabulary list": "speechVocabularyList",
};
const vocabularyId = "vocab-demo-test";
const endpoint = "/api/v1/services/audio/asr/customization";
const entries = [
  {
    name: "create",
    flags: ["--model", "fun-asr", "--prefix", "demo", "--words", '{"Word":4}', "--lang", "en"],
    input: {
      action: "create_vocabulary",
      target_model: "fun-asr",
      prefix: "demo",
      vocabulary: [{ text: "Word", weight: 4, lang: "en" }],
    },
    output: { vocabulary_id: vocabularyId },
    text: vocabularyId + "\n",
  },
  {
    name: "update",
    flags: ["--id", vocabularyId, "--words", '[{"text":"Word","weight":4,"lang":"en"}]', "--yes"],
    input: {
      action: "update_vocabulary",
      vocabulary_id: vocabularyId,
      vocabulary: [{ text: "Word", weight: 4, lang: "en" }],
    },
    output: {},
    text: vocabularyId + "\n",
  },
  {
    name: "delete",
    flags: ["--id", vocabularyId, "--yes"],
    input: { action: "delete_vocabulary", vocabulary_id: vocabularyId },
    output: {},
    text: vocabularyId + "\n",
  },
  {
    name: "get",
    flags: ["--id", vocabularyId],
    input: { action: "query_vocabulary", vocabulary_id: vocabularyId },
    output: {
      status: "OK",
      target_model: "fun-asr",
      gmt_create: "created",
      gmt_modified: "modified",
      vocabulary: [
        { text: "Word", weight: 4, lang: "en" },
        { text: "Other", weight: 5 },
      ],
    },
    text: `vocabulary_id: ${vocabularyId}\nstatus: OK\ntarget_model: fun-asr\ngmt_create: created\ngmt_modified: modified\nvocabulary:\n  Word weight=4 lang=en\n  Other weight=5\n`,
  },
  {
    name: "list",
    flags: ["--prefix", "demo", "--page", "2", "--page-size", "3"],
    input: { action: "list_vocabulary", prefix: "demo", page_index: 1, page_size: 3 },
    output: {
      vocabulary_list: [
        { vocabulary_id: vocabularyId, status: "OK", gmt_modified: "modified" },
        { vocabulary_id: "vocab-unready", status: "UNDEPLOYED" },
      ],
    },
    text: `[${vocabularyId}] OK modified\n[vocab-unready] UNDEPLOYED\nNote: UNDEPLOYED vocabularies are silently ignored by ASR. Use \`speech vocabulary get\` to inspect them.\n`,
  },
];
let directory: string;
let server: Server;
let origin: string;
let responseBody: unknown;
let errorMode: "none" | "http" | "business";
let requests: Array<{ path: string; method: string; body: unknown }>;

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "bl-vocabulary-output-"));
  writeFileSync(join(directory, "config.json"), JSON.stringify({ language: "en-US" }));
  requests = [];
  errorMode = "none";
  responseBody = {};
  server = createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) raw += String(chunk);
    requests.push({ path: request.url!, method: request.method!, body: JSON.parse(raw) });
    response.setHeader("content-type", "application/json");
    if (errorMode !== "none") {
      response.writeHead(errorMode === "http" ? 429 : 200).end(
        JSON.stringify({
          code: "ServiceFailure",
          message: "Original service failure",
          request_id: "request-failure",
        }),
      );
    } else response.end(JSON.stringify(responseBody));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected loopback address");
  origin = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  vi.unstubAllEnvs();
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  rmSync(directory, { recursive: true, force: true });
});

function invoke(
  name: string,
  flags: string[],
  display: { format: "text" | "json"; quiet?: boolean; verbose?: boolean; dryRun?: boolean },
  subprocess = false,
) {
  const args = ["speech", "vocabulary", name, ...flags, "--output", display.format];
  if (display.quiet) args.push("--quiet");
  if (display.verbose) args.push("--verbose");
  if (display.dryRun) args.push("--dry-run");
  // The matrix still exercises createCli, middleware and real loopback HTTP.
  // Keep process startup coverage separate instead of paying for it per combination.
  const run = subprocess ? runCommandE2e : runCommandInProcess;
  return run(routes, args, {
    HOME: directory,
    BAILIAN_CONFIG_DIR: directory,
    DASHSCOPE_API_KEY: "test-vocabulary-placeholder",
    DASHSCOPE_BASE_URL: origin,
    DASHSCOPE_QUIET: "0",
    DASHSCOPE_VERBOSE: "0",
    BAILIAN_INSTALL_METHOD: "brew",
    NODE_OPTIONS: "",
    NODE_USE_ENV_PROXY: "0",
    HTTP_PROXY: "",
    http_proxy: "",
    HTTPS_PROXY: "",
    https_proxy: "",
    ALL_PROXY: "",
    all_proxy: "",
    NO_PROXY: "",
    no_proxy: "",
  });
}
const displays = (["text", "json"] as const).flatMap((format) =>
  [false, true].map((verbose) => ({ format, verbose })),
);

for (const entry of entries) {
  test(`${entry.name} subprocess preserves the JSON result and request`, async () => {
    responseBody = {
      request_id: "request-smoke",
      output: entry.output,
      service_extra: "preserved",
    };
    const result = await invoke(entry.name, entry.flags, { format: "json", quiet: true }, true);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(responseBody);
    expect(result.stderr).toBe("");
    expect(requests).toEqual([
      { path: endpoint, method: "POST", body: { model: "speech-biasing", input: entry.input } },
    ]);
  });

  test.each(displays)(
    `${entry.name} preserves results and requests with $format verbose=$verbose`,
    async (display) => {
      responseBody = {
        request_id: "request-success",
        output: entry.output,
        usage: { count: 2 },
        service_extra: "preserved",
      };
      const runs = [];
      for (const quiet of [false, true]) {
        requests = [];
        const result = await invoke(entry.name, entry.flags, { ...display, quiet });
        expect(result.exitCode, result.stderr).toBe(0);
        if (display.format === "json") {
          expect(JSON.parse(result.stdout)).toEqual(responseBody);
          const diagnostics = result.stderr.trim()
            ? result.stderr
                .trim()
                .split("\n")
                .map((line) => JSON.parse(line))
            : [];
          expect(diagnostics.every((record) => record.debug)).toBe(true);
          expect(diagnostics.length > 0).toBe(display.verbose);
        } else {
          expect(result.stdout).toBe(entry.text);
          if (!display.verbose) expect(result.stderr).toBe("");
        }
        expect(result.stderr).not.toContain("test-vocabulary-placeholder");
        expect(requests).toEqual([
          { path: endpoint, method: "POST", body: { model: "speech-biasing", input: entry.input } },
        ]);
        runs.push(result.stdout);
      }
      expect(runs[1]).toBe(runs[0]);
    },
  );

  test(`${entry.name} dry-run keeps its request and makes no API call`, async () => {
    const result = await invoke(entry.name, entry.flags, {
      format: "json",
      quiet: true,
      verbose: true,
      dryRun: true,
    });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      endpoint: origin + endpoint,
      request: { model: "speech-biasing", input: entry.input },
    });
    expect(result.stderr).toBe("");
    expect(requests).toEqual([]);
  });

  test.each(["http", "business"] as const)(
    `${entry.name}/%s retains a single terminal error in JSON quiet verbose`,
    async (failure) => {
      errorMode = failure;
      const result = await invoke(entry.name, entry.flags, {
        format: "json",
        quiet: true,
        verbose: true,
      });
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      const records = result.stderr
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      const errors = records.filter((record) => record.error);
      expect(errors).toHaveLength(1);
      expect(errors[0].error).toMatchObject({
        message: "Original service failure",
        api_code: "ServiceFailure",
      });
      if (failure === "http") expect(errors[0].error.request_id).toBe("request-failure");
      expect(requests).toHaveLength(1);
    },
  );
}

for (const name of ["update", "delete"]) {
  test(`${name} still requires confirmation in JSON quiet mode`, async () => {
    const entry = entries.find((candidate) => candidate.name === name)!;
    const result = await invoke(
      name,
      entry.flags.filter((flag) => flag !== "--yes"),
      { format: "json", quiet: true },
    );
    expect(result.exitCode).toBe(7);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({ error: { type: "requires_confirmation" } });
    expect(requests).toEqual([]);
  });
}

test.each(["get", "list"])(
  "%s passes through unrecognized server fields in JSON without rendering text",
  async (name) => {
    responseBody = {
      request_id: "request-raw",
      output:
        name === "get"
          ? { vocabulary: null, status: "UNDEPLOYED", unexpected: 42 }
          : { vocabulary_list: { unexpected: 42 } },
    };
    const entry = entries.find((candidate) => candidate.name === name)!;
    const result = await invoke(name, entry.flags, { format: "json", quiet: true });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(responseBody);
    expect(result.stderr).toBe("");
  },
);

test.each(["text", "json"] as const)("list preserves empty results in %s quiet", async (format) => {
  responseBody = { request_id: "request-empty", output: { vocabulary_list: [] } };
  const result = await invoke("list", [], { format, quiet: true });
  expect(result.exitCode, result.stderr).toBe(0);
  if (format === "json") expect(JSON.parse(result.stdout)).toEqual(responseBody);
  else expect(result.stdout).toBe("No vocabularies found.\n");
});

test.each(["create", "update"])(
  "%s preserves words-file parsing and missing-file errors",
  async (name) => {
    const entry = entries.find((candidate) => candidate.name === name)!;
    responseBody = { request_id: "request-file", output: entry.output };
    const wordsFile = join(directory, "words.json");
    writeFileSync(wordsFile, '[{"text":"FileWord","weight":4,"lang":"en"}]');
    const flags =
      name === "create"
        ? ["--model", "fun-asr", "--prefix", "demo"]
        : ["--id", vocabularyId, "--yes"];
    const result = await invoke(name, [...flags, "--words-file", wordsFile], {
      format: "json",
      quiet: true,
    });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(responseBody);
    expect(requests[0]!.body).toMatchObject({
      input: { vocabulary: [{ text: "FileWord", weight: 4, lang: "en" }] },
    });
    requests = [];
    const missing = await invoke(
      name,
      [...flags, "--words-file", join(directory, "missing.json")],
      { format: "json", quiet: true },
    );
    expect(missing.exitCode).toBe(1);
    expect(missing.stdout).toBe("");
    expect(JSON.parse(missing.stderr).error.message).toContain("missing.json");
    expect(requests).toEqual([]);
  },
);

test.each([false, true])("list localizes human result text with empty=%s", async (empty) => {
  writeFileSync(join(directory, "config.json"), JSON.stringify({ language: "zh-CN" }));
  responseBody = {
    output: {
      vocabulary_list: empty ? [] : [{ vocabulary_id: vocabularyId, status: "UNDEPLOYED" }],
    },
  };
  for (const quiet of [false, true]) {
    const result = await invoke("list", [], { format: "text", quiet });
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stderr).toBe("");
    if (empty) expect(result.stdout).toBe("未找到热词表。\n");
    else
      expect(result.stdout).toBe(
        `[${vocabularyId}] UNDEPLOYED\n提示：ASR 会静默忽略 UNDEPLOYED 状态的热词表。请使用 \`speech vocabulary get\` 查看详情。\n`,
      );
  }
});

test("loopback requests ignore inherited proxy settings", async () => {
  for (const key of [
    "HTTP_PROXY",
    "http_proxy",
    "HTTPS_PROXY",
    "https_proxy",
    "ALL_PROXY",
    "all_proxy",
  ]) {
    vi.stubEnv(key, "http://127.0.0.1:1");
  }
  vi.stubEnv("NO_PROXY", "");
  vi.stubEnv("no_proxy", "");
  responseBody = { request_id: "request-direct", output: { vocabulary_list: [] } };
  const result = await invoke("list", [], { format: "json", quiet: true, verbose: true }, true);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual(responseBody);
  expect(requests).toHaveLength(1);
});

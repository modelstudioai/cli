import { mkdtemp, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { createCli } from "bailian-cli-runtime";
import { runInProcess } from "e2e/in-process";
import { buildIsolatedCliEnv } from "e2e/isolation";
import parseResult from "../../src/commands/parsex/parse-result.ts";
import {
  runCommandHelp,
  runCommandInProcess,
  runCommandE2e,
  parseStdoutJson,
  isDashScopeE2EReady,
} from "./helpers.ts";
import { PARSEX_ROUTES } from "./topic-routes.ts";
import { E2E_HARNESS_IDENTITY } from "./harness/identity.ts";
import { withHarnessUpdateFixture } from "./harness/update-fixture.ts";

let directory: string;
let baseUrl: string;
let server: Server;
let environment: NodeJS.ProcessEnv;
let requests: { path: string; method: string; body: Record<string, unknown>; auth?: string }[];
let states: string[];
let failure: { status: number; code: string; message: string } | undefined;
let invalidResponse: boolean;
let stall: boolean;
let interrupt: boolean;
const schema = { type: "object", properties: { title: { type: "string" } } };
const oss = {
  bucket: "example-bucket",
  endpoint: "oss-cn-beijing.aliyuncs.com",
  access_key_id: "fixture-access-id",
  access_key_secret: "fixture-secret",
  security_token: "fixture-sts",
};
const resultData = {
  page_count: 1,
  layouts: [{ text: "Fixture document" }],
  extract_result_json: { title: "Fixture document" },
  fields: [
    {
      path: "title",
      status: "found",
      value: "Fixture document",
      citations: [{ quote: "Fixture document", page: 1 }],
    },
  ],
};

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "parsex-e2e-"));
  await writeFile(
    join(directory, "config.json"),
    JSON.stringify({ language: "en-US", telemetry: false }),
  );
  await writeFile(join(directory, "schema.json"), JSON.stringify(schema));
  await writeFile(join(directory, "oss.json"), JSON.stringify(oss));
  requests = [];
  states = ["success"];
  failure = undefined;
  invalidResponse = false;
  stall = false;
  interrupt = false;
  server = createServer(async (incoming, outgoing) => {
    let content = "";
    for await (const chunk of incoming) content += String(chunk);
    requests.push({
      path: incoming.url ?? "",
      method: incoming.method ?? "",
      body: JSON.parse(content),
      auth: incoming.headers.authorization,
    });
    if (interrupt) setTimeout(() => process.emit("SIGINT"), 20);
    if (stall) return;
    outgoing.setHeader("content-type", "application/json");
    if (failure) {
      outgoing.statusCode = failure.status;
      outgoing.end(
        JSON.stringify({
          code: failure.code,
          message: failure.message,
          request_id: "request-error",
        }),
      );
      return;
    }
    if (invalidResponse) {
      outgoing.end('{"data":{}}');
      return;
    }
    if (incoming.url?.endsWith("/submit")) {
      outgoing.end('{"request_id":"request-submit","data":{"biz_id":"biz-fixture"}}');
      return;
    }
    const state = states.length > 1 ? states.shift() : states[0];
    if (state === "ResultNotReady") {
      outgoing.statusCode = 409;
      outgoing.end(
        '{"code":"ResultNotReady","message":"Retrieve result if job is not completed."}',
      );
      return;
    }
    outgoing.end(
      JSON.stringify({
        request_id: "request-result",
        data: {
          ...resultData,
          status: state,
          ...(state === "failed"
            ? { code: "ProcessingFailed", message: "original engine error" }
            : {}),
        },
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected local fixture address");
  baseUrl = `http://127.0.0.1:${address.port}`;
  environment = {
    BAILIAN_CONFIG_DIR: directory,
    DASHSCOPE_API_KEY: "",
    DASHSCOPE_BASE_URL: "",
    BAILIAN_WORKSPACE_ID: "",
    HTTP_PROXY: "",
    HTTPS_PROXY: "",
    http_proxy: "",
    https_proxy: "",
    NODE_OPTIONS: "",
  };
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(directory, { recursive: true, force: true });
});
function local(args: string[]) {
  return runCommandE2e(
    PARSEX_ROUTES,
    ["parsex", ...args, "--base-url", baseUrl, "--api-key", "fixture-api-key", "--output", "json"],
    environment,
  );
}
function dry(args: string[], env = environment) {
  return runCommandInProcess(
    PARSEX_ROUTES,
    ["parsex", ...args, "--dry-run", "--output", "json"],
    env,
  );
}

describe("e2e: ParseX (offline HTTP fixture)", () => {
  test.each(Object.keys(PARSEX_ROUTES))("%s help works without credentials", async (path) => {
    const result = await runCommandHelp(PARSEX_ROUTES, [...path.split(" "), "--help"]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stderr).toContain("--workspace-id");
    expect(result.stderr).toContain("--oss-config-file");
    if (path === "parsex extract result") expect(result.stderr).not.toContain("--step-size");
  });
  test.each(["en-US", "zh-CN"])("%s localized help", async (language) => {
    await writeFile(join(directory, "config.json"), JSON.stringify({ language, telemetry: false }));
    const result = await runCommandInProcess(
      PARSEX_ROUTES,
      ["parsex", "extract", "submit", "--help"],
      environment,
    );
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain(language === "zh-CN" ? "字段抽取" : "field extraction");
  });
  test.each([
    ["parse", "submit"],
    ["parse", "result"],
    ["extract", "result"],
    ["extract", "submit"],
    ["extract", "submit", "--file-url", "https://example.com/file.pdf"],
    [
      "extract",
      "submit",
      "--file-url",
      "https://example.com/file.pdf",
      "--parsed-file-biz-id",
      "biz",
      "--config-id",
      "config",
    ],
    ["parse", "submit", "--file-url", "./local.pdf"],
    [
      "parse",
      "submit",
      "--file-url",
      "https://example.com/file.pdf",
      "--file-name",
      "file.pdf",
      "--file-name-extension",
      "pdf",
    ],
    ["parse", "result", "--biz-id", " "],
    ["parse", "result", "--biz-id", "biz", "--step-size", "-1"],
    ["parse", "result", "--biz-id", "biz", "--step-start", "1.5"],
    ["parse", "result", "--biz-id", "biz", "--interval", "2"],
    ["parse", "result", "--biz-id", "biz", "--follow", "--poll-timeout", "0"],
    ["parse", "result", "--biz-id", "biz", "--follow", "--interval", "0"],
    ["extract", "result", "--biz-id", "biz", "--step-size", "10"],
    [
      "extract",
      "submit",
      "--parsed-file-biz-id",
      "biz",
      "--config-id",
      "config",
      "--citation-required",
      "false",
    ],
  ])("invalid flags fail before HTTP: %j", async (...args) => {
    const result = await dry([...args, "--workspace-id", "ws-example"]);
    expect(result.exitCode, result.stderr).toBe(2);
    expect(requests).toEqual([]);
  });
  test("dry-run resolves workspace precedence and origin overrides without credentials", async () => {
    const args = ["parse", "result", "--biz-id", "biz"];
    expect((await dry(args)).exitCode).toBe(2);
    await writeFile(
      join(directory, "config.json"),
      JSON.stringify({ language: "en-US", telemetry: false, workspace_id: "ws-profile" }),
    );
    const fromProfile = await dry(args);
    expect(parseStdoutJson(fromProfile.stdout)).toMatchObject({
      endpoint: "https://ws-profile.cn-beijing.maas.aliyuncs.com/api/v2/apps/parse-x/parse/result",
    });
    const env = { ...environment, BAILIAN_WORKSPACE_ID: "ws-env" };
    expect((await dry(args, env)).stdout).toContain("ws-env.cn-beijing");
    expect((await dry([...args, "--workspace-id", "ws-flag"], env)).stdout).toContain(
      "ws-flag.cn-beijing",
    );
    const custom = await dry([
      ...args,
      "--base-url",
      "https://ws-example.cn-beijing.pre-maas.aliyuncs.com",
    ]);
    expect(parseStdoutJson(custom.stdout)).toMatchObject({
      endpoint:
        "https://ws-example.cn-beijing.pre-maas.aliyuncs.com/api/v2/apps/pre-parse-x/parse/result",
    });
    expect(requests).toEqual([]);
  });
  test.each(["http://example.com", "not-a-url"])(
    "invalid endpoint rejected: %s",
    async (endpoint) => {
      expect(
        (await dry(["parse", "result", "--biz-id", "biz", "--base-url", endpoint])).exitCode,
      ).toBe(2);
      expect(requests).toEqual([]);
    },
  );
  test("preview redacts credentials and signed URLs, preserves false values, and makes no writes", async () => {
    const before = await readdir(directory);
    const result = await dry([
      "extract",
      "submit",
      "--file-url",
      "https://example.com/file.pdf?Signature=private-signature",
      "--schema-file",
      join(directory, "schema.json"),
      "--citation-required",
      "false",
      "--allow-inference",
      "false",
      "--oss-config-file",
      join(directory, "oss.json"),
      "--workspace-id",
      "ws-example",
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(parseStdoutJson(result.stdout)).toMatchObject({
      request: {
        processing: {
          extract_processing_config: {
            extract_schema: schema,
            citation_required: false,
            allow_inference: false,
          },
        },
      },
    });
    for (const secret of ["private-signature", ...Object.values(oss).slice(2)])
      expect(result.stdout + result.stderr).not.toContain(secret);
    expect(requests).toEqual([]);
    expect(await readdir(directory)).toEqual(before);
  });
  test.each(["null", "[]", '"json string"', "{"])(
    "rejects non-object/malformed schema: %s",
    async (content) => {
      await writeFile(join(directory, "schema.json"), content);
      const result = await dry([
        "extract",
        "submit",
        "--file-url",
        "https://example.com/file.pdf",
        "--schema-file",
        join(directory, "schema.json"),
      ]);
      expect(result.exitCode).toBe(2);
      expect(requests).toEqual([]);
    },
  );
  test("missing config file is an I/O error and invalid processing fails preflight", async () => {
    const args = [
      "extract",
      "submit",
      "--parsed-file-biz-id",
      "biz",
      "--processing-file",
      join(directory, "processing.json"),
    ];
    expect((await dry(args)).exitCode).toBe(1);
    await writeFile(
      join(directory, "processing.json"),
      JSON.stringify({ extract_processing_config: { extract_schema: "{}" } }),
    );
    expect((await dry(args)).exitCode).toBe(2);
    await writeFile(
      join(directory, "processing.json"),
      JSON.stringify({
        media_processing_config: { frame_extraction: { mode: "frame_rate", frame_rate: 6 } },
      }),
    );
    expect(
      (
        await dry([
          "parse",
          "submit",
          "--file-url",
          "https://example.com/video.mp4",
          "--processing-file",
          join(directory, "processing.json"),
        ])
      ).exitCode,
    ).toBe(2);
  });
  test("all four endpoints use POST and Bearer auth; query OSS credentials are top-level", async () => {
    const processing = {
      doc_processing_config: { page_index: "1-2", head_foot: false, layout_position: true },
    };
    await writeFile(join(directory, "processing.json"), JSON.stringify(processing));
    const parsed = await local([
      "parse",
      "submit",
      "--file-url",
      "https://example.com/file.pdf?Signature=signed",
      "--file-name",
      "file.pdf",
      "--config-id",
      "config-example",
      "--processing-file",
      join(directory, "processing.json"),
      "--output-file-format",
      "markdown",
      "--layout-table-format",
      "html",
      "--oss-config-file",
      join(directory, "oss.json"),
    ]);
    expect(parsed.exitCode, parsed.stderr).toBe(0);
    expect(parseStdoutJson(parsed.stdout)).toEqual({
      request_id: "request-submit",
      data: { biz_id: "biz-fixture" },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].body).toMatchObject({
      file_url: "https://example.com/file.pdf?Signature=signed",
      file_name: "file.pdf",
      config_id: "config-example",
      processing,
      output: { output_file_format: ["markdown"], layout_table_format: "html", oss_config: oss },
    });
    const queried = await local([
      "parse",
      "result",
      "--biz-id",
      "biz-fixture",
      "--step-start",
      "0",
      "--step-size",
      "1",
      "--oss-config-file",
      join(directory, "oss.json"),
    ]);
    expect(queried.exitCode, queried.stderr).toBe(0);
    expect(requests[1].body).toEqual({
      biz_id: "biz-fixture",
      step_start: 0,
      step_size: 1,
      oss_config: {
        access_key_id: oss.access_key_id,
        access_key_secret: oss.access_key_secret,
        security_token: oss.security_token,
      },
    });
    const extracted = await local([
      "extract",
      "submit",
      "--parsed-file-biz-id",
      "biz-fixture",
      "--schema-file",
      join(directory, "schema.json"),
      "--citation-required",
      "false",
      "--user-prompt",
      "Find title",
    ]);
    expect(extracted.exitCode, extracted.stderr).toBe(0);
    expect(requests[2].body).toEqual({
      parsed_file_biz_id: "biz-fixture",
      processing: {
        user_prompt: "Find title",
        extract_processing_config: { extract_schema: schema, citation_required: false },
      },
    });
    const fields = await local(["extract", "result", "--biz-id", "biz-fixture"]);
    expect(parseStdoutJson(fields.stdout)).toMatchObject({
      request_id: "request-result",
      data: resultData,
    });
    expect(requests.map((request) => request.path)).toEqual([
      "/api/v2/apps/parse-x/parse/submit",
      "/api/v2/apps/parse-x/parse/result",
      "/api/v2/apps/parse-x/extract/submit",
      "/api/v2/apps/parse-x/extract/result",
    ]);
    expect(
      requests.every(
        (request) => request.method === "POST" && request.auth === "Bearer fixture-api-key",
      ),
    ).toBe(true);
  });
  test("follow handles init, processing and ResultNotReady, emitting one terminal JSON response", async () => {
    states = ["init", "processing", "ResultNotReady", "success"];
    const result = await local([
      "parse",
      "result",
      "--biz-id",
      "biz-fixture",
      "--follow",
      "--interval",
      "1",
      "--poll-timeout",
      "15",
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(parseStdoutJson(result.stdout)).toMatchObject({
      data: { status: "success", layouts: resultData.layouts },
    });
    expect(requests).toHaveLength(4);
    expect(result.stderr).toBe("");
    expect(requests.every((request) => request.body.biz_id === "biz-fixture")).toBe(true);
  });
  test("single failed query succeeds; followed failure preserves service message and request ID", async () => {
    states = ["failed"];
    expect((await local(["extract", "result", "--biz-id", "biz-fixture"])).exitCode).toBe(0);
    const result = await local(["extract", "result", "--biz-id", "biz-fixture", "--follow"]);
    expect(result.exitCode).toBe(1);
    expect(parseStdoutJson(result.stdout)).toMatchObject({
      data: { status: "failed", message: "original engine error" },
    });
    expect(result.stderr).toContain("original engine error");
    expect(result.stderr).toContain("request-result");
  });
  test.each([400, 200])(
    "service error (%s) is not translated or retried on submit",
    async (status) => {
      failure = { status, code: "InvalidSchema", message: "original service message" };
      const result = await local(["parse", "submit", "--file-url", "https://example.com/file.pdf"]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("original service message");
      expect(result.stderr).toContain("request-error");
      expect(requests).toHaveLength(1);
    },
  );
  test("malformed success never looks completed and does not resubmit", async () => {
    invalidResponse = true;
    expect(
      (await local(["parse", "submit", "--file-url", "https://example.com/file.pdf"])).exitCode,
    ).toBe(1);
    expect((await local(["parse", "result", "--biz-id", "biz-fixture", "--follow"])).exitCode).toBe(
      1,
    );
    expect(requests).toHaveLength(2);
  });
  test("polling deadline aborts an in-flight request and preserves resumable biz_id", async () => {
    stall = true;
    const result = await local([
      "parse",
      "result",
      "--biz-id",
      "biz-fixture",
      "--follow",
      "--poll-timeout",
      "1",
      "--timeout",
      "30",
    ]);
    expect(result.exitCode, result.stderr).toBe(5);
    expect(result.stderr).toContain("biz-fixture");
    expect(requests).toHaveLength(1);
  });
  test("unknown states never imply success; the deadline also covers polling sleep", async () => {
    states = ["future-state"];
    const result = await local([
      "parse",
      "result",
      "--biz-id",
      "biz-fixture",
      "--follow",
      "--interval",
      "10",
      "--poll-timeout",
      "1",
    ]);
    expect(result.exitCode, result.stderr).toBe(5);
    expect(result.stdout).toBe("");
    expect(requests).toHaveLength(1);
  });
  test("single ResultNotReady is passed through without polling", async () => {
    states = ["ResultNotReady"];
    const result = await local(["extract", "result", "--biz-id", "biz-fixture"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Retrieve result if job is not completed.");
    expect(requests).toHaveLength(1);
  });
  test("dry-run accepts arbitrary schema examples named file_url", async () => {
    const exampleSchema = { ...schema, examples: [{ file_url: "relative.pdf" }] };
    await writeFile(join(directory, "schema.json"), JSON.stringify(exampleSchema));
    const result = await dry([
      "extract",
      "submit",
      "--parsed-file-biz-id",
      "biz-fixture",
      "--schema-file",
      join(directory, "schema.json"),
      "--workspace-id",
      "ws-example",
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(parseStdoutJson(result.stdout)).toMatchObject({
      request: { processing: { extract_processing_config: { extract_schema: exampleSchema } } },
    });
  });
  test("quiet submit and result retain complete JSON responses", async () => {
    const submitted = await local([
      "parse",
      "submit",
      "--file-url",
      "https://example.com/file.pdf",
      "--quiet",
    ]);
    expect(parseStdoutJson(submitted.stdout)).toEqual({
      request_id: "request-submit",
      data: { biz_id: "biz-fixture" },
    });
    expect(submitted.stderr).toBe("");
    const queried = await local(["extract", "result", "--biz-id", "biz-fixture", "--quiet"]);
    expect(parseStdoutJson(queried.stdout)).toEqual({
      request_id: "request-result",
      data: { ...resultData, status: "success" },
    });
    expect(queried.stderr).toBe("");
  });
  test("Ctrl-C aborts polling, removes its listener and never cancels the remote job", async () => {
    interrupt = true;
    stall = true;
    const args = [
      "parsex",
      "parse",
      "result",
      "--biz-id",
      "biz-fixture",
      "--follow",
      "--base-url",
      baseUrl,
      "--api-key",
      "fixture-api-key",
      "--output",
      "json",
    ];
    const isolated = buildIsolatedCliEnv({ overrides: environment });
    let before: ReturnType<typeof process.rawListeners> = [];
    let after: ReturnType<typeof process.rawListeners> = [];
    try {
      const result = await runInProcess(
        async () => {
          const cli = createCli({ "parsex parse result": parseResult }, E2E_HARNESS_IDENTITY);
          before = process.rawListeners("SIGINT");
          try {
            await withHarnessUpdateFixture(() => cli.run(args));
          } finally {
            after = process.rawListeners("SIGINT");
          }
        },
        args,
        { env: isolated.env },
      );
      expect(result.exitCode, result.stderr).toBe(130);
      expect(after).toEqual(before);
      expect(requests.map((request) => request.path)).toEqual([
        "/api/v2/apps/parse-x/parse/result",
      ]);
    } finally {
      isolated.dispose();
    }
  });
});

const liveReady =
  isDashScopeE2EReady() &&
  Boolean(process.env.BAILIAN_WORKSPACE_ID && process.env.BAILIAN_E2E_PARSEX_FILE_URL);
describe.skipIf(!liveReady)("e2e: ParseX (live, explicit source URL required)", () => {
  test("parse → query → extract parsed result → query", async () => {
    const execute = (args: string[]) =>
      runCommandE2e(PARSEX_ROUTES, [
        "parsex",
        ...args,
        "--workspace-id",
        process.env.BAILIAN_WORKSPACE_ID!,
        "--output",
        "json",
      ]);
    const parsed = await execute([
      "parse",
      "submit",
      "--file-url",
      process.env.BAILIAN_E2E_PARSEX_FILE_URL!,
      "--file-name",
      "sample.pdf",
      "--output-file-format",
      "markdown",
    ]);
    expect(parsed.exitCode, parsed.stderr).toBe(0);
    const parseId = parseStdoutJson<{ data: { biz_id: string } }>(parsed.stdout).data.biz_id;
    const result = await execute([
      "parse",
      "result",
      "--biz-id",
      parseId,
      "--follow",
      "--poll-timeout",
      "600",
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    const extracted = await execute([
      "extract",
      "submit",
      "--parsed-file-biz-id",
      parseId,
      "--schema-file",
      join(directory, "schema.json"),
    ]);
    expect(extracted.exitCode, extracted.stderr).toBe(0);
    const extractId = parseStdoutJson<{ data: { biz_id: string } }>(extracted.stdout).data.biz_id;
    const fields = await execute([
      "extract",
      "result",
      "--biz-id",
      extractId,
      "--follow",
      "--poll-timeout",
      "600",
    ]);
    expect(fields.exitCode, fields.stderr).toBe(0);
    expect(parseStdoutJson(fields.stdout)).toMatchObject({ data: { status: "success" } });
  }, 1_300_000);
});

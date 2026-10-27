import { mkdtemp, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { runCommandE2e, runCommandHelp, runCommandInProcess, parseStdoutJson } from "./helpers.ts";
import { BATCH_ROUTES, TEXT_CHAT_ROUTES } from "./topic-routes.ts";
import { createCli } from "bailian-cli-runtime";
import { runInProcess } from "e2e/in-process";
import { buildIsolatedCliEnv } from "e2e/isolation";
import textChat from "../../src/commands/text/chat.ts";
import batchGet from "../../src/commands/batch/get.ts";
import { E2E_HARNESS_IDENTITY } from "./harness/identity.ts";
import { withHarnessUpdateFixture } from "./harness/update-fixture.ts";

let directory: string;
let server: Server;
let baseUrl: string;
let environment: NodeJS.ProcessEnv;
let requests: Array<{ path: string; method: string; body: string }>;
let state: string;
let invalidResult: boolean;
let failCreate: boolean;
let interruptOnQuery: boolean;
const outputRecord =
  '{"custom_id":"00123","response":{"status_code":200,"request_id":"req","body":{"model":"qwen-plus","choices":[{"message":{"content":"hello"}}],"usage":{"total_tokens":3}}},"error":null}\r\n';
const errorRecord =
  '{"custom_id":"00002","response":null,"error":{"code":"ExampleError","message":"service error"}}\n';

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "bl-batch-e2e-"));
  await writeFile(
    join(directory, "config.json"),
    JSON.stringify({ language: "en-US", telemetry: false }),
  );
  await writeFile(join(directory, "input.csv"), "custom_id,content\n00123,hello\n00002,2+2?\n");
  await writeFile(
    join(directory, "input.jsonl"),
    '{"custom_id":"00123","method":"POST","url":"/v1/chat/completions","body":{"model":"qwen-plus","messages":[{"role":"user","content":"hello"}]}}\n',
  );
  requests = [];
  state = "completed";
  invalidResult = false;
  failCreate = false;
  interruptOnQuery = false;
  server = createServer(async (incoming, response) => {
    let body = "";
    for await (const chunk of incoming) body += String(chunk);
    const path = incoming.url ?? "";
    if (interruptOnQuery && path.endsWith("/batches/batch-one"))
      setTimeout(() => process.emit("SIGINT"), 20);
    requests.push({ path, method: incoming.method ?? "GET", body });
    response.setHeader("content-type", "application/json");
    if (path.endsWith("/files") && incoming.method === "POST")
      response.end('{"id":"file-uploaded"}');
    else if (path.endsWith("/batches") && incoming.method === "POST") {
      if (failCreate) {
        response.statusCode = 400;
        response.end(
          '{"code":"ServiceCode","message":"original create error","request_id":"req-create"}',
        );
      } else response.end('{"id":"batch-one","status":"validating"}');
    } else if (path.includes("/batches?") || path.endsWith("/batches"))
      response.end(
        '{"data":[{"id":"batch-one","status":"completed"}],"has_more":true,"last_id":"batch-one"}',
      );
    else if (path.endsWith("/cancel")) response.end('{"id":"batch-one","status":"cancelling"}');
    else if (path.endsWith("/batches/batch-one"))
      response.end(
        JSON.stringify({
          id: "batch-one",
          status: state,
          output_file_id: "opaque-output",
          error_file_id: "opaque-error",
          request_counts: { total: 2, completed: 1, failed: 1 },
          errors: { data: [{ message: "original task error" }] },
        }),
      );
    else if (path.endsWith("/files/opaque-output/content"))
      response.end(invalidResult ? "not-json\n" : outputRecord);
    else if (path.endsWith("/files/opaque-error/content")) response.end(errorRecord);
    else if (path.endsWith("/chat/completions"))
      response.end('{"choices":[{"message":{"content":"hello"}}]}');
    else {
      response.statusCode = 404;
      response.end('{"message":"unexpected path"}');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Local server required");
  baseUrl = `http://127.0.0.1:${address.port}`;
  environment = {
    BAILIAN_CONFIG_DIR: directory,
    HOME: directory,
    USERPROFILE: directory,
    DASHSCOPE_API_KEY: "",
    DASHSCOPE_BASE_URL: "",
    HTTP_PROXY: "",
    HTTPS_PROXY: "",
    http_proxy: "",
    https_proxy: "",
    NODE_OPTIONS: "",
    DASHSCOPE_TIMEOUT: "",
  };
});
afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(directory, { recursive: true, force: true });
});
function local(args: string[]) {
  return runCommandE2e(
    BATCH_ROUTES,
    [...args, "--api-key", "offline-test-only", "--base-url", baseUrl, "--output", "json"],
    environment,
  );
}
function dry(args: string[]) {
  return runCommandInProcess(
    BATCH_ROUTES,
    [
      ...args,
      "--dry-run",
      ...(args[1] === "convert" ? [] : ["--base-url", baseUrl]),
      "--output",
      "json",
    ],
    environment,
  );
}

describe("e2e: Batch（离线服务 fixture，不调用云端）", () => {
  test.each([["--input-file", "input.jsonl"], ["--output-file", "result.jsonl"], ["--force"]])(
    "text chat 拒绝已移除的文件参数 %j",
    async (...removedFlags: string[]) => {
      const before = await readdir(directory);
      const result = await runCommandInProcess(
        TEXT_CHAT_ROUTES,
        [
          "text",
          "chat",
          "--batch",
          "--message",
          "hello",
          ...removedFlags,
          "--api-key",
          "offline-test-only",
          "--base-url",
          baseUrl,
        ],
        environment,
      );
      expect(result.exitCode, result.stderr).toBe(2);
      expect(result.stderr).toMatch(/Unknown (?:flag|option)|未知(?:参数|选项)/i);
      expect(result.stderr).toContain(removedFlags[0]);
      expect(requests).toEqual([]);
      expect(await readdir(directory)).toEqual(before);
    },
  );
  test.each(["en-US", "zh-CN"])(
    "%s Batch Chat Help 仅展示单次请求并指向异步文件入口",
    async (language) => {
      await writeFile(
        join(directory, "config.json"),
        JSON.stringify({ language, telemetry: false }),
      );
      const result = await runCommandInProcess(
        TEXT_CHAT_ROUTES,
        ["text", "chat", "--help"],
        environment,
      );
      expect(result.exitCode).toBe(0);
      for (const removedFlag of ["--input-file", "--output-file", "--force"])
        expect(result.stderr).not.toContain(removedFlag);
      expect(result.stderr).toContain("--messages-file");
      expect(result.stderr).toContain("batch create/get/download");
      expect(result.stderr).toContain(language === "zh-CN" ? "单次同步" : "one synchronous");
      expect(requests).toEqual([]);
    },
  );
  test.each(["convert", "create", "list", "get", "cancel", "download"])(
    "%s --help 包含 Usage、参数和双语支持",
    async (verb) => {
      const result = await runCommandHelp(BATCH_ROUTES, ["batch", verb, "--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain(`batch ${verb}`);
      if (["convert", "create"].includes(verb))
        expect(result.stderr).toContain('"custom_id":"req-001"');
      if (verb === "download") expect(result.stderr).toContain("result.csv:");
    },
  );
  test.each([
    ["convert"],
    ["convert", "--file", "unused.csv"],
    ["convert", "--file", "unused.csv", "--model", "qwen-plus"],
    ["create"],
    ["get"],
    ["cancel"],
    ["download"],
  ])("缺参为 USAGE：%j", async (...args: string[]) => {
    const result = await dry(["batch", ...args]);
    expect(result.exitCode, result.stderr).toBe(2);
    expect(requests).toEqual([]);
  });
  test("CSV convert 不需要凭证并实际写出 JSONL；dry-run 不写目录", async () => {
    const target = join(directory, "converted.jsonl");
    const result = await runCommandE2e(
      BATCH_ROUTES,
      [
        "batch",
        "convert",
        "--file",
        join(directory, "input.csv"),
        "--output-file",
        target,
        "--model",
        "qwen-plus",
        "--output",
        "json",
      ],
      environment,
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect((await readFile(target, "utf8")).split("\n")[0]).toContain('"custom_id":"00123"');
    const preview = await dry([
      "batch",
      "convert",
      "--file",
      join(directory, "input.csv"),
      "--output-file",
      join(directory, "absent", "input.jsonl"),
      "--model",
      "qwen-plus",
    ]);
    expect(preview.exitCode, preview.stderr).toBe(0);
    expect(await readdir(directory)).not.toContain("absent");
    expect(requests).toEqual([]);
  });
  test("create dry-run 推导 endpoint 和 metadata，其他 dry-run 无业务请求/产物", async () => {
    const result = await dry([
      "batch",
      "create",
      "--file",
      join(directory, "input.jsonl"),
      "--completion-window",
      "7d",
      "--name",
      "eval",
      "--metadata",
      "tag=a=b",
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(parseStdoutJson(result.stdout)).toMatchObject({
      request: {
        endpoint: "/v1/chat/completions",
        completion_window: "7d",
        metadata: { ds_name: "eval", tag: "a=b" },
      },
      validation: { records: 1 },
      upload: { purpose: "batch" },
    });
    for (const verb of ["get", "cancel", "download"]) {
      const preview = await dry([
        "batch",
        verb,
        "--batch-id",
        "batch-one",
        ...(verb === "download" ? ["--out-dir", join(directory, "absent"), "--csv"] : []),
      ]);
      expect(preview.exitCode, preview.stderr).toBe(0);
    }
    expect((await dry(["batch", "list"])).exitCode).toBe(0);
    expect(requests).toEqual([]);
    expect(await readdir(directory)).not.toContain("absent");
  });
  test.each([
    ["create", "--file", "unused", "--input-file-id", "file-one"],
    ["create", "--input-file-id", "file-one"],
    [
      "create",
      "--input-file-id",
      "file-one",
      "--endpoint",
      "/v1/chat/completions",
      "--completion-window",
      "23h",
    ],
    [
      "create",
      "--input-file-id",
      "file-one",
      "--endpoint",
      "/v1/chat/completions",
      "--metadata",
      "ds_name=reserved",
    ],
    [
      "create",
      "--input-file-id",
      "file-one",
      "--endpoint",
      "/v1/chat/completions",
      "--metadata",
      "tag=one",
      "--metadata",
      "tag=two",
    ],
    ["list", "--limit", "101"],
    ["list", "--created-after", "20260230000000"],
    ["get", "--batch-id", "batch-one", "--interval", "65"],
    ["get", "--batch-id", "batch-one", "--follow", "--interval", "59"],
  ])("参数校验在请求前：%j", async (...args: string[]) => {
    expect((await dry(["batch", ...args])).exitCode).toBe(2);
    expect(requests).toEqual([]);
  });
  test("本地 create 返回 validating 任务 ID，不轮询也不写本地结果", async () => {
    const before = await readdir(directory);
    const result = await local(["batch", "create", "--file", join(directory, "input.jsonl")]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(parseStdoutJson(result.stdout)).toMatchObject({ id: "batch-one", status: "validating" });
    expect(requests.map((request) => [request.method, request.path])).toEqual([
      ["POST", "/compatible-mode/v1/files"],
      ["POST", "/compatible-mode/v1/batches"],
    ]);
    expect(await readdir(directory)).toEqual(before);
  });
  test("本地 create 只上传一次再创建，不自动等待；失败可复用上传 ID", async () => {
    failCreate = true;
    const result = await local(["batch", "create", "--file", join(directory, "input.jsonl")]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("original create error");
    expect(result.stderr).toContain("file-uploaded");
    expect(requests.map((request) => request.path)).toEqual([
      "/compatible-mode/v1/files",
      "/compatible-mode/v1/batches",
    ]);
    expect(requests[0].body).toContain('name="purpose"\r\n\r\nbatch');
    expect(JSON.parse(requests[1].body)).toMatchObject({
      input_file_id: "file-uploaded",
      endpoint: "/v1/chat/completions",
    });
  });
  test("远端 create 无上传，list 单页保留 cursor，cancel 不假装 cancelled", async () => {
    const created = await local([
      "batch",
      "create",
      "--input-file-id",
      "oss:cn-beijing:bucket/input.jsonl",
      "--endpoint",
      "/v1/chat/completions",
    ]);
    expect(created.exitCode, created.stderr).toBe(0);
    expect(requests).toHaveLength(1);
    const listed = await local(["batch", "list", "--status", "completed", "--status", "expired"]);
    expect(parseStdoutJson(listed.stdout)).toMatchObject({ has_more: true, last_id: "batch-one" });
    const cancelled = await local(["batch", "cancel", "--batch-id", "batch-one"]);
    expect(parseStdoutJson(cancelled.stdout)).toMatchObject({ status: "cancelling" });
  });
  test("单次 failed get 成功退出，follow 输出详情后透传终态错误", async () => {
    state = "failed";
    const single = await local(["batch", "get", "--batch-id", "batch-one"]);
    expect(single.exitCode, single.stderr).toBe(0);
    expect(parseStdoutJson(single.stdout)).toMatchObject({ status: "failed" });
    const followed = await local(["batch", "get", "--batch-id", "batch-one", "--follow"]);
    expect(followed.exitCode).toBe(1);
    expect(parseStdoutJson(followed.stdout)).toMatchObject({ status: "failed" });
    expect(followed.stderr).toContain("original task error");
  });
  test("completed 含失败行仍成功，download 按返回 ID 保真下载并导出 CSV，拒覆盖", async () => {
    const followed = await local(["batch", "get", "--batch-id", "batch-one", "--follow"]);
    expect(followed.exitCode, followed.stderr).toBe(0);
    const outDir = join(directory, "download");
    const result = await local([
      "batch",
      "download",
      "--batch-id",
      "batch-one",
      "--out-dir",
      outDir,
      "--csv",
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(await readFile(join(outDir, "result.jsonl"), "utf8")).toBe(outputRecord);
    expect(await readFile(join(outDir, "error.jsonl"), "utf8")).toBe(errorRecord);
    expect(await readFile(join(outDir, "result.csv"), "utf8")).toContain(
      "00123,qwen-plus,req,200,hello",
    );
    expect(parseStdoutJson(result.stdout)).toMatchObject({
      line_counts: { "result.jsonl": 1, "error.jsonl": 1 },
      csv: { records: 2, unknown_records: 0 },
    });
    const again = await local([
      "batch",
      "download",
      "--batch-id",
      "batch-one",
      "--out-dir",
      outDir,
    ]);
    expect(again.exitCode).toBe(1);
    expect(again.stderr).toMatch(/force/);
    expect(await readdir(outDir)).toEqual(
      expect.arrayContaining(["result.jsonl", "error.jsonl", "result.csv"]),
    );
  });
  test("CSV 失败保留 JSONL、报告失败阶段；force 重跑恢复", async () => {
    invalidResult = true;
    const outDir = join(directory, "download");
    const result = await local([
      "batch",
      "download",
      "--batch-id",
      "batch-one",
      "--out-dir",
      outDir,
      "--csv",
    ]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/CSV.*Preserved|CSV.*已保留/);
    expect(await readdir(outDir)).toEqual(expect.arrayContaining(["result.jsonl", "error.jsonl"]));
    expect(await readdir(outDir)).not.toContain("result.csv");
    invalidResult = false;
    const restored = await local([
      "batch",
      "download",
      "--batch-id",
      "batch-one",
      "--out-dir",
      outDir,
      "--csv",
      "--force",
    ]);
    expect(restored.exitCode, restored.stderr).toBe(0);
  });
  test("非终态 download 不写输出文件", async () => {
    state = "cancelling";
    const result = await local([
      "batch",
      "download",
      "--batch-id",
      "batch-one",
      "--out-dir",
      join(directory, "absent"),
    ]);
    expect(result.exitCode).toBe(1);
    expect(await readdir(directory)).not.toContain("absent");
  });
  test.each(["en-US", "zh-CN"])("%s Help 给出可保存的数据样例", async (language) => {
    await writeFile(join(directory, "config.json"), JSON.stringify({ language, telemetry: false }));
    const result = await runCommandInProcess(
      BATCH_ROUTES,
      ["batch", "convert", "--help"],
      environment,
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stderr).toContain("custom_id,content");
    expect(result.stderr).toContain(language === "zh-CN" ? "请介绍一下自己" : "Introduce yourself");
    expect(requests).toEqual([]);
  });
  test.each([
    ["--prime"],
    ["--api", "responses"],
    ["--stream"],
    ["--timeout", "59"],
    ["--timeout", "3601"],
  ])("Batch Chat 参数冲突/超时界限为 USAGE：%j", async (...args: string[]) => {
    const result = await runCommandInProcess(
      TEXT_CHAT_ROUTES,
      ["text", "chat", "--batch", "--message", "hello", "--dry-run", "--output", "json", ...args],
      environment,
    );
    expect(result.exitCode, result.stderr).toBe(2);
    expect(requests).toEqual([]);
  });
  test("Batch Chat 地址/超时遵循 flag > env > 命名 Profile，默认不被改为 3600", async () => {
    const args = ["text", "chat", "--batch", "--message", "hello", "--dry-run", "--output", "json"];
    const defaultResult = await runCommandInProcess(TEXT_CHAT_ROUTES, args, environment);
    expect(defaultResult.exitCode, defaultResult.stderr).toBe(0);
    expect(parseStdoutJson(defaultResult.stdout)).toMatchObject({
      endpoint: "https://batch.dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      timeout: 300,
      request: { stream: false },
    });
    await writeFile(
      join(directory, "config.json"),
      JSON.stringify({
        language: "en-US",
        telemetry: false,
        timeout: 61,
        verify: { base_url: "https://profile.example.test", timeout: 90 },
      }),
    );
    const profileArgs = [...args, "--config", "verify"];
    const profile = await runCommandInProcess(TEXT_CHAT_ROUTES, profileArgs, environment);
    expect(profile.exitCode, profile.stderr).toBe(0);
    expect(parseStdoutJson(profile.stdout)).toMatchObject({
      endpoint: "https://profile.example.test/compatible-mode/v1/chat/completions",
      timeout: 90,
    });
    const env = {
      ...environment,
      DASHSCOPE_BASE_URL: "https://env.example.test",
      DASHSCOPE_TIMEOUT: "120",
    };
    const fromEnv = await runCommandInProcess(TEXT_CHAT_ROUTES, profileArgs, env);
    expect(fromEnv.exitCode, fromEnv.stderr).toBe(0);
    expect(parseStdoutJson(fromEnv.stdout)).toMatchObject({
      endpoint: "https://env.example.test/compatible-mode/v1/chat/completions",
      timeout: 120,
    });
    const fromFlag = await runCommandInProcess(
      TEXT_CHAT_ROUTES,
      [...profileArgs, "--base-url", baseUrl, "--timeout", "3600"],
      env,
    );
    expect(fromFlag.exitCode, fromFlag.stderr).toBe(0);
    expect(parseStdoutJson(fromFlag.stdout)).toMatchObject({
      endpoint: `${baseUrl}/compatible-mode/v1/chat/completions`,
      timeout: 3600,
    });
    expect(requests).toEqual([]);
  });
  test.each([
    "https://dashscope.aliyuncs.com",
    "https://dashscope-intl.aliyuncs.com",
    "https://token-plan.cn-beijing.maas.aliyuncs.com",
  ])("Batch Chat 拒绝 env/Profile 已知非 Batch 地址：%s", async (host) => {
    const args = ["text", "chat", "--batch", "--message", "hello", "--dry-run"];
    const fromEnv = await runCommandInProcess(TEXT_CHAT_ROUTES, args, {
      ...environment,
      DASHSCOPE_BASE_URL: host,
    });
    expect(fromEnv.exitCode, fromEnv.stderr).toBe(2);
    await writeFile(
      join(directory, "config.json"),
      JSON.stringify({ language: "en-US", telemetry: false, verify: { base_url: host } }),
    );
    const profile = await runCommandInProcess(
      TEXT_CHAT_ROUTES,
      [...args, "--config", "verify"],
      environment,
    );
    expect(profile.exitCode, profile.stderr).toBe(2);
    const override = await runCommandInProcess(
      TEXT_CHAT_ROUTES,
      [...args, "--config", "verify", "--base-url", "https://batch.dashscope.aliyuncs.com"],
      environment,
    );
    expect(override.exitCode, override.stderr).toBe(0);
    expect(requests).toEqual([]);
  });
  test("Batch Chat 在真实命令 TTY 分支仍非流式；普通/Responses/Prime 保持请求形状", async () => {
    const args = ["text", "chat", "--batch", "--message", "hello", "--dry-run", "--output", "json"];
    const isolated = buildIsolatedCliEnv({ overrides: environment });
    try {
      const result = await runInProcess(
        () => {
          process.stdout.isTTY = true;
          return withHarnessUpdateFixture(() =>
            createCli({ "text chat": textChat }, E2E_HARNESS_IDENTITY).run(args),
          );
        },
        args,
        { env: isolated.env },
      );
      expect(result.exitCode, result.stderr).toBe(0);
      expect(parseStdoutJson(result.stdout)).toMatchObject({ request: { stream: false } });
    } finally {
      isolated.dispose();
    }
    for (const [flags, request] of [
      [[], { messages: [{ role: "user", content: "hello" }], max_tokens: 4096 }],
      [
        ["--api", "responses"],
        { input: [{ role: "user", content: "hello" }], max_output_tokens: 4096 },
      ],
      [
        ["--prime", "--workspace-id", "ws-test", "--model", "glm-5.3-prime"],
        { model: "glm-5.3-prime", messages: [{ role: "user", content: "hello" }] },
      ],
    ] as const) {
      const result = await runCommandInProcess(
        TEXT_CHAT_ROUTES,
        ["text", "chat", "--message", "hello", "--dry-run", "--output", "json", ...flags],
        environment,
      );
      expect(result.exitCode, result.stderr).toBe(0);
      const data = parseStdoutJson(result.stdout);
      expect(data).toMatchObject({ request });
      expect(data).not.toHaveProperty("timeout");
      if (!flags.some((flag) => flag === "--prime")) expect(data).not.toHaveProperty("endpoint");
    }
    expect(requests).toEqual([]);
  });
  test("Ctrl-C 命令退出 130、移除自身监听且不调用远端 cancel", async () => {
    state = "in_progress";
    interruptOnQuery = true;
    const args = [
      "batch",
      "get",
      "--batch-id",
      "batch-one",
      "--follow",
      "--api-key",
      "offline-test-only",
      "--base-url",
      baseUrl,
      "--output",
      "json",
    ];
    const isolated = buildIsolatedCliEnv({ overrides: environment });
    let listenersBefore: ReturnType<typeof process.rawListeners> = [];
    let listenersAfter: ReturnType<typeof process.rawListeners> = [];
    try {
      const result = await runInProcess(
        async () => {
          const cli = createCli({ "batch get": batchGet }, E2E_HARNESS_IDENTITY);
          listenersBefore = process.rawListeners("SIGINT");
          try {
            await withHarnessUpdateFixture(() => cli.run(args));
          } finally {
            listenersAfter = process.rawListeners("SIGINT");
          }
        },
        args,
        { env: isolated.env },
      );
      expect(result.exitCode, result.stderr).toBe(130);
      expect(result.stderr).toContain("remote task was not cancelled");
      expect(listenersAfter).toEqual(listenersBefore);
      expect(requests.map((request) => request.path)).toEqual([
        "/compatible-mode/v1/batches/batch-one",
      ]);
    } finally {
      isolated.dispose();
    }
  });
  test("Batch Chat messages-file 为同一请求的完整对话，仅 POST 一次", async () => {
    const messages = [
      { role: "system", content: "请简短回答" },
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
      { role: "user", content: "how are you?" },
    ];
    const messagesFile = join(directory, "messages.json");
    await writeFile(messagesFile, JSON.stringify(messages));
    const result = await runCommandE2e(
      TEXT_CHAT_ROUTES,
      [
        "text",
        "chat",
        "--batch",
        "--messages-file",
        messagesFile,
        "--model",
        "qwen-plus",
        "--api-key",
        "offline-test-only",
        "--base-url",
        baseUrl,
        "--output",
        "json",
      ],
      environment,
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("POST");
    expect(requests[0].path).toBe("/compatible-mode/v1/chat/completions");
    expect(JSON.parse(requests[0].body)).toMatchObject({ messages, stream: false });
  });
  test("Batch Chat 同步复用 Chat 请求，仅 POST 一次且 stream=false", async () => {
    const result = await runCommandE2e(
      TEXT_CHAT_ROUTES,
      [
        "text",
        "chat",
        "--batch",
        "--message",
        "hello",
        "--model",
        "qwen-plus",
        "--timeout",
        "60",
        "--api-key",
        "offline-test-only",
        "--base-url",
        baseUrl,
        "--output",
        "json",
      ],
      environment,
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("POST");
    expect(requests[0].path).toBe("/compatible-mode/v1/chat/completions");
    expect(JSON.parse(requests[0].body)).toMatchObject({ stream: false, model: "qwen-plus" });
  });
});

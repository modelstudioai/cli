import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
import * as commands from "../../src/index.ts";
import baseline from "./fixtures/inference-output.json" with { type: "json" };
const identity = { binName: "bl", version: "0.0.0", clientName: "test", npmPackage: "test" };
const retained = { future: { values: [false, 0, null, []] } };
const chat = {
  id: "chat-fixture",
  object: "chat.completion",
  model: "qwen-fixture",
  choices: [
    { index: 0, message: { role: "assistant", content: "Hello fixture" }, finish_reason: "stop" },
  ],
  usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
  ...retained,
};
const responses = {
  id: "response-fixture",
  status: "completed",
  output: [
    {
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: "Hello fixture" }],
    },
  ],
  usage: { input_tokens: 2, output_tokens: 3 },
  ...retained,
};
const app = {
  request_id: "app-request",
  output: { text: "Hello fixture", session_id: "session-fixture", ...retained },
  usage: { models: [{ input_tokens: 2, output_tokens: 3 }] },
};
const rpcResult = {
  isError: false,
  content: [
    {
      type: "text",
      text: JSON.stringify({
        pages: [
          {
            title: "Fixture",
            url: "https://example.com/fixture",
            snippet: "fixture snippet",
            hostname: "example.com",
          },
        ],
      }),
    },
    { type: "text", text: "extra result" },
  ],
  structuredContent: retained,
};
const sse = (payloads: unknown[]) =>
  payloads
    .map(
      (payload) =>
        "data: " + (typeof payload === "string" ? payload : JSON.stringify(payload)) + "\n\n",
    )
    .join("");
const chatStream = sse([
  { choices: [{ delta: { content: "Hello " } }] },
  {
    choices: [{ delta: { content: "fixture" }, finish_reason: "stop" }],
    usage: { total_tokens: 5 },
  },
  "[DONE]",
]);
const responseStream = sse([
  { type: "response.output_text.delta", delta: "Hello " },
  { type: "response.output_text.delta", delta: "fixture" },
  { type: "response.completed", response: responses },
  "[DONE]",
]);
const appStream = sse([
  {
    output: {
      text: "Hello ",
      session_id: "session-fixture",
      thoughts: [
        {
          thought: "fixture thought",
          action_name: "fixture action",
          action_input: "input",
          observation: "fixture observation",
        },
      ],
    },
  },
  { output: { text: "fixture", session_id: "session-fixture" } },
  "[DONE]",
]);
interface Scenario {
  name: string;
  command: AnyCommand;
  flags: Record<string, unknown>;
  kind:
    | "chat"
    | "responses"
    | "app"
    | "omni"
    | "knowledge"
    | "console"
    | "apps"
    | "decision"
    | "file"
    | "search";
  stream?: boolean;
}
const scenarios: Scenario[] = [
  {
    name: "text chat",
    command: commands.textChat,
    flags: { model: "qwen-fixture", message: ["user:fixture prompt"] },
    kind: "chat",
  },
  {
    name: "text stream",
    command: commands.textChat,
    flags: { model: "qwen-fixture", message: ["user:fixture prompt"], stream: true },
    kind: "chat",
    stream: true,
  },
  {
    name: "responses",
    command: commands.textChat,
    flags: { model: "qwen-fixture", message: ["fixture prompt"], api: "responses" },
    kind: "responses",
  },
  {
    name: "responses stream",
    command: commands.textChat,
    flags: { model: "qwen-fixture", message: ["fixture prompt"], api: "responses", stream: true },
    kind: "responses",
    stream: true,
  },
  {
    name: "vision",
    command: commands.visionDescribe,
    flags: {
      model: "qwen-fixture",
      prompt: "fixture prompt",
      image: "https://example.com/fixture.png",
    },
    kind: "chat",
  },
  {
    name: "app call",
    command: commands.appCall,
    flags: { appId: "app-fixture", prompt: "fixture prompt", sessionId: "session-input" },
    kind: "app",
  },
  {
    name: "app stream",
    command: commands.appCall,
    flags: { appId: "app-fixture", prompt: "fixture prompt", stream: true, hasThoughts: true },
    kind: "app",
    stream: true,
  },
  {
    name: "omni",
    command: commands.textOmni,
    flags: { model: "qwen-fixture", message: ["fixture prompt"], textOnly: true },
    kind: "omni",
    stream: true,
  },
  {
    name: "knowledge chat",
    command: commands.knowledgeChat,
    flags: { agentId: "agent-fixture", workspaceId: "ws-fixture", message: ["fixture prompt"] },
    kind: "knowledge",
    stream: true,
  },
  {
    name: "console call",
    command: commands.consoleCall,
    flags: { api: "fixture.api", data: '{"fixture":false}' },
    kind: "console",
  },
  { name: "app list", command: commands.appList, flags: { page: 2, pageSize: 5 }, kind: "apps" },
  {
    name: "decision",
    command: commands.decisionPredict,
    flags: {
      state: '{"content":"fixture state"}',
      questions: '{"answer":{"type":"noul"}}',
      workspaceId: "ws-fixture",
    },
    kind: "decision",
  },
  {
    name: "file upload",
    command: commands.fileUpload,
    flags: { model: "qwen-fixture" },
    kind: "file",
  },
  {
    name: "search",
    command: commands.searchWeb,
    flags: { query: "fixture query", count: 2 },
    kind: "search",
  },
  {
    name: "search list tools",
    command: commands.searchWeb,
    flags: { listTools: true },
    kind: "search",
  },
];
const displays = ["json", "text"].flatMap((format) =>
  [false, true].flatMap((quiet) =>
    [false, true].flatMap((verbose) =>
      [false, true].map((tty) => ({ format: format as "json" | "text", quiet, verbose, tty })),
    ),
  ),
);
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
async function invoke(
  scenario: Scenario,
  display: (typeof displays)[number],
  options: { dryRun?: boolean; streamBody?: string; fail?: boolean; audioOut?: string } = {},
) {
  let stdout = "",
    stderr = "",
    rawOut = "",
    rawErr = "";
  const requests: unknown[] = [];
  const stdoutTTY = Object.getOwnPropertyDescriptor(process.stdout, "isTTY"),
    stderrTTY = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");
  Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: display.tty });
  Object.defineProperty(process.stderr, "isTTY", { configurable: true, value: display.tty });
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout += String(chunk);
    rawOut += String(chunk);
    return true;
  });
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    stderr += String(chunk);
    rawErr += String(chunk);
    return true;
  });
  const directory = await mkdtemp(join(tmpdir(), "inference-output-"));
  const file = join(directory, "inference-input.txt");
  await writeFile(file, "inference fixture");
  const transport = vi.spyOn(httpTransport, "fetch").mockImplementation(async (url, init) => {
    const address = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    let body: unknown = init?.body ?? null;
    let json: Record<string, unknown> = {};
    if (typeof body === "string") {
      try {
        json = JSON.parse(body);
        body = json;
      } catch {
        const params = new URLSearchParams(typeof body === "string" ? body : "");
        body = params.has("params") ? JSON.parse(params.get("params")!) : body;
      }
    }
    if (body instanceof FormData) {
      const fields: Record<string, unknown> = {};
      for (const [key, value] of body.entries())
        fields[key] =
          typeof value === "string" ? value : { name: value.name, text: await value.text() };
      body = fields;
    }
    requests.push({ url: address, method: init?.method ?? "GET", body });
    if (options.fail)
      return new Response(
        JSON.stringify({
          code: "FixtureFailure",
          message: "original failure",
          request_id: "failed-request",
        }),
        { status: 400 },
      );
    if (options.streamBody !== undefined)
      return new Response(options.streamBody, { headers: { "Content-Type": "text/event-stream" } });
    if (scenario.kind === "file") {
      if (address.includes("getPolicy"))
        return Response.json({
          data: {
            upload_host: "https://storage.fixture.invalid",
            upload_dir: "fixture",
            oss_access_key_id: "fixture-access",
            signature: "fixture-signature",
            policy: "fixture-policy",
            x_oss_object_acl: "private",
            x_oss_forbid_overwrite: "true",
          },
        });
      return new Response("", { status: 200 });
    }
    if (scenario.kind === "search") {
      if (String(json.method).startsWith("notifications/"))
        return new Response(null, { status: 204 });
      return Response.json({
        jsonrpc: "2.0",
        id: json.id,
        result:
          json.method === "initialize"
            ? {
                protocolVersion: "2025-03-26",
                capabilities: {},
                serverInfo: { name: "fixture", version: "1" },
              }
            : json.method === "tools/list"
              ? {
                  tools: [
                    {
                      name: "bailian_web_search",
                      description: "fixture",
                      inputSchema: { type: "object" },
                    },
                  ],
                }
              : rpcResult,
      });
    }
    if (scenario.kind === "knowledge")
      return new Response(
        await readFile("packages/commands/tests/knowledge/fixtures/rag-media-chat.sse", "utf8"),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    if (scenario.kind === "console")
      return Response.json({ data: { DataV2: { data: { data: { value: false, ...retained } } } } });
    if (scenario.kind === "apps")
      return Response.json({
        data: {
          DataV2: {
            data: {
              data: {
                list: [
                  { code: "app-fixture", name: "Fixture app", config: { user_prompt_params: [] } },
                ],
                total: 7,
              },
            },
          },
        },
      });
    if (scenario.kind === "decision")
      return Response.json({
        answers: { answer: { value: false, confidence: 0 } },
        usage: { input_tokens: 0 },
        latency_ms: 0,
        request_id: "decision-request",
        ...retained,
      });
    const streaming =
      scenario.stream ||
      json.stream === true ||
      (json.parameters as Record<string, unknown> | undefined)?.incremental_output === true;
    if (scenario.kind === "omni" || streaming)
      return new Response(
        scenario.kind === "responses"
          ? responseStream
          : scenario.kind === "app"
            ? appStream
            : chatStream,
        { headers: { "Content-Type": "text/event-stream" } },
      );
    return Response.json(
      scenario.kind === "responses" ? responses : scenario.kind === "app" ? app : chat,
    );
  });
  const settings = buildSettings({
    flags: {
      output: display.format,
      quiet: display.quiet,
      verbose: display.verbose,
      dryRun: options.dryRun,
    },
    env: {},
    file: {},
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
  const resultSpy = vi.spyOn(reporter.output, "result");
  const client = new Client({
    identity,
    settings,
    baseUrl: "https://fixture.invalid",
    apiCred: { token: "fixture-api-token", source: "flag", baseUrl: "https://fixture.invalid" },
    consoleCred: {
      token: "fixture-console-token",
      region: "cn-beijing",
      site: "domestic",
      source: "flag",
    },
    debug: (record) => reporter.output.debug(record),
  });
  let exitCode = 0;
  try {
    await scenario.command.run({
      identity,
      settings,
      flags: {
        ...scenario.flags,
        ...(scenario.kind === "file" ? { file } : {}),
        ...(options.audioOut ? { audioOut: options.audioOut } : {}),
      },
      client,
      localize,
      output: reporter.output,
    } as never);
  } catch (error) {
    exitCode = reporter.error(error);
  } finally {
    transport.mockRestore();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    if (stdoutTTY) Object.defineProperty(process.stdout, "isTTY", stdoutTTY);
    else Reflect.deleteProperty(process.stdout, "isTTY");
    if (stderrTTY) Object.defineProperty(process.stderr, "isTTY", stderrTTY);
    else Reflect.deleteProperty(process.stderr, "isTTY");
    await rm(directory, { recursive: true, force: true });
  }
  return {
    stdout,
    stderr,
    rawOut,
    rawErr,
    requests,
    results: resultSpy.mock.calls.length,
    exitCode,
  };
}

const fixture = baseline as Record<string, { stdout: string; data?: unknown; requests: unknown[] }>;
for (const scenario of scenarios) {
  test.each(displays)(
    `${scenario.name}: stable results, request parity and JSON diagnostics %j`,
    async (display) => {
      const result = await invoke(scenario, display);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.results).toBe(1);
      const expected = fixture[scenario.name + ":" + display.format + ":" + display.tty]!;
      expect(result.requests).toEqual(expected.requests);
      if (display.format === "json") {
        expect(result.rawOut).toBe("");
        expect(result.rawErr).toBe("");
        expect(JSON.parse(result.stdout)).toEqual(expected.data);
        for (const line of result.stderr.trim().split("\n").filter(Boolean))
          expect(() => JSON.parse(line)).not.toThrow();
      } else if (scenario.kind === "knowledge" && display.tty && display.quiet) {
        expect(result.stdout.match(/最终答案/g)).toHaveLength(1);
        expect(result.stdout).toContain("Sources:");
        expect(result.stdout).toContain("https://example.com/video.mp4");
        expect(result.stdout).not.toContain("规划内容");
      } else expect(result.stdout).toBe(expected.stdout);
    },
  );
  test.each([false, true])(
    `${scenario.name}: JSON dry-run makes no HTTP calls, quiet=%s`,
    async (quiet) => {
      const result = await invoke(
        scenario,
        { format: "json", quiet, verbose: true, tty: false },
        { dryRun: true },
      );
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.requests).toEqual([]);
      expect(result.results).toBe(1);
      expect(result.rawOut + result.rawErr).toBe("");
      expect(JSON.parse(result.stdout)).toBeTruthy();
    },
  );
}
test.each(displays)(
  "omni list-voices returns structured JSON and preserves the text table %j",
  async (display) => {
    const result = await invoke(
      { name: "voices", command: commands.textOmni, flags: { listVoices: true }, kind: "omni" },
      display,
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.results).toBe(1);
    expect(result.requests).toEqual([]);
    expect(result.rawOut + result.rawErr).toBe("");
    if (display.format === "json") {
      const data = JSON.parse(result.stdout);
      expect(data.total).toBe(13);
      expect(data.voices).toHaveLength(13);
      expect(data.voices[0]).toEqual({
        voice: "Tina",
        name: "甜妹",
        desc: "甜美亲切",
        lang: "中文/英文",
      });
    } else {
      expect(result.stdout).toContain("Omni output voices:");
      expect(result.stdout).toContain("VOICE ID");
      expect(result.stdout).toContain("Total: 13 voices");
    }
  },
);
const jsonDisplays = displays.filter((display) => display.format === "json");
for (const name of ["text stream", "app stream", "omni"]) {
  const scenario = scenarios.find((entry) => entry.name === name)!;
  test.each(jsonDisplays)(
    `${name}: SSE failures retain the raw message and API context %j`,
    async (display) => {
      const result = await invoke(scenario, display, {
        streamBody: sse([
          {
            code: "StreamFixtureError",
            message: "original stream failure",
            request_id: "stream-failed-request",
          },
        ]),
      });
      expect(result.exitCode).toBe(1);
      expect(result.stdout + result.rawOut + result.rawErr).toBe("");
      expect(result.results).toBe(0);
      const errors = result.stderr
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
        .filter((record) => record.error);
      expect(errors).toHaveLength(1);
      expect(errors[0].error).toMatchObject({
        message: "original stream failure",
        api_code: "StreamFixtureError",
        request_id: "stream-failed-request",
      });
    },
  );
}
test.each(jsonDisplays)(
  "Responses incomplete stream still fails before final JSON %j",
  async (display) => {
    const scenario = scenarios.find((entry) => entry.name === "responses stream")!;
    const result = await invoke(scenario, display, {
      streamBody: sse([{ type: "response.output_text.delta", delta: "partial" }]),
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.rawOut + result.rawErr).toBe("");
    expect(result.results).toBe(0);
    expect(result.stderr).toContain("Stream disconnected before completion");
  },
);
const audioStream = sse([
  {
    choices: [
      {
        delta: {
          content: "Hello fixture",
          audio: { data: Buffer.from([1, 2, 3, 4]).toString("base64") },
        },
      },
    ],
  },
  "[DONE]",
]);
test.each(jsonDisplays)(
  "omni JSON waits for real WAV persistence and retains metadata %j",
  async (display) => {
    const directory = await mkdtemp(join(tmpdir(), "inference-omni-audio-"));
    const file = join(directory, "output.wav");
    try {
      const result = await invoke(
        {
          name: "audio",
          command: commands.textOmni,
          flags: { message: ["fixture prompt"], model: "qwen-fixture", voice: "Tina" },
          kind: "omni",
          stream: true,
        },
        display,
        { audioOut: file, streamBody: audioStream },
      );
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.results).toBe(1);
      expect(result.rawOut + result.rawErr).toBe("");
      expect(JSON.parse(result.stdout)).toEqual({
        content: "Hello fixture",
        audio_saved: file,
        voice: "Tina",
      });
      const wav = await readFile(file);
      expect(wav.subarray(0, 4).toString()).toBe("RIFF");
      expect(wav.subarray(-4)).toEqual(Buffer.from([1, 2, 3, 4]));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
test.each(jsonDisplays)(
  "omni file failure never prefixes JSON with streamed text %j",
  async (display) => {
    const directory = await mkdtemp(join(tmpdir(), "inference-omni-failure-"));
    const file = join(directory, "missing", "output.wav");
    try {
      const result = await invoke(
        {
          name: "audio",
          command: commands.textOmni,
          flags: { message: ["fixture prompt"], model: "qwen-fixture", voice: "Tina" },
          kind: "omni",
          stream: true,
        },
        display,
        { audioOut: file, streamBody: audioStream },
      );
      expect(result.exitCode).toBe(1);
      expect(result.results).toBe(0);
      expect(result.stdout + result.rawOut + result.rawErr).toBe("");
      const errors = result.stderr
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
        .filter((record) => record.error);
      expect(errors).toHaveLength(1);
      expect(errors[0].error.message).toMatch(/ENOENT|no such file/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

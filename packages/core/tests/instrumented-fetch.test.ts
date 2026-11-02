import { httpTransport } from "../src/client/transport.ts";
import { afterEach, expect, test, vi } from "vite-plus/test";
import type { Identity, Settings } from "../src/index.ts";
import { createInstrumentedFetch, sourceConfig } from "../src/index.ts";

const identity: Identity = {
  binName: "bl",
  clientName: "bailian-cli",
  version: "1.2.3",
  npmPackage: "bailian-cli",
};

const settings: Settings = { timeout: 60, verbose: false } as Settings;

afterEach(() => vi.restoreAllMocks());

interface CapturedRequest {
  url: string;
  headers: Headers;
}

/** Run the wrapper against a stubbed httpTransport.fetch and capture what reaches it. */
async function capture(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<CapturedRequest> {
  const originalFetch = httpTransport.fetch;
  let captured: CapturedRequest | undefined;
  httpTransport.fetch = (async (fetchInput: string | URL | Request, fetchInit?: RequestInit) => {
    captured = {
      url:
        typeof fetchInput === "string"
          ? fetchInput
          : fetchInput instanceof URL
            ? fetchInput.href
            : fetchInput.url,
      headers: new Headers(fetchInit?.headers),
    };
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;

  try {
    await createInstrumentedFetch({ identity, settings })(input, init);
  } finally {
    httpTransport.fetch = originalFetch;
  }
  if (!captured) throw new Error("stubbed fetch was not called");
  return captured;
}

test("adds UA and tracking header on Alibaba Cloud hosts", async () => {
  const { headers } = await capture(
    "https://ws-1.cn-beijing.maas.aliyuncs.com/api/v1/agentstudio/agents",
    { method: "POST", headers: { Authorization: "Bearer k" } },
  );
  expect(headers.get("user-agent")).toBe("bailian-cli/1.2.3");
  expect(headers.get("x-dashscope-source-config")).toBe(
    JSON.stringify({
      channel: "bailian-cli",
      tags: { t1: "public", t2: "bl", t3: "1.2.3" },
    }),
  );
  expect(headers.get("x-dashscope-openapisource")).toBe("BailianCLI");
  expect(headers.get("x-dashscope-service")).toBe("bailian-cli");
  expect(headers.get("authorization")).toBe("Bearer k");
});

test("adds UA but no tracking header on third-party hosts", async () => {
  const { headers } = await capture("https://api.anthropic.com/v1/messages", {
    method: "POST",
  });
  expect(headers.get("user-agent")).toBe("bailian-cli/1.2.3");
  expect(headers.get("x-dashscope-source-config")).toBeNull();
  expect(headers.get("x-dashscope-openapisource")).toBeNull();
  expect(headers.get("x-dashscope-service")).toBeNull();
});

test("does not override a caller-provided User-Agent", async () => {
  const { headers } = await capture("https://dashscope.aliyuncs.com/api/v1/tasks/t1", {
    headers: { "User-Agent": "custom/9.9" },
  });
  expect(headers.get("user-agent")).toBe("custom/9.9");
});

test("does not invent a Content-Type (FormData boundary safety)", async () => {
  const { headers } = await capture("https://dashscope.aliyuncs.com/api/v1/files", {
    method: "POST",
  });
  expect(headers.get("content-type")).toBeNull();
});

test("passes non-URL-parseable inputs through without tracking headers", async () => {
  const { url, headers } = await capture("/relative/path");
  expect(url).toBe("/relative/path");
  expect(headers.get("x-dashscope-source-config")).toBeNull();
  expect(headers.get("x-dashscope-openapisource")).toBeNull();
  expect(headers.get("x-dashscope-service")).toBeNull();
});

test.each([200, 401])(
  "verbose 将 endpoint、状态和 request_id 写入 stderr（HTTP %s）",
  async (status) => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const response = new Response("原始正文", {
      status,
      headers: { "x-request-id": "transport-request" },
    });
    vi.spyOn(httpTransport, "fetch").mockResolvedValue(response);
    const result = await createInstrumentedFetch({
      identity,
      settings: { ...settings, verbose: true },
    })("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer test-secret-api-key" },
      body: "敏感提示词",
    });
    expect(result).toBe(response);
    expect(response.bodyUsed).toBe(false);
    const output = stderr.mock.calls.map(([chunk]) => String(chunk)).join("");
    expect(output).toContain(
      "> POST https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    );
    expect(output).toContain(`< ${status}`);
    expect(output).toContain("request_id: transport-request");
    expect(output).toContain("test...-key");
    expect(output).not.toContain("test-secret-api-key");
    expect(output).not.toContain("敏感提示词");
    expect(stdout).not.toHaveBeenCalled();
  },
);

test("未开启 verbose 时不输出诊断且保持响应与取消信号", async () => {
  const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  const response = new Response("data: [DONE]\n\n", {
    headers: { "x-request-id": "silent-request" },
  });
  const transport = vi.spyOn(httpTransport, "fetch").mockResolvedValue(response);
  const controller = new AbortController();
  const result = await createInstrumentedFetch({ identity, settings })("https://example.invalid", {
    signal: controller.signal,
  });
  expect(result).toBe(response);
  expect(response.bodyUsed).toBe(false);
  expect(transport.mock.calls[0][1]?.signal).toBe(controller.signal);
  expect(stderr).not.toHaveBeenCalled();
});

test("kscli 传输使用宿主身份与版本生成渠道头", async () => {
  const transport = vi.spyOn(httpTransport, "fetch").mockResolvedValue(new Response("{}"));
  const ksIdentity = {
    ...identity,
    binName: "kscli",
    clientName: "knowledge-studio-cli",
    version: "9.8.7",
  };
  await createInstrumentedFetch({ identity: ksIdentity, settings })(
    "https://dashscope.aliyuncs.com",
  );
  const headers = new Headers(transport.mock.calls[0][1]?.headers);
  expect(headers.get("user-agent")).toBe("knowledge-studio-cli/9.8.7");
  expect(headers.get("x-dashscope-source-config")).toBe(sourceConfig(ksIdentity));
});

test("uses kscli identity and version in source config", () => {
  expect(sourceConfig({ binName: "kscli", version: "1.13.1" })).toBe(
    JSON.stringify({
      channel: "bailian-cli",
      tags: { t1: "public", t2: "kscli", t3: "1.13.1" },
    }),
  );
});

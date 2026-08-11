import { expect, test } from "vite-plus/test";
import type { Identity, Settings } from "../src/index.ts";
import { createInstrumentedFetch, sourceConfig } from "../src/index.ts";

const identity: Identity = {
  binName: "bl",
  clientName: "bailian-cli",
  version: "1.2.3",
  npmPackage: "bailian-cli",
};

const settings: Settings = { timeout: 60, verbose: false } as Settings;

interface CapturedRequest {
  url: string;
  headers: Headers;
}

/** Run the wrapper against a stubbed globalThis.fetch and capture what reaches it. */
async function capture(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<CapturedRequest> {
  const originalFetch = globalThis.fetch;
  let captured: CapturedRequest | undefined;
  globalThis.fetch = (async (fetchInput: string | URL | Request, fetchInit?: RequestInit) => {
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
    globalThis.fetch = originalFetch;
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
  expect(headers.get("authorization")).toBe("Bearer k");
});

test("adds UA but no tracking header on third-party hosts", async () => {
  const { headers } = await capture("https://api.anthropic.com/v1/messages", {
    method: "POST",
  });
  expect(headers.get("user-agent")).toBe("bailian-cli/1.2.3");
  expect(headers.get("x-dashscope-source-config")).toBeNull();
  expect(headers.get("x-dashscope-openapisource")).toBeNull();
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
});

test("uses kscli identity and version in source config", () => {
  expect(sourceConfig({ binName: "kscli", version: "1.13.1" })).toBe(
    JSON.stringify({
      channel: "bailian-cli",
      tags: { t1: "public", t2: "kscli", t3: "1.13.1" },
    }),
  );
});

import { BailianError, ExitCode, type Identity, type Settings } from "bailian-cli-core";
import { expect, test } from "vite-plus/test";
import {
  apiKeyValidationCandidates,
  validateApiKey,
  type ApiKeyValidationOptions,
} from "../src/commands/auth/login-api-key.ts";

const identity: Identity = {
  binName: "bl",
  version: "test",
  npmPackage: "bailian-cli",
  clientName: "bailian-cli-test",
};

const settings: Settings = {
  output: "text",
  outputExplicit: false,
  timeout: 30,
  verbose: false,
  quiet: false,
  dryRun: false,
  watermark: true,
  telemetry: false,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

function candidateUrls(key: string, options: ApiKeyValidationOptions = {}): string[] {
  return apiKeyValidationCandidates(key, options).map((candidate) => candidate.modelsUrl);
}

async function captureValidationError(key: string): Promise<BailianError> {
  const error = await validateApiKey({ identity, settings }, key, {}).catch((caught) => caught);
  expect(error).toBeInstanceOf(BailianError);
  return error as BailianError;
}

test("sk-sp Key 只探测国内与国际 Token Plan /models", () => {
  expect(candidateUrls("sk-sp-placeholder")).toEqual([
    "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/models",
    "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/models",
  ]);
});

test("普通 sk / sk-ws Key 探测公共地域，且不会探测 Token Plan", () => {
  const expectedUrls = [
    "https://dashscope.aliyuncs.com/api/v1/models?page_no=1&page_size=1",
    "https://dashscope-intl.aliyuncs.com/api/v1/models?page_no=1&page_size=1",
    "https://dashscope-us.aliyuncs.com/api/v1/models?page_no=1&page_size=1",
    "https://cn-hongkong.dashscope.aliyuncs.com/api/v1/models?page_no=1&page_size=1",
  ];
  expect(candidateUrls("sk-placeholder")).toEqual(expectedUrls);
  expect(candidateUrls("sk-ws-placeholder")).toEqual(expectedUrls);
});

test("普通 Key 优先使用已保存地址，再尝试 Workspace 专属地址和公共地址", () => {
  expect(
    candidateUrls("sk-placeholder", {
      storedBaseUrl: "https://stored.example.com/api/v1",
      workspaceId: "llm-test-workspace",
    }),
  ).toEqual([
    "https://stored.example.com/api/v1/models?page_no=1&page_size=1",
    "https://llm-test-workspace.cn-beijing.maas.aliyuncs.com/api/v1/models?page_no=1&page_size=1",
    "https://llm-test-workspace.ap-southeast-1.maas.aliyuncs.com/api/v1/models?page_no=1&page_size=1",
    "https://llm-test-workspace.cn-hongkong.maas.aliyuncs.com/api/v1/models?page_no=1&page_size=1",
    "https://llm-test-workspace.ap-northeast-1.maas.aliyuncs.com/api/v1/models?page_no=1&page_size=1",
    "https://llm-test-workspace.eu-central-1.maas.aliyuncs.com/api/v1/models?page_no=1&page_size=1",
    "https://llm-test-workspace.us-east-1.maas.aliyuncs.com/api/v1/models?page_no=1&page_size=1",
    "https://dashscope.aliyuncs.com/api/v1/models?page_no=1&page_size=1",
    "https://dashscope-intl.aliyuncs.com/api/v1/models?page_no=1&page_size=1",
    "https://dashscope-us.aliyuncs.com/api/v1/models?page_no=1&page_size=1",
    "https://cn-hongkong.dashscope.aliyuncs.com/api/v1/models?page_no=1&page_size=1",
  ]);
});

test("其他格式 Key 不限制端点类型", () => {
  expect(
    apiKeyValidationCandidates("custom-key-placeholder", {}).map((candidate) => candidate.kind),
  ).toEqual(["ordinary", "ordinary", "ordinary", "ordinary", "token-plan", "token-plan"]);
});

test("显式 Base URL 只校验指定站点，并根据 Key 类型选择 /models 路径", () => {
  expect(
    candidateUrls("sk-sp-placeholder", {
      explicitBaseUrl: "https://custom.example.com/apps/anthropic?source=test",
    }),
  ).toEqual(["https://custom.example.com/compatible-mode/v1/models"]);
  expect(
    candidateUrls("sk-placeholder", {
      explicitBaseUrl: "https://workspace.example.com/compatible-mode/v1",
    }),
  ).toEqual(["https://workspace.example.com/api/v1/models?page_no=1&page_size=1"]);
});

test("Token Plan 多地区并行校验选择实际接受 Key 的国际站点", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ authorization: string; url: string }> = [];
  globalThis.fetch = async (input, init) => {
    const url = requestUrl(input);
    requests.push({
      authorization: new Headers(init?.headers).get("authorization") ?? "",
      url,
    });
    if (url.startsWith("https://token-plan.ap-southeast-1.maas.aliyuncs.com/")) {
      return jsonResponse({ data: [{ id: "qwen3.8-plus" }] });
    }
    return jsonResponse({ code: "InvalidApiKey", message: "invalid key" }, 401);
  };

  try {
    await expect(validateApiKey({ identity, settings }, "sk-sp-placeholder", {})).resolves.toEqual({
      baseUrl: "https://token-plan.ap-southeast-1.maas.aliyuncs.com",
      kind: "token-plan",
    });
    expect(requests).toEqual([
      {
        authorization: "Bearer sk-sp-placeholder",
        url: "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/models",
      },
      {
        authorization: "Bearer sk-sp-placeholder",
        url: "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/models",
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("所有候选站点明确拒绝 Key 时返回 AUTH 校验失败", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    jsonResponse({ code: "InvalidApiKey", message: "invalid key" }, 401);

  try {
    const error = await captureValidationError("sk-sp-placeholder");
    expect(error.exitCode).toBe(ExitCode.AUTH);
    expect(error.message).toMatch(/API key validation failed/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test.each([
  { name: "5xx", status: 503, message: "temporary outage" },
  { name: "429", status: 429, message: "too many requests" },
])("存在 $name 时校验结论不确定，不误报 Key 无效", async ({ status, message }) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    if (requestUrl(input).startsWith("https://dashscope.aliyuncs.com/")) {
      return jsonResponse({ code: "TemporaryFailure", message }, status);
    }
    return jsonResponse({ code: "InvalidApiKey", message: "invalid key" }, 401);
  };

  try {
    const error = await captureValidationError("sk-placeholder");
    expect(error.exitCode).toBe(ExitCode.GENERAL);
    expect(error.message).toBe(message);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

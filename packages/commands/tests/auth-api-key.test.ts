import { httpTransport } from "bailian-cli-core";
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

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
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
    "https://llm-test-workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/models",
    "https://llm-test-workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/models",
    "https://llm-test-workspace.cn-hongkong.maas.aliyuncs.com/compatible-mode/v1/models",
    "https://llm-test-workspace.ap-northeast-1.maas.aliyuncs.com/compatible-mode/v1/models",
    "https://llm-test-workspace.eu-central-1.maas.aliyuncs.com/compatible-mode/v1/models",
    "https://llm-test-workspace.us-east-1.maas.aliyuncs.com/compatible-mode/v1/models",
    "https://dashscope.aliyuncs.com/api/v1/models?page_no=1&page_size=1",
    "https://dashscope-intl.aliyuncs.com/api/v1/models?page_no=1&page_size=1",
    "https://dashscope-us.aliyuncs.com/api/v1/models?page_no=1&page_size=1",
    "https://cn-hongkong.dashscope.aliyuncs.com/api/v1/models?page_no=1&page_size=1",
  ]);
});

test("已保存的 Workspace MaaS 地址使用 Compatible /models", () => {
  expect(
    candidateUrls("sk-ws-placeholder", {
      storedBaseUrl: "https://ws-stored.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
    }),
  ).toEqual([
    "https://ws-stored.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/models",
    "https://dashscope.aliyuncs.com/api/v1/models?page_no=1&page_size=1",
    "https://dashscope-intl.aliyuncs.com/api/v1/models?page_no=1&page_size=1",
    "https://dashscope-us.aliyuncs.com/api/v1/models?page_no=1&page_size=1",
    "https://cn-hongkong.dashscope.aliyuncs.com/api/v1/models?page_no=1&page_size=1",
  ]);
});

test("Workspace 地域候选先于公共站点选择首个成功地域", async () => {
  const originalFetch = httpTransport.fetch;
  const workspaceOrigin = "https://llm-test-workspace.ap-southeast-1.maas.aliyuncs.com";
  httpTransport.fetch = async (input) => {
    const url = requestUrl(input);
    if (url === `${workspaceOrigin}/compatible-mode/v1/models`) {
      return jsonResponse({ object: "list", data: [{ id: "workspace-model" }] });
    }
    if (url.startsWith("https://dashscope-intl.aliyuncs.com/")) {
      return jsonResponse({ data: [{ id: "public-model" }] });
    }
    const status = url.includes(".maas.aliyuncs.com/") ? 404 : 401;
    return jsonResponse({ code: "Rejected", message: "candidate rejected" }, status);
  };

  try {
    await expect(
      validateApiKey({ identity, settings }, "sk-ws-placeholder", {
        workspaceId: "llm-test-workspace",
      }),
    ).resolves.toEqual({
      baseUrl: workspaceOrigin,
      kind: "ordinary",
    });
  } finally {
    httpTransport.fetch = originalFetch;
  }
});

test("其他格式 Key 不限制端点类型", () => {
  expect(
    apiKeyValidationCandidates("custom-key-placeholder", {}).map((candidate) => candidate.kind),
  ).toEqual(["ordinary", "ordinary", "ordinary", "ordinary", "token-plan", "token-plan"]);
});

test("未知格式 Key 指向 Token Plan host 时保留 Token Plan kind", () => {
  expect(
    apiKeyValidationCandidates("custom-key-placeholder", {
      explicitBaseUrl: "https://token-plan.ap-southeast-1.maas.aliyuncs.com",
    }),
  ).toEqual([
    {
      baseUrl: "https://token-plan.ap-southeast-1.maas.aliyuncs.com",
      kind: "token-plan",
      modelsUrl: "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/models",
    },
  ]);
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
  expect(
    candidateUrls("sk-ws-placeholder", {
      explicitBaseUrl: "https://ws-explicit.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
    }),
  ).toEqual(["https://ws-explicit.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/models"]);
});

test("Token Plan 多地区并行校验选择实际接受 Key 的国际站点", async () => {
  const originalFetch = httpTransport.fetch;
  const requests: Array<{ authorization: string; url: string }> = [];
  httpTransport.fetch = async (input, init) => {
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
    httpTransport.fetch = originalFetch;
  }
});

test("所有候选站点拒绝 Key 时透传首个服务端错误", async () => {
  const originalFetch = httpTransport.fetch;
  httpTransport.fetch = async (input) => {
    const requestId = requestUrl(input).includes("cn-beijing")
      ? "req-cn-rejected"
      : "req-sg-rejected";
    return jsonResponse(
      { code: "InvalidApiKey", message: "invalid key", request_id: requestId },
      401,
    );
  };

  try {
    const error = await captureValidationError("sk-sp-placeholder");
    expect(error.exitCode).toBe(ExitCode.GENERAL);
    expect(error.message).toBe("invalid key");
    expect(error.api).toEqual({
      httpStatus: 401,
      apiCode: "InvalidApiKey",
      requestId: "req-cn-rejected",
    });
  } finally {
    httpTransport.fetch = originalFetch;
  }
});

test("显式 Base URL 返回 404 时保留状态和 request ID", async () => {
  const originalFetch = httpTransport.fetch;
  httpTransport.fetch = async () =>
    jsonResponse({ code: "NotFound", message: "models route not found" }, 404, {
      "x-request-id": "req-route-not-found",
    });

  try {
    const error = await validateApiKey({ identity, settings }, "sk-ws-placeholder", {
      explicitBaseUrl: "https://ws-explicit.ap-southeast-1.maas.aliyuncs.com",
    }).catch((caught) => caught);
    expect(error).toBeInstanceOf(BailianError);
    expect(error).toMatchObject({
      exitCode: ExitCode.GENERAL,
      message: "models route not found",
      api: {
        httpStatus: 404,
        apiCode: "NotFound",
        requestId: "req-route-not-found",
      },
    });
  } finally {
    httpTransport.fetch = originalFetch;
  }
});

test.each([
  { name: "5xx", status: 503, message: "temporary outage" },
  { name: "429", status: 429, message: "too many requests" },
])("存在 $name 时校验结论不确定，不误报 Key 无效", async ({ status, message }) => {
  const originalFetch = httpTransport.fetch;
  httpTransport.fetch = async (input) => {
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
    httpTransport.fetch = originalFetch;
  }
});

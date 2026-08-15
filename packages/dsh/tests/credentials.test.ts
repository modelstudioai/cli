import { expect, test } from "vite-plus/test";
import {
  credentialFlags,
  DASHSCOPE_DEFAULT_BASE_URL,
  isTokenPlanEndpoint,
  isTokenPlanKey,
  workspaceEndpoint,
} from "../src/shared/credentials.ts";

// 行为锁定:两类 Key(sk-sp- TokenPlan / sk-ws- 按量付费)不可混用,三个直连服务
// 模块(memory / RAG / managed-agent)都会拦下 TokenPlan Key,而不是等请求时
// 拿到难懂的 401/404。managed-agent 的凭证两半独立下发:解析出 key 就显式
// --api-key(不让 bl 用活动 profile 的 key),解析出端点就显式 --base-url
// (不让 bl 用活动 profile 的端点)。agentstudio 只在工作空间前缀主机上提供,
// 因此绝不存在"默认端点"——工作空间未知就是配置缺口,该报错而不是猜。

test("isTokenPlanKey classifies by prefix", () => {
  expect(isTokenPlanKey("sk-sp-abc123")).toBe(true);
  expect(isTokenPlanKey("sk-ws-abc123")).toBe(false);
  expect(isTokenPlanKey("")).toBe(false);
});

test("isTokenPlanEndpoint classifies the gateway host", () => {
  expect(isTokenPlanEndpoint("https://token-plan.cn-beijing.maas.aliyuncs.com")).toBe(true);
  expect(
    isTokenPlanEndpoint("https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"),
  ).toBe(true);
  expect(isTokenPlanEndpoint(DASHSCOPE_DEFAULT_BASE_URL)).toBe(false);
  expect(isTokenPlanEndpoint(workspaceEndpoint("llm-x"))).toBe(false);
  // 不可解析的 URL 交给后续请求自己报错,这里只做形状分类。
  expect(isTokenPlanEndpoint("not a url")).toBe(false);
});

test("workspaceEndpoint composes the workspace-scoped agentstudio host", () => {
  expect(workspaceEndpoint("llm-kpgesh4vqzf5gzv9")).toBe(
    "https://llm-kpgesh4vqzf5gzv9.cn-beijing.maas.aliyuncs.com",
  );
  expect(workspaceEndpoint("ws_abc")).toBe("https://ws_abc.cn-beijing.maas.aliyuncs.com");
});

test("credentialFlags: each resolved half ships independently, no defaults", () => {
  expect(credentialFlags(undefined, undefined)).toEqual([]);
  expect(credentialFlags("", "")).toEqual([]);
  // 只有 key:端点留给 bl 解析,绝不塞一个会 404 的默认主机。
  expect(credentialFlags("sk-ws-abc", undefined)).toEqual(["--api-key", "sk-ws-abc"]);
  // 只有端点:也下发,key 留给 bl 的 auth chain。
  expect(credentialFlags(undefined, "https://ws.example.com")).toEqual([
    "--base-url",
    "https://ws.example.com",
  ]);
  expect(credentialFlags("sk-ws-abc", "https://ws.example.com")).toEqual([
    "--base-url",
    "https://ws.example.com",
    "--api-key",
    "sk-ws-abc",
  ]);
});

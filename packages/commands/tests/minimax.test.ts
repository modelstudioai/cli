import { afterEach, expect, it, vi } from "vite-plus/test";
import { Client, chatPath, responsesPath, getModelProfilePreset } from "bailian-cli-core";
import { resolveApiKeyLoginConfigName } from "../../core/src/config/profile-presets.ts";
import { apiKeyValidationCandidates } from "../src/commands/auth/login-api-key.ts";
import loginCommand from "../src/commands/auth/login.ts";
import chatCommand from "../src/commands/text/chat.ts";

afterEach(() => vi.restoreAllMocks());

for (const [profile, origin] of [
  ["minimax", "https://api.minimax.io"],
  ["minimax-cn", "https://api.minimax.cn"],
]) {
  it(`${profile} authenticates only on its selected origin and preserves saved models`, async () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(JSON.stringify({ object: "list", data: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const persist = vi.fn();
    for (const saved of [undefined, "MiniMax-M3", "MiniMax-M2.7", "custom-model"]) {
      const stored = { baseUrl: undefined, apiKeyCapabilities: undefined };
      await loginCommand.run!({
        flags: { apiKey: "sk-sp-test-minimax" },
        settings: { configName: profile, defaultTextModel: saved, timeout: 5, language: "en-US" },
        identity: { productName: "bailian", version: "0.0.0", userAgent: "test" },
        authStore: { stored: () => stored, login: persist, path: "test-config" },
      } as never);
      expect(persist).toHaveBeenLastCalledWith(
        expect.objectContaining({
          base_url: origin,
          default_text_model: saved ?? "MiniMax-M3.1-Flash",
          api_key_capabilities: ["text.chat"],
        }),
      );
      expect(persist.mock.lastCall![0].default_speech_model).toBeUndefined();
    }
    expect(fetchMock.mock.calls.every(([url]) => url === `${origin}/v1/models`)).toBe(true);
    expect(apiKeyValidationCandidates("sk-sp-test", { storedBaseUrl: origin })).toEqual([
      { baseUrl: origin, kind: "minimax", modelsUrl: `${origin}/v1/models` },
    ]);
    expect(resolveApiKeyLoginConfigName("sk-sp-test", profile, false, origin)).toBe(profile);
    expect(getModelProfilePreset(profile)?.apiKeyCapabilities).toEqual(["text.chat"]);
  });

  for (const api of ["chat", "responses"]) {
    for (const stream of [false, true]) {
      it(`${profile} ${api} stream=${stream} sends a real client request with Flash`, async () => {
        vi.spyOn(process.stdout, "write").mockImplementation(() => true);
        const response =
          api === "chat"
            ? { choices: [{ message: { content: "hello" } }] }
            : {
                status: "completed",
                output: [{ type: "message", content: [{ type: "output_text", text: "hello" }] }],
              };
        const sse =
          api === "chat"
            ? 'data: {"choices":[{"delta":{"content":"hello"}}]}\n\ndata: [DONE]\n\n'
            : 'data: {"type":"response.output_text.delta","delta":"hello"}\n\ndata: {"type":"response.completed","response":{"status":"completed"}}\n\n';
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
          new Response(stream ? sse : JSON.stringify(response), {
            status: 200,
            headers: { "Content-Type": stream ? "text/event-stream" : "application/json" },
          }),
        );
        const settings = { output: "json", timeout: 5, language: "en-US" };
        const identity = { productName: "bailian", version: "0.0.0", userAgent: "test" };
        const client = new Client({
          identity,
          settings,
          baseUrl: origin,
          apiCred: { token: "test-minimax-key", baseUrl: origin },
        } as never);
        await chatCommand.run!({
          client,
          settings,
          flags: { api, stream, message: ["hello"], enableThinking: true },
        } as never);
        const [url, request] = fetchMock.mock.calls[0];
        expect(url).toBe(`${origin}/v1/${api === "chat" ? "chat/completions" : "responses"}`);
        const body = JSON.parse(request!.body as string);
        expect(body.model).toBe("MiniMax-M3.1-Flash");
        expect(body.enable_thinking).toBeUndefined();
        expect(api === "chat" ? body.thinking : body.reasoning).toEqual(
          api === "chat" ? { type: "adaptive" } : { effort: "max" },
        );
        expect(new Headers(request!.headers).get("Authorization")).toBe("Bearer test-minimax-key");
      });
    }
  }
}

it("keeps legacy/custom selections and non-MiniMax routing", async () => {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  for (const [origin, saved, explicit, expected] of [
    ["https://api.minimax.io", "MiniMax-M2.7", undefined, "MiniMax-M2.7"],
    ["https://api.minimax.cn", "MiniMax-M3", "custom-model", "custom-model"],
    ["https://dashscope.aliyuncs.com", undefined, undefined, "qwen3.8-max"],
    ["https://gateway.example", "custom-model", undefined, "custom-model"],
  ]) {
    const requestJson = vi.fn().mockResolvedValue({ choices: [{ message: { content: "hello" } }] });
    await chatCommand.run!({
      client: { baseUrl: origin, requestJson },
      settings: { output: "json", defaultTextModel: saved },
      flags: { message: ["hello"], model: explicit },
    } as never);
    expect(requestJson.mock.calls[0][0].body.model).toBe(expected);
    expect(requestJson.mock.calls[0][0].path).toBe(chatPath(origin));
  }
  for (const origin of [
    undefined,
    "https://gateway.example",
    "https://api.minimax.io.example",
    "http://api.minimax.io",
  ]) {
    expect(chatPath(origin)).toBe("/compatible-mode/v1/chat/completions");
    expect(responsesPath(origin)).toBe("/compatible-mode/v1/responses");
  }
  expect(getModelProfilePreset("token-plan")?.defaultTextModel).toBe("qwen3.8-max");
  expect(getModelProfilePreset("token-plan")?.defaultSpeechModel).toBe("qwen-audio-3.0-tts-plus");
});

it("rejects a MiniMax thinking budget before sending a request", async () => {
  const requestJson = vi.fn();
  await expect(
    chatCommand.run!({
      client: { baseUrl: "https://api.minimax.io", requestJson },
      settings: { output: "json" },
      flags: { message: ["hello"], thinkingBudget: 128 },
    } as never),
  ).rejects.toThrow("MiniMax does not support --thinking-budget");
  expect(requestJson).not.toHaveBeenCalled();
});

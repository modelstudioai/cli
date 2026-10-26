import { expect, test, vi } from "vite-plus/test";
import { BailianError, ExitCode } from "bailian-cli-core";
import command from "../../src/commands/knowledge/chunk-delete.ts";

const chunkIds = Array.from({ length: 35 }, (_, index) => `chunk-${index + 1}`);

test("first-batch timeout reports zero completed batches and preserves timeout classification", async () => {
  const requestJson = vi.fn().mockRejectedValue(new DOMException("deadline", "TimeoutError"));
  const context = {
    identity: { binName: "kscli" },
    flags: { indexId: "index-test", workspaceId: "ws-test", chunkId: chunkIds },
    settings: { output: "json" },
    localize: (text: string | Record<string, string>) =>
      typeof text === "string" ? text : text["en-US"],
    client: { requestJson },
  } as unknown as Parameters<typeof command.run>[0];
  const failure = (await command.run(context).catch((caught: unknown) => caught)) as BailianError;
  expect(requestJson).toHaveBeenCalledTimes(1);
  expect(failure.exitCode).toBe(ExitCode.TIMEOUT);
  expect(failure.hint).toContain("0 chunk(s) in 0 completed batch(es)");
  expect(failure.hint).toContain("Batch 1 failed; its deletion outcome is unconfirmed.");
  expect(failure.hint).toContain("kscli auth status");
});

test.each([
  { language: "en-US", error: new BailianError("server failure", ExitCode.GENERAL) },
  {
    language: "zh-CN",
    error: new BailianError("server failure", ExitCode.GENERAL, "original hint", {
      api: { httpStatus: 500, apiCode: "ServerError", requestId: "request-test" },
      rawResponse: "original response",
    }),
  },
  {
    language: "en-US",
    error: new TypeError("fetch failed", {
      cause: Object.assign(new Error("connection reset"), { code: "ECONNRESET" }),
    }),
  },
  { language: "en-US", error: new Error("unexpected failure") },
])(
  "failed batch preserves completed IDs and stops: $language $error.message",
  async ({ language, error }) => {
    const requestJson = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(error);
    const context = {
      identity: { binName: "kscli" },
      flags: { indexId: "index-test", workspaceId: "ws-test", chunkId: chunkIds },
      settings: { output: "json" },
      localize: (text: string | Record<string, string>) =>
        typeof text === "string" ? text : text[language],
      client: { requestJson },
    } as unknown as Parameters<typeof command.run>[0];
    const failure = await command.run(context).catch((caught: unknown) => caught);
    expect(requestJson).toHaveBeenCalledTimes(3);
    expect(requestJson.mock.calls.map(([request]) => request.body.chunkIds)).toEqual([
      chunkIds.slice(0, 10),
      chunkIds.slice(10, 20),
      chunkIds.slice(20, 30),
    ]);
    expect(failure).toBeInstanceOf(BailianError);
    const diagnostic = failure as BailianError;
    expect(diagnostic.hint).toContain(JSON.stringify(chunkIds.slice(0, 10)));
    expect(diagnostic.hint).toContain(JSON.stringify(chunkIds.slice(10, 20)));
    expect(diagnostic.hint).not.toContain('"chunk-21"');
    expect(diagnostic.hint).toMatch(
      language === "zh-CN" ? /第 3 批.*未确认/ : /Batch 3.*unconfirmed/,
    );
    expect(diagnostic.hint).toMatch(
      language === "zh-CN" ? /后续批次未执行/ : /Later batches were not executed/,
    );
    if (error instanceof BailianError) {
      expect(diagnostic.message).toBe(error.message);
      expect(diagnostic.exitCode).toBe(error.exitCode);
      expect(diagnostic.api).toEqual(error.api);
      expect(diagnostic.rawResponse).toBe(error.rawResponse);
      if (error.hint) expect(diagnostic.hint).toContain(error.hint);
    } else if (error instanceof TypeError) {
      expect(diagnostic.exitCode).toBe(ExitCode.NETWORK);
      expect(diagnostic.hint).toContain("Connection reset");
    }
    expect(diagnostic.toJSON().error.hint).toBe(diagnostic.hint);
  },
);

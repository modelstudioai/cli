import { describe, expect, test } from "vite-plus/test";
import { BailianError, ExitCode, type Client } from "bailian-cli-core";
import {
  AUTO_MODEL,
  assertAutoMcpAvailable,
  assertMcpCompatible,
  assertMcpTtsVoice,
  isAutoModel,
  mcpSingleImageOnlyError,
  mcpUnsupportedError,
  resolveAutoAsrInput,
  resolveAutoImageSize,
  type AigcMcpOperation,
  type Localize,
} from "../src/commands/shared/aigc-mcp.ts";

/** Localizer stubs — the runtime picks one variant by resolved language. */
const enUS: Localize = (text) => (typeof text === "string" ? text : text["en-US"]);
const zhCN: Localize = (text) => (typeof text === "string" ? text : text["zh-CN"]);

/** Run a gate call expected to throw, asserting it is a USAGE BailianError. */
function captureUsage(gateCall: () => void): BailianError {
  try {
    gateCall();
  } catch (error) {
    expect(error).toBeInstanceOf(BailianError);
    const usageError = error as BailianError;
    expect(usageError.exitCode).toBe(ExitCode.USAGE);
    return usageError;
  }
  throw new Error("expected assertMcpCompatible to throw a USAGE error");
}

describe("isAutoModel", () => {
  test("matches only the reserved auto value (case-sensitive)", () => {
    expect(AUTO_MODEL).toBe("auto");
    expect(isAutoModel("auto")).toBe(true);
    expect(isAutoModel("qwen-image-3.0")).toBe(false);
    expect(isAutoModel("AUTO")).toBe(false);
    expect(isAutoModel("")).toBe(false);
    expect(isAutoModel(undefined)).toBe(false);
  });
});

describe("assertMcpCompatible rejects flags MCP cannot honor", () => {
  const rejectedCases: Array<[AigcMcpOperation, Record<string, unknown>, string]> = [
    ["imageGen", { seed: 42 }, "--seed"],
    ["imageGen", { watermark: false }, "--watermark"],
    ["imageGen", { async: true }, "--async"],
    ["imageEdit", { size: "1:1" }, "--size"],
    ["imageEdit", { n: 2 }, "--n"],
    ["imageEdit", { function: "stylize_all" }, "--function"],
    ["imageEdit", { promptExtend: true }, "--prompt-extend"],
    ["videoTextToVideo", { negativePrompt: "x" }, "--negative-prompt"],
    ["videoTextToVideo", { lastFrame: "https://x/l.png" }, "--last-frame"],
    ["videoTextToVideo", { prime: true }, "--prime"],
    ["videoTextToVideo", { workspaceId: "ws" }, "--workspace-id"],
    ["videoImageToVideo", { ratio: "16:9" }, "--ratio"],
    ["videoImageToVideo", { file: "https://x/f.mp4" }, "--file"],
    ["tts", { listVoices: true }, "--list-voices"],
    ["tts", { format: "mp3" }, "--format"],
    ["tts", { sampleRate: "16000" }, "--sample-rate"],
    ["tts", { stream: true }, "--stream"],
    ["tts", { enableSsml: true }, "--enable-ssml"],
    ["asr", { language: "zh" }, "--language"],
    ["asr", { diarization: true }, "--diarization"],
    ["asr", { speakerCount: 2 }, "--speaker-count"],
    ["asr", { vocabularyId: "vocab-1" }, "--vocabulary-id"],
    ["asr", { channelId: 1 }, "--channel-id"],
    ["asr", { async: true }, "--async"],
  ];

  for (const [operation, flags, expectedFlag] of rejectedCases) {
    test(`${operation} rejects ${expectedFlag}`, () => {
      const usageError = captureUsage(() => assertMcpCompatible(operation, flags, enUS));
      expect(usageError.message).toContain(expectedFlag);
      expect(usageError.message).toContain("auto");
      expect(usageError.hint).toContain("--model");
    });
  }

  test("lists every offending flag in a single message", () => {
    const usageError = captureUsage(() =>
      assertMcpCompatible("imageGen", { seed: 1, watermark: true, async: true }, enUS),
    );
    expect(usageError.message).toContain("--seed");
    expect(usageError.message).toContain("--watermark");
    expect(usageError.message).toContain("--async");
    expect(usageError.message).toContain("these flags");
  });

  test("localizes the rejection to zh-CN", () => {
    const usageError = captureUsage(() => assertMcpCompatible("imageGen", { seed: 1 }, zhCN));
    expect(usageError.message).toContain("不支持");
    expect(usageError.message).toContain("--seed");
    expect(usageError.message).toContain("该参数");
  });
});

describe("assertMcpCompatible allows MCP-honored and CLI-local flags", () => {
  test("imageGen keeps prompt/size/n/negativePrompt/promptExtend plus output+concurrency", () => {
    expect(() =>
      assertMcpCompatible(
        "imageGen",
        {
          prompt: "x",
          size: "1024*1024",
          n: 2,
          negativePrompt: "blur",
          promptExtend: false,
          concurrent: 3,
          outDir: "./out",
          outPrefix: "img",
          pollInterval: 3,
        },
        enUS,
      ),
    ).not.toThrow();
  });

  test("switch flags are rejected only when true", () => {
    expect(() => assertMcpCompatible("imageGen", { async: false }, enUS)).not.toThrow();
    expect(() => assertMcpCompatible("videoTextToVideo", { prime: false }, enUS)).not.toThrow();
    expect(() => assertMcpCompatible("tts", { stream: false }, enUS)).not.toThrow();
  });

  test("value flags are rejected only when defined", () => {
    expect(() => assertMcpCompatible("imageGen", { seed: undefined }, enUS)).not.toThrow();
    expect(() => assertMcpCompatible("imageEdit", { size: undefined }, enUS)).not.toThrow();
  });

  test("tts keeps text/voice/out; asr keeps url/out", () => {
    expect(() =>
      assertMcpCompatible("tts", { text: "hi", voice: "longxiaochun", out: "a.wav" }, enUS),
    ).not.toThrow();
    expect(() =>
      assertMcpCompatible("asr", { url: ["data:audio/wav;base64,AA"], out: "o.json" }, enUS),
    ).not.toThrow();
  });
});

describe("error message builders", () => {
  test("mcpUnsupportedError uses singular phrasing for one flag", () => {
    expect(mcpUnsupportedError(enUS, ["--seed"]).message).toContain("this flag");
  });

  test("mcpSingleImageOnlyError is a USAGE error mentioning single image", () => {
    const singleImageError = mcpSingleImageOnlyError(enUS);
    expect(singleImageError).toBeInstanceOf(BailianError);
    expect(singleImageError.exitCode).toBe(ExitCode.USAGE);
    expect(singleImageError.message).toContain("single image");
  });
});

describe("assertAutoMcpAvailable rejects Token Plan connections", () => {
  /** Minimal Client stub: only the accessor the applicability gate reads. */
  function stubClient(tokenPlanConnection: boolean): Client {
    return {
      usesTokenPlanConnection: () => tokenPlanConnection,
    } as unknown as Client;
  }

  test("Token Plan connection throws USAGE with an actionable hint (en-US)", () => {
    const error = captureUsage(() => assertAutoMcpAvailable(stubClient(true), enUS));
    expect(error.message).toContain("Token Plan");
    expect(error.hint).toContain("--model");
  });

  test("zh-CN localization mentions Token Plan and the model fallback", () => {
    const error = captureUsage(() => assertAutoMcpAvailable(stubClient(true), zhCN));
    expect(error.message).toContain("Token Plan");
    expect(error.hint).toContain("Token Plan 模型");
  });

  test("non-Token-Plan connection passes", () => {
    expect(() => assertAutoMcpAvailable(stubClient(false), enUS)).not.toThrow();
  });
});

describe("resolveAutoImageSize maps or rejects --size for MCP", () => {
  test("ratios map to pixel presets and pixels pass through", () => {
    expect(resolveAutoImageSize("16:9", enUS)).toBe("1664*928");
    expect(resolveAutoImageSize("2048*2048", enUS)).toBe("2048*2048");
    expect(resolveAutoImageSize(undefined, enUS)).toBeUndefined();
  });

  test("unmappable values throw the unsupported-parameter USAGE error", () => {
    const error = captureUsage(() => resolveAutoImageSize("2:3", enUS));
    expect(error.message).toContain("--size 2:3");
  });
});

describe("assertMcpTtsVoice rejects REST voice IDs", () => {
  test("enum voices pass", () => {
    expect(() => assertMcpTtsVoice("温柔女声", enUS)).not.toThrow();
  });

  test("REST voice IDs throw USAGE listing the MCP enum", () => {
    const error = captureUsage(() => assertMcpTtsVoice("longxiaochun_v3", enUS));
    expect(error.message).toContain("longxiaochun_v3");
    expect(error.message).toContain("温柔女声");
    expect(error.hint).toContain("--model");
  });
});

describe("resolveAutoAsrInput only accepts public http(s) URLs", () => {
  test("http(s) URLs pass through verbatim", () => {
    expect(resolveAutoAsrInput("https://x/a.wav", enUS)).toBe("https://x/a.wav");
    expect(resolveAutoAsrInput("http://x/a.wav", zhCN)).toBe("http://x/a.wav");
  });

  test("local paths and data URIs throw USAGE with a switch-model hint", () => {
    const local = captureUsage(() => resolveAutoAsrInput("./a.wav", enUS));
    expect(local.message).toContain("./a.wav");
    expect(local.hint).toContain("--model");
    const dataUri = captureUsage(() => resolveAutoAsrInput("data:audio/wav;base64,AA==", zhCN));
    expect(dataUri.message).toContain("data:audio/wav");
    expect(dataUri.hint).toContain("--model");
  });
});

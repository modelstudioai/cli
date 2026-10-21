import { describe, expect, test } from "vite-plus/test";
import {
  AIGC_MCP_SERVER,
  AIGC_MCP_TOOL,
  buildImageEditArgs,
  buildImageGenArgs,
  buildImageToVideoArgs,
  buildSpeechToTextArgs,
  buildTextToVideoArgs,
  buildTtsArgs,
  buildVideoFetchArgs,
  parseAigcAsrTexts,
  parseAigcImageResults,
  parseAigcToolResult,
  parseAigcTtsResult,
  parseAigcVideoTaskId,
  parseAigcVideoTaskResult,
} from "../src/client/aigc-mcp.ts";
import type { McpToolResult } from "../src/client/mcp.ts";

/** Wrap a JSON-serializable payload in the MCP text-content envelope. */
function textResult(payload: unknown, isError = false): McpToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload) }], isError };
}

describe("AIGC MCP server / tool constants", () => {
  test("maps each modality to its server code and tool names", () => {
    expect(AIGC_MCP_SERVER.image).toBe("TextGenerateImage");
    expect(AIGC_MCP_SERVER.video).toBe("VideoGenerate");
    expect(AIGC_MCP_SERVER.speech).toBe("TextGenerateSpeech");
    expect(AIGC_MCP_SERVER.asr).toBe("SpeechGenerateText");
    expect(AIGC_MCP_TOOL.imageGen).toBe("bailian_image_gen");
    expect(AIGC_MCP_TOOL.videoFetchResult).toBe("bailian_text_to_video_fetch_result");
  });
});

describe("argument builders omit undefined and snake_case optional params", () => {
  test("buildImageGenArgs", () => {
    expect(buildImageGenArgs({ prompt: "a cat" })).toEqual({ prompt: "a cat" });
    expect(
      buildImageGenArgs({
        prompt: "a cat",
        size: "1024*1024",
        n: 2,
        negativePrompt: "blur",
        promptExtend: false,
      }),
    ).toEqual({
      prompt: "a cat",
      size: "1024*1024",
      n: 2,
      negative_prompt: "blur",
      prompt_extend: false,
    });
  });

  test("buildImageEditArgs", () => {
    expect(buildImageEditArgs({ imageUrl: "https://x/a.png", prompt: "edit" })).toEqual({
      image_url: "https://x/a.png",
      prompt: "edit",
    });
    expect(
      buildImageEditArgs({
        imageUrl: "data:image/png;base64,AA",
        prompt: "edit",
        negativePrompt: "n",
      }),
    ).toEqual({ image_url: "data:image/png;base64,AA", prompt: "edit", negative_prompt: "n" });
  });

  test("buildTextToVideoArgs keeps ratio; buildImageToVideoArgs drops it", () => {
    expect(
      buildTextToVideoArgs({ prompt: "p", duration: 5, resolution: "1080P", ratio: "16:9" }),
    ).toEqual({ prompt: "p", duration: 5, resolution: "1080P", ratio: "16:9" });
    expect(
      buildImageToVideoArgs({
        firstFrameUrl: "https://x/f.png",
        prompt: "p",
        duration: 5,
        resolution: "720P",
        ratio: "16:9",
      }),
    ).toEqual({ first_frame_url: "https://x/f.png", prompt: "p", duration: 5, resolution: "720P" });
  });

  test("buildVideoFetchArgs / buildTtsArgs / buildSpeechToTextArgs", () => {
    expect(buildVideoFetchArgs("task-1")).toEqual({ task_id: "task-1" });
    expect(buildTtsArgs({ text: "hi" })).toEqual({ text: "hi" });
    expect(buildTtsArgs({ text: "hi", voice: "longxiaochun" })).toEqual({
      text: "hi",
      voice: "longxiaochun",
    });
    expect(buildSpeechToTextArgs(["data:audio/wav;base64,AA"])).toEqual({
      file_urls: ["data:audio/wav;base64,AA"],
    });
  });
});

describe("parseAigcToolResult envelope handling", () => {
  test("parses the JSON text payload", () => {
    expect(parseAigcToolResult(textResult({ results: ["u"] }))).toEqual({ results: ["u"] });
  });

  test("passes a tool-level isError through verbatim", () => {
    expect(() => parseAigcToolResult(textResult({ message: "boom" }, true))).toThrow(
      /Tool error:.*boom/,
    );
  });

  test("rejects empty, non-JSON, and non-object payloads", () => {
    expect(() => parseAigcToolResult({ content: [{ type: "text", text: "" }] })).toThrow(
      /no text content/,
    );
    expect(() => parseAigcToolResult({ content: [{ type: "text", text: "not json" }] })).toThrow(
      /Failed to parse MCP tool result/,
    );
    expect(() => parseAigcToolResult(textResult(["array"]))).toThrow(/unexpected payload shape/);
  });
});

describe("response parsers", () => {
  test("parseAigcImageResults accepts bare strings and { url } objects", () => {
    expect(parseAigcImageResults({ results: ["a", "b"] })).toEqual(["a", "b"]);
    expect(parseAigcImageResults({ results: [{ url: "a" }, "b"] })).toEqual(["a", "b"]);
    expect(parseAigcImageResults({ results: [] })).toEqual([]);
    expect(() => parseAigcImageResults({})).toThrow(/missing a `results` array/);
  });

  test("parseAigcTtsResult reads the singular result URL", () => {
    expect(parseAigcTtsResult({ result: "https://x/a.wav", request_id: "r1" })).toEqual({
      audioUrl: "https://x/a.wav",
      requestId: "r1",
    });
    expect(() => parseAigcTtsResult({})).toThrow(/missing an audio URL/);
  });

  test("parseAigcVideoTaskId / parseAigcVideoTaskResult", () => {
    expect(parseAigcVideoTaskId({ task_id: "t1" })).toBe("t1");
    expect(() => parseAigcVideoTaskId({})).toThrow(/missing a task_id/);
    expect(
      parseAigcVideoTaskResult({ task_status: "SUCCEEDED", video_url: "https://x/v.mp4" }),
    ).toEqual({ taskStatus: "SUCCEEDED", videoUrl: "https://x/v.mp4" });
    expect(parseAigcVideoTaskResult({})).toEqual({ taskStatus: "UNKNOWN" });
  });

  test("parseAigcAsrTexts keeps only string entries", () => {
    expect(parseAigcAsrTexts({ results: ["hello", "world"] })).toEqual(["hello", "world"]);
    expect(parseAigcAsrTexts({ results: ["hello", 42] })).toEqual(["hello"]);
    expect(parseAigcAsrTexts({})).toEqual([]);
  });
});

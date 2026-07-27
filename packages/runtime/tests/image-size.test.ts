import { expect, test } from "vite-plus/test";
import { resolveImageSize } from "../src/utils/image-size.ts";

test("qwen-image-plus fixed profile maps 1:1 to 1328*1328", () => {
  expect(resolveImageSize("1:1", "qwen-image-fixed")).toBe("1328*1328");
  expect(resolveImageSize("16:9", "qwen-image-fixed")).toBe("1664*928");
});

test("qwen-image-2.0 profile maps 1:1 to 2048*2048", () => {
  expect(resolveImageSize("1:1", "qwen-image-2.0")).toBe("2048*2048");
});

test("wanx-v1 profile maps 1:1 to 1024*1024", () => {
  expect(resolveImageSize("1:1", "wanx-v1")).toBe("1024*1024");
  expect(resolveImageSize("16:9", "wanx-v1")).toBe("1280*720");
});

test("wan2.5-i2i profile maps 1:1 to 1280*1280", () => {
  expect(resolveImageSize("1:1", "wan25-i2i")).toBe("1280*1280");
});

test("z-image profile maps 1:1 to 1024*1024", () => {
  expect(resolveImageSize("1:1", "z-image")).toBe("1024*1024");
});

test("pixel sizes pass through unchanged", () => {
  expect(resolveImageSize("1024*1024", "qwen-image-fixed")).toBe("1024*1024");
});

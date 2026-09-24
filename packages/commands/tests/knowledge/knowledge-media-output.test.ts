import { expect, test } from "vite-plus/test";
import { mediaSummary, firstNonEmptyText } from "../../src/commands/knowledge/media-output.ts";

test("empty transcript falls back to visual description", () => {
  expect(firstNonEmptyText("", "  ", "画面描述")).toBe("画面描述");
});
test("media summary retains zero start and source arrays without modifying metadata", () => {
  const metadata = {
    clip_start_time: 0,
    clip_end_time: 28000,
    clip_description: "画面描述",
    video_url: ["https://example.com/video.mp4"],
    image_url: ["https://example.com/frame.png"],
    audio_url: [],
    audio_segments: [{ start_time: 10760, end_time: 75480, text: "音频转写" }],
    future: { value: 42 },
  };
  const before = structuredClone(metadata);
  const text = mediaSummary(metadata).join("\n");
  expect(text).toContain("00:00.000–00:28.000");
  expect(text).toContain("画面描述");
  expect(text).toContain("https://example.com/video.mp4");
  expect(text).toContain("音频转写");
  expect(text).toContain("75480");
  expect(text).not.toContain("audio_url:");
  expect(metadata).toEqual(before);
});
test("ordinary document metadata produces no media appendix", () => {
  expect(mediaSummary({ content: "ordinary text", title: "title" })).toEqual([]);
});
test("legacy scalar image URLs still display", () => {
  expect(mediaSummary({ image_url: "https://example.com/image.png" }).join("\n")).toContain(
    "https://example.com/image.png",
  );
});

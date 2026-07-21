import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { expect, test } from "vite-plus/test";
import { listAssets, resolveAssetPath, contentType } from "../src/commands/config/assets.ts";

/** Build an isolated temp output base and clean it up afterwards. */
function withBase(fn: (base: string) => void): void {
  const base = mkdtempSync(join(tmpdir(), "bl-assets-"));
  try {
    fn(base);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

function put(base: string, rel: string, content = "x"): string {
  const path = join(base, rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
  return path;
}

test("listAssets 按分类归类并识别类型", () => {
  withBase((base) => {
    put(base, "images/a.png");
    put(base, "videos/clip.mp4");
    put(base, "speech/voice.mp3");
    put(base, "notes.txt"); // loose file -> other

    const { base: reported, assets } = listAssets(base);
    expect(reported).toBe(base);
    const byName = Object.fromEntries(assets.map((a) => [a.name, a]));
    expect(byName["a.png"]).toMatchObject({ category: "images", kind: "image", ext: "png" });
    expect(byName["clip.mp4"]).toMatchObject({ category: "videos", kind: "video", ext: "mp4" });
    expect(byName["voice.mp3"]).toMatchObject({ category: "speech", kind: "audio", ext: "mp3" });
    expect(byName["notes.txt"]).toMatchObject({ category: "other", kind: "other" });
  });
});

test("listAssets 按生成时间倒序排列", () => {
  withBase((base) => {
    const older = put(base, "images/old.png");
    const newer = put(base, "images/new.png");
    // Force a stable ordering by stamping mtimes.
    utimesSync(older, new Date(1000), new Date(1000));
    utimesSync(newer, new Date(2000), new Date(2000));

    const { assets } = listAssets(base);
    expect(assets.map((a) => a.name)).toEqual(["new.png", "old.png"]);
  });
});

test("listAssets 目录不存在时返回空", () => {
  const { assets } = listAssets(join(tmpdir(), "bl-assets-does-not-exist-xyz"));
  expect(assets).toEqual([]);
});

test("resolveAssetPath 阻止目录穿越", () => {
  withBase((base) => {
    put(base, "images/a.png");
    expect(resolveAssetPath(base, "images/a.png")).toBe(join(base, "images/a.png"));
    expect(resolveAssetPath(base, "../../etc/passwd")).toBeNull();
    expect(resolveAssetPath(base, "")).toBeNull();
    expect(resolveAssetPath(base, "images" + sep + ".." + sep + ".." + sep + "outside")).toBeNull();
  });
});

test("contentType 映射常见扩展名", () => {
  expect(contentType(".png")).toBe("image/png");
  expect(contentType(".MP4")).toBe("video/mp4");
  expect(contentType(".mp3")).toBe("audio/mpeg");
  expect(contentType(".xyz")).toBe("application/octet-stream");
});

import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BailianError, ExitCode, httpTransport } from "bailian-cli-core";
import { downloadFile } from "../src/utils/download.ts";

// Simulate a failed replacement without relying on platform-specific file locks.
const injection = vi.hoisted(() => ({
  publishErrorCode: undefined as string | undefined,
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    renameSync: ((from: string, to: string) => {
      if (from.endsWith(".part") && injection.publishErrorCode !== undefined) {
        throw Object.assign(new Error(`injected ${injection.publishErrorCode}`), {
          code: injection.publishErrorCode,
        });
      }
      return actual.renameSync(from, to);
    }) as typeof actual.renameSync,
  };
});

function serveBody(text: string): void {
  vi.spyOn(httpTransport, "fetch").mockResolvedValue(
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(text));
          controller.close();
        },
      }),
      { headers: { "content-length": String(text.length) } },
    ),
  );
}

let directory = "";
let destination = "";

beforeEach(() => {
  injection.publishErrorCode = undefined;
  directory = mkdtempSync(join(tmpdir(), "bl-download-publish-"));
  destination = join(directory, "take.wav");
  writeFileSync(destination, "original-audio", { mode: 0o600 });
  chmodSync(destination, 0o600);
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(directory, { recursive: true, force: true });
});

test.each(["EPERM", "EEXIST", "EXDEV", "EIO"])(
  "replacement failure (%s) leaves the existing file and cleans up the download",
  async (code) => {
    serveBody("new-audio");
    injection.publishErrorCode = code;

    await expect(
      downloadFile("https://example.invalid/file", destination, { quiet: true }),
    ).rejects.toMatchObject({ code });
    expect(readFileSync(destination, "utf-8")).toBe("original-audio");
    expect(statSync(destination).mode & 0o777).toBe(0o600);
    expect(readdirSync(directory)).toEqual(["take.wav"]);
  },
);

test("rejects a broken link without overwriting the file with the same name", async () => {
  const linkPath = join(directory, "alias.wav");
  symlinkSync("missing-dir/../take.wav", linkPath);
  const fetchSpy = vi.spyOn(httpTransport, "fetch").mockResolvedValue(new Response("new-audio"));

  await expect(
    downloadFile("https://example.invalid/file", linkPath, { quiet: true }),
  ).rejects.toMatchObject({ code: "ENOENT" });
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
  expect(readFileSync(destination, "utf-8")).toBe("original-audio");
  expect(readdirSync(directory).sort()).toEqual(["alias.wav", "take.wav"]);
});

test("symlink destination stays a link and the target receives new bytes", async () => {
  const targetPath = join(directory, "canonical.wav");
  const linkPath = join(directory, "alias.wav");
  writeFileSync(targetPath, "original-audio", { mode: 0o600 });
  chmodSync(targetPath, 0o600);
  symlinkSync(targetPath, linkPath);

  serveBody("new-audio");
  expect(await downloadFile("https://example.invalid/file", linkPath, { quiet: true })).toEqual({
    size: 9,
  });

  expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
  expect(readFileSync(targetPath, "utf-8")).toBe("new-audio");
  expect(readFileSync(linkPath, "utf-8")).toBe("new-audio");
  expect(statSync(targetPath).mode & 0o777).toBe(0o600);
});

test("failed replacement leaves a symlink and its target untouched", async () => {
  const targetPath = join(directory, "canonical.wav");
  const linkPath = join(directory, "alias.wav");
  writeFileSync(targetPath, "original-audio", { mode: 0o600 });
  chmodSync(targetPath, 0o600);
  symlinkSync(targetPath, linkPath);

  serveBody("new-audio");
  injection.publishErrorCode = "EIO";
  await expect(
    downloadFile("https://example.invalid/file", linkPath, { quiet: true }),
  ).rejects.toThrow("injected EIO");

  expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
  expect(readFileSync(targetPath, "utf-8")).toBe("original-audio");
  expect(readFileSync(linkPath, "utf-8")).toBe("original-audio");
  expect(readdirSync(directory).sort()).toEqual(["alias.wav", "canonical.wav", "take.wav"]);
});

test("rejects a chain of dangling symlinks without creating a target", async () => {
  const finalPath = join(directory, "final.wav");
  const midPath = join(directory, "mid.wav");
  const linkPath = join(directory, "out.wav");
  symlinkSync(finalPath, midPath);
  symlinkSync(midPath, linkPath);

  await expect(
    downloadFile("https://example.invalid/file", linkPath, { quiet: true }),
  ).rejects.toMatchObject({ code: "ENOENT" });
  expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
  expect(lstatSync(midPath).isSymbolicLink()).toBe(true);
  expect(readdirSync(directory).sort()).toEqual(["mid.wav", "out.wav", "take.wav"]);
});

test("creates a new file in an ordinary output directory", async () => {
  const otherDirectory = join(directory, "other");
  const targetPath = join(otherDirectory, "new.wav");

  serveBody("new-audio");
  expect(await downloadFile("https://example.invalid/file", targetPath, { quiet: true })).toEqual({
    size: 9,
  });

  expect(readFileSync(targetPath, "utf-8")).toBe("new-audio");
  expect(readdirSync(otherDirectory)).toEqual(["new.wav"]);
});

test("relative link through a directory symlink does not overwrite a lexical decoy", async () => {
  // portal -> elsewhere/real-home; alias -> portal/../out.wav
  // Lexical join would hit root/out.wav; OS resolution hits elsewhere/out.wav.
  const elsewhere = join(directory, "elsewhere");
  const realHome = join(elsewhere, "real-home");
  mkdirSync(realHome, { recursive: true });
  const trueTarget = join(elsewhere, "out.wav");
  const decoyPath = join(directory, "out.wav");
  writeFileSync(trueTarget, "true-old");
  writeFileSync(decoyPath, "decoy-old");
  symlinkSync(realHome, join(directory, "portal"));
  const linkPath = join(directory, "alias.wav");
  symlinkSync("portal/../out.wav", linkPath);

  serveBody("new-audio");
  expect(await downloadFile("https://example.invalid/file", linkPath, { quiet: true })).toEqual({
    size: 9,
  });

  expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
  expect(readFileSync(trueTarget, "utf-8")).toBe("new-audio");
  expect(readFileSync(decoyPath, "utf-8")).toBe("decoy-old");
});

test("refuses a directory destination without moving it aside", async () => {
  const targetDirectory = join(directory, "target-dir");
  mkdirSync(targetDirectory);
  writeFileSync(join(targetDirectory, "keep.txt"), "keep");

  const fetchSpy = vi.spyOn(httpTransport, "fetch");
  await expect(
    downloadFile("https://example.invalid/file", targetDirectory, { quiet: true }),
  ).rejects.toSatisfy((error: unknown) => {
    expect(error).toBeInstanceOf(BailianError);
    expect((error as BailianError).exitCode).toBe(ExitCode.USAGE);
    expect((error as BailianError).message).toMatch(/must be a regular file/);
    return true;
  });

  expect(fetchSpy).not.toHaveBeenCalled();
  expect(lstatSync(targetDirectory).isDirectory()).toBe(true);
  expect(readFileSync(join(targetDirectory, "keep.txt"), "utf-8")).toBe("keep");
  expect(readdirSync(directory).some((name) => name.includes(".bak"))).toBe(false);
});

test("refuses a symlink whose final target is a directory", async () => {
  const targetDirectory = join(directory, "target-dir");
  mkdirSync(targetDirectory);
  writeFileSync(join(targetDirectory, "keep.txt"), "keep");
  const linkPath = join(directory, "out.wav");
  symlinkSync(targetDirectory, linkPath);

  const fetchSpy = vi.spyOn(httpTransport, "fetch");
  await expect(
    downloadFile("https://example.invalid/file", linkPath, { quiet: true }),
  ).rejects.toThrow(/must be a regular file/);

  expect(fetchSpy).not.toHaveBeenCalled();
  expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
  expect(lstatSync(targetDirectory).isDirectory()).toBe(true);
  expect(readFileSync(join(targetDirectory, "keep.txt"), "utf-8")).toBe("keep");
  expect(readdirSync(directory).some((name) => name.includes(".bak"))).toBe(false);
});

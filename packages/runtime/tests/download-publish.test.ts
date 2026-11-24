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

// Publish-path failures (thrown after the body is fully downloaded) must never
// lose the previous destination bytes. renameSync/copyFileSync errnos are
// injected without touching real permissions: `renameCodes` is consumed in call
// order, null lets the real rename run.
const injection = vi.hoisted(() => ({
  renameCodes: [] as Array<string | null>,
  copyErrorCode: undefined as string | undefined,
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const fail = (code: string, action: string): never => {
    const error = new Error(`injected ${code}: ${action}`) as NodeJS.ErrnoException;
    error.code = code;
    throw error;
  };
  return {
    ...actual,
    renameSync: ((from: string, to: string) => {
      const code = injection.renameCodes.shift();
      if (code !== undefined && code !== null) fail(code, `rename ${from} -> ${to}`);
      return actual.renameSync(from, to);
    }) as typeof actual.renameSync,
    copyFileSync: ((from: string, to: string) => {
      if (injection.copyErrorCode !== undefined) {
        fail(injection.copyErrorCode, `copy ${from} -> ${to}`);
      }
      return actual.copyFileSync(from, to);
    }) as typeof actual.copyFileSync,
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
  injection.renameCodes = [];
  injection.copyErrorCode = undefined;
  directory = mkdtempSync(join(tmpdir(), "bl-download-publish-"));
  destination = join(directory, "take.wav");
  writeFileSync(destination, "original-audio", { mode: 0o600 });
  chmodSync(destination, 0o600);
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(directory, { recursive: true, force: true });
});

test("backup rename EPERM aborts publish with the destination untouched", async () => {
  serveBody("new-audio");
  injection.renameCodes = ["EPERM", "EIO"];
  await expect(
    downloadFile("https://example.invalid/file", destination, { quiet: true }),
  ).rejects.toThrow("injected EPERM");
  expect(readFileSync(destination, "utf-8")).toBe("original-audio");
  expect(statSync(destination).mode & 0o777).toBe(0o600);
  expect(readdirSync(directory)).toEqual(["take.wav"]);
});

test("publish rename EPERM then copy EIO restores the previous file", async () => {
  serveBody("new-audio");
  injection.renameCodes = [null, "EPERM"];
  injection.copyErrorCode = "EIO";
  await expect(
    downloadFile("https://example.invalid/file", destination, { quiet: true }),
  ).rejects.toThrow("injected EIO");
  expect(readFileSync(destination, "utf-8")).toBe("original-audio");
  expect(statSync(destination).mode & 0o777).toBe(0o600);
  expect(readdirSync(directory)).toEqual(["take.wav"]);
});

test("publish rename EIO without fallback restores the previous file", async () => {
  serveBody("new-audio");
  injection.renameCodes = [null, "EIO"];
  await expect(
    downloadFile("https://example.invalid/file", destination, { quiet: true }),
  ).rejects.toThrow("injected EIO");
  expect(readFileSync(destination, "utf-8")).toBe("original-audio");
  expect(readdirSync(directory)).toEqual(["take.wav"]);
});

test("publish rename EPERM falls back to copy and keeps the previous mode", async () => {
  serveBody("new-audio");
  injection.renameCodes = [null, "EPERM"];
  expect(await downloadFile("https://example.invalid/file", destination, { quiet: true })).toEqual({
    size: 9,
  });
  expect(readFileSync(destination, "utf-8")).toBe("new-audio");
  expect(statSync(destination).mode & 0o777).toBe(0o600);
  expect(readdirSync(directory)).toEqual(["take.wav"]);
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

test("symlink publish failure restores the previous target bytes", async () => {
  const targetPath = join(directory, "canonical.wav");
  const linkPath = join(directory, "alias.wav");
  writeFileSync(targetPath, "original-audio", { mode: 0o600 });
  chmodSync(targetPath, 0o600);
  symlinkSync(targetPath, linkPath);

  serveBody("new-audio");
  injection.renameCodes = [null, "EIO"];
  await expect(
    downloadFile("https://example.invalid/file", linkPath, { quiet: true }),
  ).rejects.toThrow("injected EIO");

  expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
  expect(readFileSync(targetPath, "utf-8")).toBe("original-audio");
  expect(readFileSync(linkPath, "utf-8")).toBe("original-audio");
});

test("nested dangling symlink chain creates the final target and keeps links", async () => {
  const finalPath = join(directory, "final.wav");
  const midPath = join(directory, "mid.wav");
  const linkPath = join(directory, "out.wav");
  symlinkSync(finalPath, midPath);
  symlinkSync(midPath, linkPath);

  serveBody("new-audio");
  expect(await downloadFile("https://example.invalid/file", linkPath, { quiet: true })).toEqual({
    size: 9,
  });

  expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
  expect(lstatSync(midPath).isSymbolicLink()).toBe(true);
  expect(readFileSync(finalPath, "utf-8")).toBe("new-audio");
  expect(readFileSync(linkPath, "utf-8")).toBe("new-audio");
});

test("dangling symlink to another directory creates the target file", async () => {
  const otherDirectory = join(directory, "other");
  mkdirSync(otherDirectory);
  const targetPath = join(otherDirectory, "remote.wav");
  const linkPath = join(directory, "alias.wav");
  symlinkSync(targetPath, linkPath);

  serveBody("new-audio");
  expect(await downloadFile("https://example.invalid/file", linkPath, { quiet: true })).toEqual({
    size: 9,
  });

  expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
  expect(readFileSync(targetPath, "utf-8")).toBe("new-audio");
});

test("new publish path EXDEV falls back to copy beside the resolved target", async () => {
  const otherDirectory = join(directory, "other");
  mkdirSync(otherDirectory);
  const targetPath = join(otherDirectory, "remote.wav");
  const linkPath = join(directory, "alias.wav");
  symlinkSync(targetPath, linkPath);

  serveBody("new-audio");
  // First rename is temp -> publishPath (missing); EXDEV should copy instead of failing.
  injection.renameCodes = ["EXDEV"];
  expect(await downloadFile("https://example.invalid/file", linkPath, { quiet: true })).toEqual({
    size: 9,
  });

  expect(lstatSync(linkPath).isSymbolicLink()).toBe(true);
  expect(readFileSync(targetPath, "utf-8")).toBe("new-audio");
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

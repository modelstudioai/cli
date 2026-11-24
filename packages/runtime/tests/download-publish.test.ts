import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import {
  chmodSync,
  lstatSync,
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
import { httpTransport } from "bailian-cli-core";
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

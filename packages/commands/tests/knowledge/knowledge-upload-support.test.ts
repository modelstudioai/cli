import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { ExitCode } from "bailian-cli-core";
import {
  checkUploadFile,
  UPLOAD_FORMAT_RULES,
} from "../../src/commands/knowledge/upload-support.ts";

const fixtureDir = mkdtempSync(join(tmpdir(), "upload-support-"));

function writeFixture(fileName: string, content: string): string {
  const filePath = join(fixtureDir, fileName);
  writeFileSync(filePath, content);
  return filePath;
}

describe("checkUploadFile", () => {
  test("白名单内的小文件通过且无警告", () => {
    const filePath = writeFixture("note.md", "# hello");
    const result = checkUploadFile(filePath);
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(result.warning).toBeUndefined();
  });

  test("白名单外扩展名 (.zip) 抛 USAGE 并列出支持格式", () => {
    const filePath = writeFixture("archive.zip", "PK");
    try {
      checkUploadFile(filePath);
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as { exitCode: number }).exitCode).toBe(ExitCode.USAGE);
      expect((error as { hint?: string }).hint).toMatch(/\.pdf/);
    }
  });

  test("文件不存在抛 GENERAL 且 hint 含 errno", () => {
    try {
      checkUploadFile(join(fixtureDir, "missing.md"));
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as { exitCode: number }).exitCode).toBe(ExitCode.GENERAL);
      expect((error as { hint?: string }).hint).toMatch(/ENOENT/);
    }
  });

  test("软限类型 (.md) 超 10MB 返回警告不拦截", () => {
    const filePath = writeFixture("big.md", "x".repeat(11 * 1024 * 1024));
    const result = checkUploadFile(filePath);
    expect(result.warning).toMatch(/10 MB/);
  });
});

describe("UPLOAD_FORMAT_RULES", () => {
  test("硬限/软限分类符合设计表", () => {
    expect(UPLOAD_FORMAT_RULES[".pdf"]).toEqual({ maxBytes: 150 * 1024 * 1024, enforce: "block" });
    expect(UPLOAD_FORMAT_RULES[".png"]).toEqual({ maxBytes: 20 * 1024 * 1024, enforce: "block" });
    expect(UPLOAD_FORMAT_RULES[".xlsx"]).toEqual({ maxBytes: 10 * 1024 * 1024, enforce: "warn" });
    expect(UPLOAD_FORMAT_RULES[".csv"]).toBeDefined(); // inconsistent across public docs; kept in the allowlist
  });
});

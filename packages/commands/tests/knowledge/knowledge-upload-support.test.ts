import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { ExitCode } from "bailian-cli-core";
import {
  checkUploadFile,
  expandUploadPaths,
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

describe("expandUploadPaths", () => {
  const expandFixtureDir = mkdtempSync(join(tmpdir(), "expand-upload-"));

  function setupExpandFixtures(): void {
    // Root-level files
    writeFileSync(join(expandFixtureDir, "readme.md"), "# root");
    writeFileSync(join(expandFixtureDir, "data.csv"), "a,b,c");
    writeFileSync(join(expandFixtureDir, "config.json"), "{}"); // unsupported
    writeFileSync(join(expandFixtureDir, "script.py"), "print(1)"); // unsupported

    // Subdirectory with files
    const subDir = join(expandFixtureDir, "subdir");
    mkdirSync(subDir);
    writeFileSync(join(subDir, "notes.txt"), "hello");
    writeFileSync(join(subDir, "archive.zip"), "PK"); // unsupported

    // node_modules should be ignored
    const nodeModulesDir = join(expandFixtureDir, "node_modules");
    mkdirSync(nodeModulesDir);
    writeFileSync(join(nodeModulesDir, "index.js"), "module.exports = {}");

    // .git should be ignored
    const gitDir = join(expandFixtureDir, ".git");
    mkdirSync(gitDir);
    writeFileSync(join(gitDir, "HEAD"), "ref: refs/heads/main");
  }

  setupExpandFixtures();

  test("目录递归扫描: 支持的文件收集, 不支持的跳过, 忽略目录不进入", () => {
    const result = expandUploadPaths([expandFixtureDir]);
    const fileNames = result.files.map((filePath) => filePath.split("/").pop());
    const skippedNames = result.skipped.map((filePath) => filePath.split("/").pop());

    expect(fileNames).toContain("readme.md");
    expect(fileNames).toContain("data.csv");
    expect(fileNames).toContain("notes.txt");
    // Unsupported files in root and subdir
    expect(skippedNames).toContain("config.json");
    expect(skippedNames).toContain("script.py");
    expect(skippedNames).toContain("archive.zip");
    // node_modules and .git contents should NOT appear
    expect(fileNames).not.toContain("index.js");
    expect(skippedNames).not.toContain("index.js");
    expect(fileNames).not.toContain("HEAD");
    expect(skippedNames).not.toContain("HEAD");
  });

  test("单个文件路径直接返回", () => {
    const filePath = join(expandFixtureDir, "readme.md");
    const result = expandUploadPaths([filePath]);
    expect(result.files).toEqual([filePath]);
    expect(result.skipped).toEqual([]);
  });

  test("混合文件和目录路径", () => {
    const filePath = join(expandFixtureDir, "readme.md");
    const result = expandUploadPaths([filePath, expandFixtureDir]);
    // readme.md appears once from the direct file, once from the directory scan
    const mdCount = result.files.filter((path) => path.endsWith("readme.md")).length;
    expect(mdCount).toBe(2);
  });

  test("空目录返回空数组", () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "empty-upload-"));
    const result = expandUploadPaths([emptyDir]);
    expect(result.files).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  test("不存在的路径抛 GENERAL 且 hint 含 errno", () => {
    try {
      expandUploadPaths([join(expandFixtureDir, "nonexistent.md")]);
      expect.unreachable("should throw");
    } catch (error) {
      expect((error as { exitCode: number }).exitCode).toBe(ExitCode.GENERAL);
      expect((error as { hint?: string }).hint).toMatch(/ENOENT/);
    }
  });
});

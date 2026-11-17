import { afterEach, describe, expect, test } from "vite-plus/test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BailianError, createSnapshot, stageDataFiles } from "../src/index.ts";

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "bl-rl-snap-"));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

/** Build a source tree with a mix of safe / sensitive / excluded entries. */
function seedSource(sourceDir: string): void {
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(join(sourceDir, "main.py"), "print('hi')\n");
  writeFileSync(join(sourceDir, "reward.py"), "x = 1\n");
  mkdirSync(join(sourceDir, ".git"), { recursive: true });
  writeFileSync(join(sourceDir, ".git", "config"), "secret");
  mkdirSync(join(sourceDir, "node_modules"), { recursive: true });
  writeFileSync(join(sourceDir, "node_modules", "pkg.js"), "x");
  mkdirSync(join(sourceDir, "__pycache__"), { recursive: true });
  writeFileSync(join(sourceDir, "__pycache__", "main.pyc"), "x");
  writeFileSync(join(sourceDir, ".env"), "API_KEY=secret");
  writeFileSync(join(sourceDir, "cert.pem"), "secret");
  writeFileSync(join(sourceDir, "private.key"), "secret");
}

describe("createSnapshot", () => {
  test("applies built-in safety exclusions for dirs and secret files", () => {
    const root = makeTempRoot();
    const sourceDir = join(root, "src");
    seedSource(sourceDir);
    const result = createSnapshot({
      sourceDir,
      snapshotDir: join(root, "snapshot"),
      deployCopyDir: join(root, "deploy-copy"),
    });
    expect(result.files.sort()).toEqual(["main.py", "reward.py"]);
    expect(result.fileCount).toBe(2);
    expect(existsSync(join(root, "snapshot", ".git"))).toBe(false);
    expect(existsSync(join(root, "snapshot", ".env"))).toBe(false);
    expect(existsSync(join(root, "snapshot", "cert.pem"))).toBe(false);
  });

  test("produces a writable deploy-copy mirroring the snapshot", () => {
    const root = makeTempRoot();
    const sourceDir = join(root, "src");
    seedSource(sourceDir);
    const deployCopyDir = join(root, "deploy-copy");
    createSnapshot({
      sourceDir,
      snapshotDir: join(root, "snapshot"),
      deployCopyDir,
    });
    expect(readFileSync(join(deployCopyDir, "main.py"), "utf8")).toBe("print('hi')\n");
    // deploy-copy 可写：SDK 的 start.sh 落此。
    writeFileSync(join(deployCopyDir, "start.sh"), "#!/bin/sh\n");
    expect(existsSync(join(deployCopyDir, "start.sh"))).toBe(true);
  });

  test("honors include / exclude globs", () => {
    const root = makeTempRoot();
    const sourceDir = join(root, "src");
    mkdirSync(join(sourceDir, "pkg"), { recursive: true });
    writeFileSync(join(sourceDir, "pkg", "a.py"), "a");
    writeFileSync(join(sourceDir, "pkg", "b.txt"), "b");
    writeFileSync(join(sourceDir, "top.py"), "t");
    const result = createSnapshot({
      sourceDir,
      snapshotDir: join(root, "snapshot"),
      deployCopyDir: join(root, "deploy-copy"),
      include: ["**/*.py"],
      exclude: ["pkg/a.py"],
    });
    expect(result.files.sort()).toEqual(["top.py"]);
  });

  test("rejects symlinks in the source tree", () => {
    const root = makeTempRoot();
    const sourceDir = join(root, "src");
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(join(sourceDir, "main.py"), "x");
    symlinkSync(join(root, "outside"), join(sourceDir, "link.py"));
    expect(() =>
      createSnapshot({
        sourceDir,
        snapshotDir: join(root, "snapshot"),
        deployCopyDir: join(root, "deploy-copy"),
      }),
    ).toThrow(BailianError);
  });

  test("enforces the package size limit", () => {
    const root = makeTempRoot();
    const sourceDir = join(root, "src");
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(join(sourceDir, "big.bin"), "x".repeat(100));
    expect(() =>
      createSnapshot({
        sourceDir,
        snapshotDir: join(root, "snapshot"),
        deployCopyDir: join(root, "deploy-copy"),
        maxPackageBytes: 10,
      }),
    ).toThrow(/byte limit/);
  });
});

describe("stageDataFiles", () => {
  test("copies data files into data/ by basename", () => {
    const root = makeTempRoot();
    const dataFile = join(root, "train.jsonl");
    writeFileSync(dataFile, '{"a":1}\n');
    const dataDir = join(root, "data");
    const staged = stageDataFiles([dataFile], dataDir);
    expect(staged).toEqual([join(dataDir, "train.jsonl")]);
    expect(readFileSync(staged[0], "utf8")).toBe('{"a":1}\n');
  });

  test("rejects symlinked data files", () => {
    const root = makeTempRoot();
    const target = join(root, "real.jsonl");
    writeFileSync(target, "x");
    const link = join(root, "link.jsonl");
    symlinkSync(target, link);
    expect(() => stageDataFiles([link], join(root, "data"))).toThrow(BailianError);
  });
});

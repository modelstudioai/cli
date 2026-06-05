import { expect, test } from "vite-plus/test";
import { ExitCode, GLOBAL_OPTIONS } from "bailian-cli-core";
import { parseFlags } from "../src/args.ts";
import { BOOL_FLAG_WATERMARK } from "../src/utils/flag-descriptions.ts";

const IMAGE_GENERATE_OPTIONS = [
  { flag: "--prompt <text>", description: "Image description", required: true },
  { flag: "--model <model>", description: "Model ID" },
  { flag: "--watermark <bool>", description: BOOL_FLAG_WATERMARK },
  { flag: "--no-wait", description: "Return task ID immediately without waiting" },
];

test("parseFlags rejects unknown long flags", () => {
  expect(() =>
    parseFlags(["--prompt", "cat", "--xxxx", "a"], [...GLOBAL_OPTIONS, ...IMAGE_GENERATE_OPTIONS]),
  ).toThrowError(
    expect.objectContaining({
      name: "BailianError",
      exitCode: ExitCode.USAGE,
      message: expect.stringContaining('Unknown flag "--xxxx"'),
    }),
  );
});

test("parseFlags rejects unknown flags with = syntax", () => {
  expect(() =>
    parseFlags(
      ["--prompt=cat", "--unknown-flag=yes"],
      [...GLOBAL_OPTIONS, ...IMAGE_GENERATE_OPTIONS],
    ),
  ).toThrow(/Unknown flag "--unknown-flag"/);
});

test("parseFlags accepts defined command and global flags", () => {
  const flags = parseFlags(
    ["--quiet", "--prompt", "cat", "--watermark", "false"],
    [...GLOBAL_OPTIONS, ...IMAGE_GENERATE_OPTIONS],
  );
  expect(flags.quiet).toBe(true);
  expect(flags.prompt).toBe("cat");
  expect(flags.watermark).toBe("false");
});

test("parseFlags rejects value flag when next token is another flag", () => {
  const opts = [...GLOBAL_OPTIONS, ...IMAGE_GENERATE_OPTIONS];
  for (const argv of [
    ["--watermark", "--prompt", "cat"],
    ["--watermark", "-h"],
    ["--prompt", "cat", "--watermark", "--model", "qwen-image-2.0"],
  ]) {
    expect(() => parseFlags(argv, opts)).toThrowError(
      expect.objectContaining({
        name: "BailianError",
        exitCode: ExitCode.USAGE,
        message: expect.stringContaining("Flag --watermark requires a value"),
      }),
    );
  }
});

test("parseFlags rejects trailing value flag without value", () => {
  expect(() =>
    parseFlags(["--prompt", "cat", "--watermark"], [...GLOBAL_OPTIONS, ...IMAGE_GENERATE_OPTIONS]),
  ).toThrowError(
    expect.objectContaining({
      message: expect.stringContaining("Flag --watermark requires a value"),
    }),
  );
});

test("parseFlags allows boolean flags without values adjacent to other flags", () => {
  const opts = [...GLOBAL_OPTIONS, ...IMAGE_GENERATE_OPTIONS];
  const flags = parseFlags(
    ["--quiet", "--dry-run", "--no-wait", "--prompt", "cat", "--watermark", "false"],
    opts,
  );
  expect(flags.quiet).toBe(true);
  expect(flags.dryRun).toBe(true);
  expect(flags.noWait).toBe(true);
  expect(flags.prompt).toBe("cat");
  expect(flags.watermark).toBe("false");
});

test("parseFlags does not treat the next flag as a boolean flag value", () => {
  const opts = [...GLOBAL_OPTIONS, ...IMAGE_GENERATE_OPTIONS];
  expect(() => parseFlags(["--dry-run", "--prompt"], opts)).toThrowError(
    expect.objectContaining({
      message: expect.stringContaining("Flag --prompt requires a value"),
    }),
  );
  // --dry-run is boolean: no value check; parsing continues to --prompt.
  const flags = parseFlags(["--dry-run", "--prompt", "cat"], opts);
  expect(flags.dryRun).toBe(true);
  expect(flags.prompt).toBe("cat");
});

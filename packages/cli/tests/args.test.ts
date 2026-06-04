import { expect, test } from "vite-plus/test";
import { ExitCode, GLOBAL_OPTIONS } from "bailian-cli-core";
import { parseFlags } from "../src/args.ts";
import { BOOL_FLAG_WATERMARK } from "../src/utils/flag-descriptions.ts";

const IMAGE_GENERATE_OPTIONS = [
  { flag: "--prompt <text>", description: "Image description", required: true },
  { flag: "--model <model>", description: "Model ID" },
  { flag: "--watermark <bool>", description: BOOL_FLAG_WATERMARK },
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

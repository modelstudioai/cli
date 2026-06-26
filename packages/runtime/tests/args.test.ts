import { expect, test } from "vite-plus/test";
import { ExitCode, GLOBAL_OPTIONS, type OptionDef } from "bailian-cli-core";
import { parsePath, parseFlags } from "../src/args.ts";

const IMAGE_GENERATE_OPTIONS: OptionDef[] = [
  { flag: "--prompt <text>", description: "Image description", required: true },
  { flag: "--model <model>", description: "Model ID" },
  { flag: "--image <url>", description: "Image URL (repeatable)", type: "array" },
  { flag: "--n <count>", description: "Number of images", type: "number" },
  { flag: "--watermark <bool>", description: "Watermark", type: "boolean" },
  { flag: "--no-wait", description: "Return immediately", type: "switch" },
];
const OPTS = [...GLOBAL_OPTIONS, ...IMAGE_GENERATE_OPTIONS];

// ---- parsePath: routing only (command path first, then flags) ----

test("parsePath splits leading bare tokens as the command path", () => {
  const r = parsePath(["image", "generate", "--prompt", "cat"]);
  expect(r.path).toEqual(["image", "generate"]);
  expect(r.rest).toEqual(["--prompt", "cat"]);
});

test("parsePath stops the path at the first flag", () => {
  const r = parsePath(["speech"]);
  expect(r.path).toEqual(["speech"]);
  expect(r.rest).toEqual([]);
});

test("parsePath detects --help and --version in the flag region", () => {
  expect(parsePath(["image", "generate", "--help"]).hasHelpFlag).toBe(true);
  const v = parsePath(["--version"]);
  expect(v.hasVersionFlag).toBe(true);
  expect(v.path).toEqual([]);
});

// ---- parseFlags: typed parsing ----

test("parseFlags parses string / number / switch", () => {
  const flags = parseFlags(["--prompt", "cat", "--n", "3", "--no-wait"], OPTS);
  expect(flags.prompt).toBe("cat");
  expect(flags.n).toBe(3);
  expect(flags.noWait).toBe(true);
});

test("parseFlags supports the --flag=value form", () => {
  expect(parseFlags(["--prompt=cat"], OPTS).prompt).toBe("cat");
});

test("parseFlags coerces boolean flags to real booleans", () => {
  expect(parseFlags(["--prompt", "x", "--watermark", "false"], OPTS).watermark).toBe(false);
  expect(parseFlags(["--prompt", "x", "--watermark=true"], OPTS).watermark).toBe(true);
});

test("parseFlags collects repeated array flags", () => {
  expect(parseFlags(["--prompt", "x", "--image", "a", "--image", "b"], OPTS).image).toEqual([
    "a",
    "b",
  ]);
});

test("parseFlags accepts a lone - (stdin) and negative numbers as values", () => {
  expect(parseFlags(["--prompt", "x", "--model", "-"], OPTS).model).toBe("-");
  expect(parseFlags(["--prompt", "x", "--n", "-5"], OPTS).n).toBe(-5);
});

// ---- parseFlags: validation (all UsageError = exit 2) ----

test("parseFlags rejects a non true/false boolean value", () => {
  expect(() => parseFlags(["--prompt", "x", "--watermark", "yes"], OPTS)).toThrowError(
    expect.objectContaining({
      name: "UsageError",
      message: expect.stringContaining("true or false"),
    }),
  );
});

test("parseFlags rejects a repeated non-array flag", () => {
  expect(() => parseFlags(["--prompt", "a", "--prompt", "b"], OPTS)).toThrowError(
    expect.objectContaining({
      name: "UsageError",
      message: expect.stringContaining("more than once"),
    }),
  );
});

test("parseFlags rejects a switch given a value", () => {
  expect(() => parseFlags(["--prompt", "x", "--no-wait=true"], OPTS)).toThrowError(
    expect.objectContaining({
      name: "UsageError",
      message: expect.stringContaining("takes no value"),
    }),
  );
});

test("parseFlags rejects unknown long flags", () => {
  expect(() => parseFlags(["--prompt", "cat", "--xxxx", "a"], OPTS)).toThrowError(
    expect.objectContaining({
      name: "UsageError",
      exitCode: ExitCode.USAGE,
      message: expect.stringContaining('Unknown flag "--xxxx"'),
    }),
  );
});

test("parseFlags rejects short flags", () => {
  expect(() => parseFlags(["--prompt", "x", "-h"], OPTS)).toThrowError(
    expect.objectContaining({ name: "UsageError" }),
  );
});

test("parseFlags rejects unexpected bare tokens (no positionals)", () => {
  expect(() => parseFlags(["--prompt", "x", "stray"], OPTS)).toThrowError(
    expect.objectContaining({
      name: "UsageError",
      message: expect.stringContaining("Unexpected argument"),
    }),
  );
});

test("parseFlags rejects a value flag whose value is missing", () => {
  expect(() => parseFlags(["--prompt", "cat", "--model"], OPTS)).toThrowError(
    expect.objectContaining({ message: expect.stringContaining("Flag --model requires a value") }),
  );
});

test("parseFlags validates number flags", () => {
  expect(() => parseFlags(["--prompt", "x", "--n", "abc"], OPTS)).toThrowError(
    expect.objectContaining({ message: expect.stringContaining("finite number") }),
  );
});

test("parseFlags throws IncompleteCommandError when a required flag is missing", () => {
  expect(() => parseFlags(["--model", "qwen-image-2.0"], OPTS)).toThrowError(
    expect.objectContaining({
      name: "IncompleteCommandError",
      exitCode: ExitCode.SUCCESS,
      message: expect.stringContaining("Missing required flag: --prompt"),
    }),
  );
});

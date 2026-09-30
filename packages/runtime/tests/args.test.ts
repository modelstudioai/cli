import { expect, test } from "vite-plus/test";
import { ExitCode, GLOBAL_FLAGS, type FlagsDef } from "bailian-cli-core";
import { parsePath, parseFlags } from "../src/args.ts";

const IMAGE_GENERATE_FLAGS = {
  prompt: { type: "string", valueHint: "<text>", description: "Image description", required: true },
  model: { type: "string", valueHint: "<model>", description: "Model ID" },
  image: { type: "array", valueHint: "<url>", description: "Image URL (repeatable)" },
  n: { type: "number", valueHint: "<count>", description: "Number of images" },
  watermark: { type: "boolean", valueHint: "<bool>", description: "Watermark" },
  async: { type: "switch", description: "Return immediately" },
} satisfies FlagsDef;
const OPTS = { ...GLOBAL_FLAGS, ...IMAGE_GENERATE_FLAGS };

// ---- parsePath: routing (leading GLOBAL_FLAGS + command path + trailing flags) ----

test("parsePath splits leading bare tokens as the command path", () => {
  const r = parsePath(["image", "generate", "--prompt", "cat"]);
  expect(r.path).toEqual(["image", "generate"]);
  expect(r.rest).toEqual(["--prompt", "cat"]);
});

test("parsePath stops the path at the first trailing flag", () => {
  const r = parsePath(["speech"]);
  expect(r.path).toEqual(["speech"]);
  expect(r.rest).toEqual([]);
});

test("parsePath detects --help and --version in the flag region", () => {
  expect(parsePath(["image", "generate", "--help"]).hasHelpFlag).toBe(true);
  const v = parsePath(["--version"]);
  expect(v.hasVersionFlag).toBe(true);
  expect(v.path).toEqual([]);
  expect(v.rest).toEqual(["--version"]);
});

test("parsePath peels leading --config before the command path", () => {
  const r = parsePath(["--config", "token-plan", "config", "show"]);
  expect(r.path).toEqual(["config", "show"]);
  expect(r.rest).toEqual(["--config", "token-plan"]);
});

test("parsePath peels leading --config=value before the command path", () => {
  const r = parsePath(["--config=token-plan", "auth", "status"]);
  expect(r.path).toEqual(["auth", "status"]);
  expect(r.rest).toEqual(["--config=token-plan"]);
});

test("parsePath peels multiple leading global flags and keeps trailing flags", () => {
  const r = parsePath(["--verbose", "--config", "token-plan", "text", "chat", "--prompt", "hi"]);
  expect(r.path).toEqual(["text", "chat"]);
  expect(r.rest).toEqual(["--verbose", "--config", "token-plan", "--prompt", "hi"]);
});

test("parsePath still accepts global flags after the command path", () => {
  const r = parsePath(["config", "show", "--config", "token-plan", "--quiet"]);
  expect(r.path).toEqual(["config", "show"]);
  expect(r.rest).toEqual(["--config", "token-plan", "--quiet"]);
});

test("parsePath rejects unknown flags before the command path", () => {
  expect(() => parsePath(["--prompt", "hi", "text", "chat"])).toThrowError(
    expect.objectContaining({
      name: "UsageError",
      exitCode: ExitCode.USAGE,
      message: expect.stringContaining('Unknown flag "--prompt" before the command path'),
    }),
  );
});

test("parsePath rejects short flags before the command path", () => {
  expect(() => parsePath(["-h", "config", "show"])).toThrowError(
    expect.objectContaining({
      name: "UsageError",
      message: expect.stringContaining("Use the --long form"),
    }),
  );
});

// ---- parseFlags: typed parsing ----

test("parseFlags parses string / number / switch", () => {
  const flags = parseFlags(["--prompt", "cat", "--n", "3", "--async"], OPTS);
  expect(flags.prompt).toBe("cat");
  expect(flags.n).toBe(3);
  expect(flags.async).toBe(true);
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
  expect(() => parseFlags(["--prompt", "x", "--async=true"], OPTS)).toThrowError(
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

test("parseFlags throws UsageError when a required flag is missing", () => {
  expect(() => parseFlags(["--model", "qwen-image-2.0"], OPTS)).toThrowError(
    expect.objectContaining({
      name: "UsageError",
      exitCode: ExitCode.USAGE,
      message: expect.stringContaining("Missing required flag: --prompt"),
    }),
  );
});

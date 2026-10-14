import { expect, test } from "vite-plus/test";
import { defineCommand, ExitCode } from "bailian-cli-core";
import { CommandRegistry } from "../src/registry.ts";
import { resolve } from "../src/resolve.ts";

const command = defineCommand({
  description: "Test chat command",
  auth: "apiKey",
  flags: {
    prompt: { type: "string", valueHint: "<text>", description: "Prompt", required: true },
  },
  async run() {},
});
const registry = new CommandRegistry({ "text chat": command }, "bl");

test.each([
  { argv: [], path: [] },
  { argv: ["--config", "work"], path: [] },
  { argv: ["--config", "work", "text"], path: ["text"] },
  { argv: ["text", "--config=work"], path: ["text"] },
  { argv: ["--config=work", "text", "chat", "--help"], path: ["text", "chat"] },
  { argv: ["text", "chat", "--api-key", "fake-key", "--help"], path: ["text", "chat"] },
])("valid flags preserve help routing for $argv", ({ argv, path }) => {
  expect(resolve(argv, registry)).toMatchObject({ kind: "help", path });
});

test.each([
  ["--config"],
  ["--unknown", "text", "chat"],
  ["--constructor=ignored", "text", "chat"],
  ["text", "--timeout", "invalid"],
  ["text", "--timeout", "0"],
  ["text", "--timeout", "-1"],
  ["text", "--config"],
  ["text", "--quiet=true"],
  ["--config=first", "text", "--config=second"],
  ["text", "--unknown"],
  ["text", "--timeout", "--help"],
  ["text", "chat", "--unknown", "--help"],
  ["text", "chat", "--timeout", "invalid", "--help"],
  ["text", "chat", "--timeout=0", "--help"],
  ["--timeout=-1", "--version"],
  ["text", "chat", "--prompt", "--help"],
  ["text", "chat", "--constructor=ignored", "--help"],
  ["--quiet=true", "--version"],
  ["--timeout", "invalid", "text", "chat", "--prompt", "hi"],
  ["--timeout=0", "text", "chat", "--prompt", "hi"],
  ["--quiet=true", "text", "chat", "--prompt", "hi"],
  ["--config=first", "text", "chat", "--config=second", "--prompt", "hi"],
  ["text", "chat", "--prompt", "hi", "--timeout=-1"],
  ["text", "chat", "--unknown"],
])("invalid input returns usageError instead of help or version: %j", (...argv) => {
  expect(resolve(argv, registry)).toMatchObject({
    kind: "usageError",
    error: { name: "UsageError", exitCode: ExitCode.USAGE },
  });
});

test("mixed leading and trailing flags reach the selected leaf command", () => {
  expect(
    resolve(["--config=work", "text", "chat", "--prompt", "hi", "--quiet"], registry),
  ).toMatchObject({
    kind: "run",
    path: ["text", "chat"],
    command,
    rest: ["--config=work", "--prompt", "hi", "--quiet"],
    parsedFlags: { config: "work", prompt: "hi", quiet: true },
  });
});

test("run resolution carries typed flags so dispatch can reuse them", () => {
  expect(resolve(["--timeout=20", "text", "chat", "--prompt=hi"], registry)).toMatchObject({
    kind: "run",
    parsedFlags: { timeout: 20, prompt: "hi", quiet: false },
  });
});

test("help resolution carries the selected profile and parsed flags", () => {
  expect(resolve(["--config=work", "text", "chat", "--help"], registry)).toMatchObject({
    kind: "help",
    path: ["text", "chat"],
    parsedFlags: { config: "work", help: true },
  });
});

test("bare leaf commands with required flags show help, while supplied flags enforce requirements", () => {
  expect(resolve(["text", "chat"], registry)).toMatchObject({
    kind: "help",
    path: ["text", "chat"],
  });
  expect(resolve(["text", "chat", "--quiet"], registry)).toMatchObject({
    kind: "usageError",
    error: { exitCode: ExitCode.USAGE },
  });
});

test("global flags between command path segments are rejected", () => {
  expect(resolve(["text", "--config=work", "chat"], registry)).toMatchObject({
    kind: "usageError",
    error: { exitCode: ExitCode.USAGE },
  });
});

test("version remains available without required command arguments", () => {
  expect(resolve(["text", "chat", "--version"], registry)).toEqual({ kind: "version" });
});

test.each([
  { argv: ["--config"], message: "Flag --config requires a value." },
  { argv: ["--timeout", "--quiet", "text"], message: "Flag --timeout requires a value." },
  { argv: ["--timeout", "--help"], message: "Flag --timeout requires a value." },
  {
    argv: ["--config", "work", "--timeout", "--version"],
    message: "Flag --timeout requires a value.",
  },
  {
    argv: ["--quiet=true", "--timeout"],
    message: "Flag --quiet is a switch and takes no value.",
  },
  {
    argv: ["--timeout", "invalid", "--config"],
    message: "Flag --timeout requires a finite number.",
  },
  {
    argv: ["--config", "first", "--config", "second", "--timeout"],
    message: "Flag --config given more than once.",
  },
])("unified validation reports the first flag error for $argv", ({ argv, message }) => {
  expect(resolve(argv, registry)).toMatchObject({
    kind: "usageError",
    error: { exitCode: ExitCode.USAGE, message },
  });
});

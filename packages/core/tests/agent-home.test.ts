import { afterEach, describe, expect, test } from "vite-plus/test";
import { join } from "node:path";
import { getHermesHome } from "../src/utils/agent-home.ts";

/**
 * getHermesHome must mirror hermes-agent's own resolution:
 *   HERMES_HOME env var (expanded) → platform-native default.
 * A wrong fallback makes `bl config agent --agent hermes` write config Hermes
 * never reads (see issue #131).
 */

const originalPlatform = process.platform;
const savedEnv = {
  HERMES_HOME: process.env.HERMES_HOME,
  LOCALAPPDATA: process.env.LOCALAPPDATA,
};

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value, configurable: true });
}

afterEach(() => {
  setPlatform(originalPlatform);
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("getHermesHome", () => {
  test("HERMES_HOME wins over the platform default (absolute path)", () => {
    setPlatform("linux");
    delete process.env.LOCALAPPDATA;
    process.env.HERMES_HOME = "/opt/custom/hermes";
    expect(getHermesHome("/home/u")).toBe("/opt/custom/hermes");
  });

  test("HERMES_HOME is trimmed and a leading ~ is expanded", () => {
    setPlatform("darwin");
    process.env.HERMES_HOME = "  ~/profiles/coder  ";
    // The injected home arg is only the fallback base; ~ expands via homedir().
    expect(getHermesHome("/home/u")).toMatch(/profiles[/\\]coder$/);
    expect(getHermesHome("/home/u").startsWith("~")).toBe(false);
  });

  test("falls back to <home>/.hermes on Linux/macOS when HERMES_HOME is unset", () => {
    setPlatform("darwin");
    delete process.env.HERMES_HOME;
    expect(getHermesHome("/home/u")).toBe("/home/u/.hermes");
  });

  test("falls back to %LOCALAPPDATA%\\hermes on Windows when HERMES_HOME is unset", () => {
    setPlatform("win32");
    delete process.env.HERMES_HOME;
    process.env.LOCALAPPDATA = "C:\\Users\\u\\AppData\\Local";
    // Build the expectation with join() so the assertion is separator-agnostic
    // (path.join uses the runner's separator, not the stubbed process.platform).
    expect(getHermesHome("C:\\Users\\u")).toBe(join("C:\\Users\\u\\AppData\\Local", "hermes"));
  });

  test("Windows without LOCALAPPDATA falls back to <home>/AppData/Local/hermes", () => {
    setPlatform("win32");
    delete process.env.HERMES_HOME;
    delete process.env.LOCALAPPDATA;
    expect(getHermesHome("C:\\Users\\u")).toBe(join("C:\\Users\\u", "AppData", "Local", "hermes"));
  });

  test("an empty/whitespace HERMES_HOME is ignored", () => {
    setPlatform("linux");
    process.env.HERMES_HOME = "   ";
    expect(getHermesHome("/home/u")).toBe("/home/u/.hermes");
  });
});

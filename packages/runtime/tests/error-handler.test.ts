import { ExitCode } from "bailian-cli-core";
import { expect, test } from "vite-plus/test";
import { handleError } from "../src/error-handler.ts";

test("handleError: fetch failed JSON includes cause.code from errno", () => {
  const previousOutput = process.env.DASHSCOPE_OUTPUT;
  process.env.DASHSCOPE_OUTPUT = "json";

  let stderr = "";
  const originalWrite = process.stderr.write.bind(process.stderr);
  const originalExit = process.exit;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += String(chunk);
    return true;
  }) as typeof process.stderr.write;
  process.exit = ((code?: number) => {
    throw new Error(`process.exit:${code ?? 0}`);
  }) as typeof process.exit;

  const root = Object.assign(new Error("getaddrinfo ENOTFOUND example.invalid"), {
    code: "ENOTFOUND",
  });
  const fetchFailed = new TypeError("fetch failed", { cause: root });

  try {
    expect(() => handleError(fetchFailed, "bl")).toThrow(
      new RegExp(`process\\.exit:${ExitCode.NETWORK}`),
    );
    const payload = JSON.parse(stderr.trim()) as {
      error: { code: number; message: string; cause?: { message: string; code?: string } };
    };
    expect(payload.error.code).toBe(ExitCode.NETWORK);
    expect(payload.error.message).toMatch(/ENOTFOUND/);
    expect(payload.error.cause).toEqual({
      message: root.message,
      code: "ENOTFOUND",
    });
  } finally {
    process.stderr.write = originalWrite;
    process.exit = originalExit;
    if (previousOutput === undefined) {
      delete process.env.DASHSCOPE_OUTPUT;
    } else {
      process.env.DASHSCOPE_OUTPUT = previousOutput;
    }
  }
});

test("handleError: fetch failed without nested cause still maps to NETWORK", () => {
  const previousOutput = process.env.DASHSCOPE_OUTPUT;
  process.env.DASHSCOPE_OUTPUT = "json";

  let stderr = "";
  const originalWrite = process.stderr.write.bind(process.stderr);
  const originalExit = process.exit;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += String(chunk);
    return true;
  }) as typeof process.stderr.write;
  process.exit = ((code?: number) => {
    throw new Error(`process.exit:${code ?? 0}`);
  }) as typeof process.exit;

  const fetchFailed = new TypeError("fetch failed");

  try {
    expect(() => handleError(fetchFailed, "bl")).toThrow(
      new RegExp(`process\\.exit:${ExitCode.NETWORK}`),
    );
    const payload = JSON.parse(stderr.trim()) as {
      error: { code: number; message: string; cause?: { message: string; code?: string } };
    };
    expect(payload.error.code).toBe(ExitCode.NETWORK);
    expect(payload.error.message).toMatch(/unknown cause/);
    expect(payload.error.cause).toEqual({ message: "fetch failed" });
  } finally {
    process.stderr.write = originalWrite;
    process.exit = originalExit;
    if (previousOutput === undefined) {
      delete process.env.DASHSCOPE_OUTPUT;
    } else {
      process.env.DASHSCOPE_OUTPUT = previousOutput;
    }
  }
});

import { BailianError, ExitCode } from "bailian-cli-core";
import { expect, test, vi } from "vite-plus/test";
import { handleError } from "../src/error-handler.ts";
import { ConfirmationRequiredError } from "../src/confirm.ts";

test.each(["text", "json"])(
  "expired Console login instructions use the host prefix (%s)",
  (format) => {
    let diagnostic = "";
    const output = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      diagnostic += String(chunk);
      return true;
    });
    const exiting = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });
    vi.stubEnv("DASHSCOPE_OUTPUT", format);
    try {
      const error = new BailianError(
        "Console session is not logged in or has expired.",
        ExitCode.AUTH,
        undefined,
        { authDomain: "console" },
      );
      expect(() => handleError(error, "aliyun bl")).toThrow("exit");
      const hint = format === "json" ? JSON.parse(diagnostic).error.hint : diagnostic;
      expect(hint).toContain("aliyun bl auth login --console");
      expect(hint).not.toContain("--api-key");
    } finally {
      output.mockRestore();
      exiting.mockRestore();
      vi.unstubAllEnvs();
    }
  },
);

test("host error display preserves service text and hints containing bare commands", () => {
  let diagnostic = "";
  const output = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    diagnostic += String(chunk);
    return true;
  });
  const exiting = vi.spyOn(process, "exit").mockImplementation(() => {
    throw new Error("exit");
  });
  vi.stubEnv("DASHSCOPE_OUTPUT", "json");
  const message = "Server returned: bl auth login is part of user data";
  const hint = "Original server hint: bl config show";
  try {
    expect(() =>
      handleError(new BailianError(message, ExitCode.GENERAL, hint), "aliyun bl"),
    ).toThrow("exit");
    expect(JSON.parse(diagnostic).error).toMatchObject({ message, hint, code: 1 });
  } finally {
    output.mockRestore();
    exiting.mockRestore();
    vi.unstubAllEnvs();
  }
});

test("handleError: fetch failed JSON includes cause.code from errno", () => {
  const previousOutput = process.env.DASHSCOPE_OUTPUT;
  process.env.DASHSCOPE_OUTPUT = "json";

  let stderr = "";
  const originalWrite = process.stderr.write.bind(process.stderr);
  const originalExit = process.exit.bind(process);
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
    expect(stderr).toMatch(/^\{\n {2}"error": \{\n/);
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
  const originalExit = process.exit.bind(process);
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

test("handleError: confirmation text uses the standard message and hint layout", () => {
  const previousOutput = process.env.DASHSCOPE_OUTPUT;
  delete process.env.DASHSCOPE_OUTPUT;

  let stderr = "";
  const originalWrite = process.stderr.write.bind(process.stderr);
  const originalExit = process.exit.bind(process);
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += String(chunk);
    return true;
  }) as typeof process.stderr.write;
  process.exit = ((code?: number) => {
    throw new Error(`process.exit:${code ?? 0}`);
  }) as typeof process.exit;

  const confirmation = new ConfirmationRequiredError({
    message: "This permanently deletes the selected documents and all of their chunks.",
    hint: "This command performs a high-risk operation. To continue, add --yes to the original command and re-run it.",
  });

  try {
    expect(() => handleError(confirmation, "bl")).toThrow(
      new RegExp(`process\\.exit:${ExitCode.CONFIRMATION_REQUIRED}`),
    );
    expect(stderr).toContain(
      "This command performs a high-risk operation. To continue, add --yes to the original command and re-run it.",
    );
    expect(stderr).not.toContain("bl knowledge doc delete");
    expect(stderr).not.toContain("Risk:");
    expect(stderr).not.toContain("Action:");
    expect(stderr).not.toContain("Note:");
  } finally {
    process.stderr.write = originalWrite;
    process.exit = originalExit;
    if (previousOutput === undefined) delete process.env.DASHSCOPE_OUTPUT;
    else process.env.DASHSCOPE_OUTPUT = previousOutput;
  }
});

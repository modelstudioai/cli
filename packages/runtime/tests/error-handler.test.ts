import { BailianError, ExitCode } from "bailian-cli-core";
import { expect, test, vi } from "vite-plus/test";
import { handleError } from "../src/error-handler.ts";
import { createOutputReporter } from "../src/output/reporter.ts";
import { ConfirmationRequiredError } from "../src/confirm.ts";

function render(error: unknown, output: "text" | "json" = "json") {
  let stderr = "";
  const reporter = createOutputReporter({
    settings: { output, quiet: true, verbose: false },
    binName: "kscli",
    stderr: {
      write: (chunk) => {
        stderr += chunk;
      },
    },
  });
  const exit = vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Error(`process.exit:${code ?? 0}`);
  });
  try {
    expect(() => handleError(error, reporter)).toThrow(/process.exit:/);
  } finally {
    exit.mockRestore();
  }
  return stderr;
}

test("handleError: fetch failed JSON includes cause.code from errno", () => {
  const cause = Object.assign(new Error("getaddrinfo ENOTFOUND example.invalid"), {
    code: "ENOTFOUND",
  });
  const stderr = render(new TypeError("fetch failed", { cause }));
  expect(stderr.trim().split("\n")).toHaveLength(1);
  expect(JSON.parse(stderr).error).toMatchObject({
    code: ExitCode.NETWORK,
    cause: { message: cause.message, code: "ENOTFOUND" },
  });
});

test("handleError: fetch without nested cause still maps to NETWORK", () => {
  const payload = JSON.parse(render(new TypeError("fetch failed"))).error;
  expect(payload.code).toBe(ExitCode.NETWORK);
  expect(payload.message).toContain("unknown cause");
  expect(payload.cause).toEqual({ message: "fetch failed" });
});

test("handleError: confirmation preserves its structured subtype and guidance", () => {
  const confirmation = new ConfirmationRequiredError({
    message: "Permanent deletion.",
    hint: "Add --yes to continue.",
  });
  expect(JSON.parse(render(confirmation))).toEqual(confirmation.toJSON());
  const text = render(confirmation, "text");
  expect(text).toContain("Add --yes to continue.");
  expect(text).not.toContain("Risk:");
});

test("model-auth guidance uses the invocation binary and does not leak into console errors", () => {
  const auth = JSON.parse(render(new BailianError("No key", ExitCode.AUTH))).error;
  expect(auth.hint).toContain("kscli auth status");
  const consoleError = new BailianError(
    "No console token",
    ExitCode.AUTH,
    "Run kscli auth login --console",
  );
  expect(JSON.parse(render(consoleError))).toEqual(consoleError.toJSON());
});

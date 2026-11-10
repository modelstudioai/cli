import { BailianError, ExitCode, mapApiError } from "bailian-cli-core";
import { expect, test, vi } from "vite-plus/test";
import { errorHint, handleError } from "../src/error-handler.ts";
import { createOutputReporter } from "../src/output/reporter.ts";
import { ConfirmationRequiredError } from "../src/confirm.ts";

function render(
  error: unknown,
  output: "text" | "json" = "json",
  options: { commandPrefix?: string; supportsFreeTierRecovery?: boolean } = {},
) {
  let stderr = "";
  const reporter = createOutputReporter({
    settings: { output, quiet: true, verbose: false },
    commandPrefix: options.commandPrefix ?? "kscli",
    supportsFreeTierRecovery: options.supportsFreeTierRecovery,
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

const FREE_TIER_ONLY_API_CODE = "AllocationQuota.FreeTierOnly";
const FREE_TIER_MESSAGE =
  'The free tier of the model has been exhausted. If you wish to continue access the model on a paid basis, please disable the "use free tier only" mode in the management console.';
const FREE_QUOTA_MESSAGE =
  'Free quota exhausted. To continue accessing the model on a paid basis, please add funds or disable the "use free tier only" mode in the management console.';

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

test("free-tier hint appends for AllocationQuota.FreeTierOnly when product supports usage", () => {
  const error = new BailianError(FREE_TIER_MESSAGE, ExitCode.GENERAL, undefined, {
    api: { httpStatus: 403, apiCode: FREE_TIER_ONLY_API_CODE },
  });
  const payload = JSON.parse(
    render(error, "json", { commandPrefix: "bl", supportsFreeTierRecovery: true }),
  ).error;
  expect(payload.code).toBe(ExitCode.GENERAL);
  expect(payload.message).toBe(FREE_TIER_MESSAGE);
  expect(payload.hint).toContain("bl usage free --model <model>");
  expect(payload.hint).toContain("bl usage freetier --off --model <model> --yes");
  expect(payload.hint).not.toContain("--all");
  const text = render(error, "text", { commandPrefix: "bl", supportsFreeTierRecovery: true });
  expect(text).toContain("Hint:");
  expect(text).toContain("usage freetier --off");
});

test("free-tier hint uses message fallback when type shadows AllocationQuota.FreeTierOnly code", () => {
  const error = mapApiError(400, {
    error: {
      message: FREE_TIER_MESSAGE,
      type: "invalid_request_error",
      code: FREE_TIER_ONLY_API_CODE,
    },
  });
  expect(error.api?.apiCode).toBe("invalid_request_error");
  const hint = errorHint(error, "bl", (text) => (typeof text === "string" ? text : text["en-US"]), {
    supportsFreeTierRecovery: true,
  });
  expect(hint).toContain("bl usage freetier --off");
});

test("OpenAI-compat Free quota exhausted copy matches via use free tier only phrase", () => {
  const error = new BailianError(FREE_QUOTA_MESSAGE, ExitCode.GENERAL);
  const payload = JSON.parse(
    render(error, "json", { commandPrefix: "bl", supportsFreeTierRecovery: true }),
  ).error;
  expect(payload.hint).toContain("bl usage freetier --off --model <model> --yes");
});

test("insufficient_quota TPS/TPM message does not get free-tier recovery", () => {
  const error = new BailianError(
    "You exceeded your current quota, please check your plan and billing details.",
    ExitCode.GENERAL,
    undefined,
    { api: { apiCode: "insufficient_quota" } },
  );
  const payload = JSON.parse(
    render(error, "json", { commandPrefix: "bl", supportsFreeTierRecovery: true }),
  ).error;
  expect(payload.hint).toBeUndefined();
});

test("free-tier hint is skipped when the product does not expose usage commands", () => {
  const error = new BailianError(FREE_TIER_MESSAGE, ExitCode.GENERAL, undefined, {
    api: { apiCode: FREE_TIER_ONLY_API_CODE },
  });
  const payload = JSON.parse(
    render(error, "json", { commandPrefix: "kscli", supportsFreeTierRecovery: false }),
  ).error;
  expect(payload.hint).toBeUndefined();
  expect(payload.message).toBe(FREE_TIER_MESSAGE);
});

test("free-tier hint appends after an existing hint without replacing it", () => {
  const existing = "Task id: task-demo";
  const error = new BailianError(FREE_QUOTA_MESSAGE, ExitCode.GENERAL, existing);
  const payload = JSON.parse(
    render(error, "json", { commandPrefix: "bl", supportsFreeTierRecovery: true }),
  ).error;
  expect(payload.hint?.startsWith(existing)).toBe(true);
  expect(payload.hint).toContain("usage freetier --off");
});

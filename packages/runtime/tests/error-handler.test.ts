import { BailianError, ExitCode, mapApiError, resolveRecoveryConfigName } from "bailian-cli-core";
import { expect, test, vi } from "vite-plus/test";
import { errorHint, handleError, normalizeError } from "../src/error-handler.ts";
import { createOutputReporter } from "../src/output/reporter.ts";
import { ConfirmationRequiredError } from "../src/confirm.ts";

const blHasCommand = (path: string) => path === "usage free" || path === "usage freetier";
const kscliHasCommand = () => false;

async function render(
  error: unknown,
  output: "text" | "json" = "json",
  options: {
    commandPrefix?: string;
    hasCommand?: (path: string) => boolean;
    configName?: string;
  } = {},
  beforeError?: (reporter: ReturnType<typeof createOutputReporter>) => void,
) {
  let stderr = "";
  const reporter = createOutputReporter({
    settings: { output, quiet: true, verbose: false },
    commandPrefix: options.commandPrefix ?? "kscli",
    hasCommand: options.hasCommand,
    configName: options.configName,
    stderr: {
      write: (chunk) => {
        stderr += chunk;
      },
    },
  });
  beforeError?.(reporter);
  const exit = vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new Error(`process.exit:${code ?? 0}`);
  });
  try {
    await expect(handleError(error, reporter)).rejects.toThrow(/process.exit:/);
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

test("handleError: fetch failed JSON includes cause.code from errno", async () => {
  const cause = Object.assign(new Error("getaddrinfo ENOTFOUND example.invalid"), {
    code: "ENOTFOUND",
  });
  const stderr = await render(new TypeError("fetch failed", { cause }));
  expect(stderr.trim().split("\n")).toHaveLength(1);
  expect(JSON.parse(stderr).error).toMatchObject({
    code: ExitCode.NETWORK,
    cause: { message: cause.message, code: "ENOTFOUND" },
  });
});

test("handleError: fetch without nested cause still maps to NETWORK", async () => {
  const payload = JSON.parse(await render(new TypeError("fetch failed"))).error;
  expect(payload.code).toBe(ExitCode.NETWORK);
  expect(payload.message).toContain("unknown cause");
  expect(payload.cause).toEqual({ message: "fetch failed" });
});

test("handleError: 沙箱拒绝 errno（EPERM）hint 引导放行网络而非换镜像", async () => {
  const cause = Object.assign(new Error("connect EPERM 1.2.3.4:443"), { code: "EPERM" });
  const payload = JSON.parse(await render(new TypeError("fetch failed", { cause }))).error;
  expect(payload.code).toBe(ExitCode.NETWORK);
  expect(payload.message).toContain("EPERM");
  expect(payload.hint).toContain("agent sandbox");
  expect(payload.hint).toContain("HTTPS_PROXY");
});

test("normalizeError: 沙箱拒绝 hint 中文本地化", () => {
  const cause = Object.assign(new Error("connect ENETUNREACH"), { code: "ENETUNREACH" });
  const normalized = normalizeError(new TypeError("fetch failed", { cause }), "bl", (text) =>
    typeof text === "string" ? text : text["zh-CN"],
  );
  expect(normalized.exitCode).toBe(ExitCode.NETWORK);
  expect(normalized.hint).toContain("沙箱");
  expect(normalized.hint).toContain("HTTPS_PROXY");
});

test("handleError: confirmation preserves its structured subtype and guidance", async () => {
  const confirmation = new ConfirmationRequiredError({
    message: "Permanent deletion.",
    hint: "Add --yes to continue.",
  });
  expect(JSON.parse(await render(confirmation))).toEqual(confirmation.toJSON());
  const text = await render(confirmation, "text");
  expect(text).toContain("Add --yes to continue.");
  expect(text).not.toContain("Risk:");
});

test("model-auth guidance uses the invocation binary and does not leak into console errors", async () => {
  const auth = JSON.parse(await render(new BailianError("No key", ExitCode.AUTH))).error;
  expect(auth.hint).toContain("kscli auth status");
  const consoleError = new BailianError(
    "No console token",
    ExitCode.AUTH,
    "Run kscli auth login --console",
  );
  expect(JSON.parse(await render(consoleError))).toEqual(consoleError.toJSON());
});

test("free-tier hint appends for AllocationQuota.FreeTierOnly when product supports usage", async () => {
  const error = new BailianError(FREE_TIER_MESSAGE, ExitCode.GENERAL, undefined, {
    api: { httpStatus: 403, apiCode: FREE_TIER_ONLY_API_CODE },
  });
  const payload = JSON.parse(
    await render(error, "json", { commandPrefix: "bl", hasCommand: blHasCommand }),
  ).error;
  expect(payload.code).toBe(ExitCode.GENERAL);
  expect(payload.message).toBe(FREE_TIER_MESSAGE);
  expect(payload.hint).toContain("bl usage free --model <model>");
  expect(payload.hint).toContain("bl usage freetier --off --model <model>");
  expect(payload.hint).not.toContain("--yes");
  expect(payload.hint).not.toContain("--all");
  const text = await render(error, "text", { commandPrefix: "bl", hasCommand: blHasCommand });
  expect(text).toContain("Hint:");
  expect(text).toContain("usage freetier --off");
  expect(text).not.toContain("--yes");
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
    hasCommand: blHasCommand,
  });
  expect(hint).toContain("bl usage freetier --off");
});

test("OpenAI-compat Free quota exhausted copy matches via use free tier only phrase", async () => {
  const error = new BailianError(FREE_QUOTA_MESSAGE, ExitCode.GENERAL);
  const payload = JSON.parse(
    await render(error, "json", { commandPrefix: "bl", hasCommand: blHasCommand }),
  ).error;
  expect(payload.hint).toContain("bl usage freetier --off --model <model>");
  expect(payload.hint).not.toContain("--yes");
});

test("insufficient_quota TPS/TPM message does not get free-tier recovery", async () => {
  const error = new BailianError(
    "You exceeded your current quota, please check your plan and billing details.",
    ExitCode.GENERAL,
    undefined,
    { api: { apiCode: "insufficient_quota" } },
  );
  const payload = JSON.parse(
    await render(error, "json", { commandPrefix: "bl", hasCommand: blHasCommand }),
  ).error;
  expect(payload.hint).toBeUndefined();
});

test("free-tier hint is skipped when the product does not expose usage commands", async () => {
  const error = new BailianError(FREE_TIER_MESSAGE, ExitCode.GENERAL, undefined, {
    api: { apiCode: FREE_TIER_ONLY_API_CODE },
  });
  const payload = JSON.parse(
    await render(error, "json", { commandPrefix: "kscli", hasCommand: kscliHasCommand }),
  ).error;
  expect(payload.hint).toBeUndefined();
  expect(payload.message).toBe(FREE_TIER_MESSAGE);
});

test("free-tier hint appends after an existing hint without replacing it", async () => {
  const existing = "Task id: task-demo";
  const error = new BailianError(FREE_QUOTA_MESSAGE, ExitCode.GENERAL, existing);
  const payload = JSON.parse(
    await render(error, "json", { commandPrefix: "bl", hasCommand: blHasCommand }),
  ).error;
  expect(payload.hint?.startsWith(existing)).toBe(true);
  expect(payload.hint).toContain("usage freetier --off");
  expect(payload.hint).not.toContain("--yes");
});

test("free-tier hint does not duplicate when existing hint already contains full recovery text", async () => {
  const recovery = errorHint(
    new BailianError(FREE_TIER_MESSAGE, ExitCode.GENERAL, undefined, {
      api: { apiCode: FREE_TIER_ONLY_API_CODE },
    }),
    "bl",
    (text) => (typeof text === "string" ? text : text["en-US"]),
    { hasCommand: blHasCommand },
  );
  expect(recovery).toBeTruthy();
  const error = new BailianError(FREE_TIER_MESSAGE, ExitCode.GENERAL, recovery, {
    api: { apiCode: FREE_TIER_ONLY_API_CODE },
  });
  const payload = JSON.parse(
    await render(error, "json", { commandPrefix: "bl", hasCommand: blHasCommand }),
  ).error;
  expect(payload.hint).toBe(recovery);
  expect(payload.hint?.split("usage freetier").length - 1).toBe(1);
});

test("free-tier hint still appends when existing hint only mentions usage freetier loosely", async () => {
  const existing = "Already guided: bl usage freetier --off --model demo";
  const error = new BailianError(FREE_TIER_MESSAGE, ExitCode.GENERAL, existing, {
    api: { apiCode: FREE_TIER_ONLY_API_CODE },
  });
  const payload = JSON.parse(
    await render(error, "json", { commandPrefix: "bl", hasCommand: blHasCommand }),
  ).error;
  expect(payload.hint?.startsWith(existing)).toBe(true);
  expect(payload.hint?.split("usage freetier").length - 1).toBe(2);
});

test("recovery hints append --config when a named profile is active", async () => {
  const freeTier = new BailianError(FREE_TIER_MESSAGE, ExitCode.GENERAL, undefined, {
    api: { httpStatus: 403, apiCode: FREE_TIER_ONLY_API_CODE },
  });
  const freeTierHint = JSON.parse(
    await render(freeTier, "json", {
      commandPrefix: "bl",
      hasCommand: blHasCommand,
      configName: "prod",
    }),
  ).error.hint as string;
  expect(freeTierHint).toContain("bl usage free --model <model> --config prod");
  expect(freeTierHint).toContain("bl usage freetier --off --model <model> --config prod");

  const authHint = JSON.parse(
    await render(new BailianError("No key", ExitCode.AUTH), "json", {
      commandPrefix: "bl",
      configName: "prod",
    }),
  ).error.hint as string;
  expect(authHint).toContain("bl auth login --api-key <your-key> --config prod");
  expect(authHint).toContain("bl auth status --config prod");

  const timeoutHint = JSON.parse(
    await render(Object.assign(new Error("timed out"), { name: "TimeoutError" }), "json", {
      commandPrefix: "bl",
      configName: "prod",
    }),
  ).error.hint as string;
  expect(timeoutHint).toContain("bl config show --config prod");
  expect(timeoutHint).toContain("bl auth status --config prod");
});

test("recovery hints omit --config for the implicit default profile", async () => {
  const payload = JSON.parse(
    await render(new BailianError("No key", ExitCode.AUTH), "json", { commandPrefix: "bl" }),
  ).error;
  expect(payload.hint).toContain("bl auth status");
  expect(payload.hint).not.toContain("--config");
});

test("recovery hints keep explicit --config default when active profile is named", async () => {
  // Loader normalizes explicit default to undefined; resolveRecoveryConfigName must restore it.
  expect(resolveRecoveryConfigName({ flags: { config: "default" }, configName: undefined })).toBe(
    "default",
  );
  expect(resolveRecoveryConfigName({ flags: { config: "prod" }, configName: "prod" })).toBe("prod");
  expect(resolveRecoveryConfigName({ flags: {}, configName: "prod" })).toBe("prod");
  expect(resolveRecoveryConfigName({ flags: {}, configName: undefined })).toBeUndefined();

  const hint = JSON.parse(
    await render(new BailianError("No key", ExitCode.AUTH), "json", {
      commandPrefix: "bl",
      configName: "default",
    }),
  ).error.hint as string;
  expect(hint).toContain("bl auth login --api-key <your-key> --config default");
  expect(hint).toContain("bl auth status --config default");
});

test("setRecoveryConfigName retargets free-tier and missing-api-key hints to default", async () => {
  const freeTier = new BailianError(FREE_TIER_MESSAGE, ExitCode.GENERAL, undefined, {
    api: { httpStatus: 403, apiCode: FREE_TIER_ONLY_API_CODE },
  });
  const freeTierHint = JSON.parse(
    await render(
      freeTier,
      "json",
      { commandPrefix: "bl", hasCommand: blHasCommand, configName: "prod" },
      (reporter) => reporter.setRecoveryConfigName("default"),
    ),
  ).error.hint as string;
  expect(freeTierHint).toContain("bl usage freetier --off --model <model> --config default");
  expect(freeTierHint).not.toContain("--config prod");

  const authHint = JSON.parse(
    await render(
      new BailianError("No key", ExitCode.AUTH),
      "json",
      { commandPrefix: "bl", configName: "prod" },
      (reporter) => reporter.setRecoveryConfigName("default"),
    ),
  ).error.hint as string;
  expect(authHint).toContain("bl auth login --api-key <your-key> --config default");
  expect(authHint).toContain("bl auth status --config default");
  expect(authHint).not.toContain("--config prod");
});

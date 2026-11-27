import { buildIsolatedCliEnv, withIsolatedHome } from "e2e/isolation";
import { runInProcess } from "e2e/in-process";
import { authStage, type RunContext } from "../src/middleware.ts";
import { expect, test, vi } from "vite-plus/test";
import {
  BailianError,
  CredentialError,
  defineCommand,
  getConfigPath,
  resolvePreControlPlane,
  writeConfigFile,
  resolveApiKey,
  resolveOpenApi,
  httpTransport,
  ExitCode,
  commandRef,
  formatCommand,
  resolveConsole,
  type LocalizedText,
} from "bailian-cli-core";
import { createOutputReporter } from "../src/output/reporter.ts";
import { createCli } from "../src/create-cli.ts";

function render(error: unknown, output: "text" | "json") {
  let stderr = "";
  const reporter = createOutputReporter({
    settings: { output, quiet: true, verbose: false },
    commandPrefix: "aliyun bl",
    stderr: {
      write(chunk) {
        stderr += chunk;
      },
    },
  });
  const exitCode = reporter.error(error);
  return { stderr, exitCode };
}

test.each(["text", "json"] as const)(
  "Console references render through the reporter (%s)",
  (format) => {
    let error: unknown;
    try {
      resolveConsole({ flags: {}, env: {}, file: {} } as Parameters<typeof resolveConsole>[0]);
    } catch (failure) {
      error = failure;
    }
    const result = render(error, format);
    expect(result.exitCode).toBe(ExitCode.AUTH);
    const hint = format === "json" ? JSON.parse(result.stderr).error.hint : result.stderr;
    expect(hint).toContain("Run `aliyun bl auth login --console`.");
    expect(hint).not.toContain("auth status");
    expect(hint).not.toContain("--api-key");
    if (format === "json") expect(result.stderr.trim().split("\n")).toHaveLength(1);
  },
);

test.each(["text", "json"] as const)(
  "complete message and cause preserve literal user data (%s)",
  (format) => {
    const literal = "{{commandPrefix}}";
    const cause = new BailianError(
      `Run ${formatCommand("aliyun bl", "managed-agent init")} for ${literal}`,
    );
    const failure = new BailianError(
      `Failed ${formatCommand("aliyun bl", "managed-agent apply")}`,
      undefined,
      undefined,
      { cause },
    );
    const result = render(failure, format);
    expect(result.stderr).toContain("Failed aliyun bl managed-agent apply");
    expect(result.stderr).toContain("Run aliyun bl managed-agent init for {{commandPrefix}}");
  },
);

test("unmarked service text is never interpreted as a command reference", () => {
  const text = `Server bl data ${commandRef("auth login")}`;
  const result = render(new BailianError(text, undefined, text), "json");
  expect(JSON.parse(result.stderr).error).toMatchObject({ message: text, hint: text });
});

test.each(["bl", "aliyun bl"])(
  "credential recovery retains original steps under %s",
  (commandPrefix) => {
    const sources = { flags: {}, env: {}, file: {} } as Parameters<typeof resolveOpenApi>[0];
    const failures: unknown[] = [];
    for (const resolve of [resolveApiKey, resolveOpenApi]) {
      try {
        resolve(sources);
      } catch (error) {
        failures.push(error);
      }
    }
    for (const source of ["flags", "env", "file"] as const) {
      const partial = {
        ...sources,
        [source]:
          source === "flags"
            ? { accessKeyId: "id" }
            : source === "env"
              ? { ALIBABA_CLOUD_ACCESS_KEY_ID: "id" }
              : { access_key_id: "id" },
      };
      try {
        resolveOpenApi(partial);
      } catch (error) {
        failures.push(error);
      }
    }
    const hints = failures.map((error) => {
      let stderr = "";
      createOutputReporter({
        settings: { output: "json", quiet: true, verbose: false },
        commandPrefix,
        stderr: {
          write(chunk) {
            stderr += chunk;
          },
        },
      }).error(error);
      return JSON.parse(stderr).error.hint as string;
    });
    expect(hints).toHaveLength(5);
    expect(hints[0]).toContain(`or run \`${commandPrefix} auth login\`.`);
    expect(hints[0]).toContain(`${commandPrefix} auth status`);
    expect(hints[0]).toContain("Get API Key:");
    expect(hints[1]).toContain(
      `or run \`${commandPrefix} auth login --open-api\` then paste your AccessKey.`,
    );
    expect(hints[1]).not.toMatch(/[\u4e00-\u9fff]/u);
    expect(hints[2]).toBe(
      "Pass both --access-key-id and --access-key-secret, or remove the partial flags to use env/config credentials.",
    );
    expect(hints[3]).toBe(
      "Set both ALIBABA_CLOUD_ACCESS_KEY_ID and ALIBABA_CLOUD_ACCESS_KEY_SECRET, or unset the partial env vars.",
    );
    expect(hints[4]).toContain(
      `Save a complete pair with \`${commandPrefix} auth login --open-api --access-key-id <id> --access-key-secret <secret>\``,
    );
    expect(hints[4]).toContain(`\`${commandPrefix} auth login --open-api\` for the setup guide`);
    expect(hints.slice(1).join("\n")).not.toContain("auth status");
  },
);

test.each([
  {
    label: "pre-release missing pair",
    binName: "bl",
    mode: "true",
    preProfile: { name: "staging", language: "en-US" },
  },
  {
    label: "pre-release incomplete config",
    binName: "bl",
    mode: "1",
    preProfile: { name: "default", language: "zh-CN", access_key_id: "fixture-partial-id" },
  },
  { label: "online mode explicitly selected", binName: "bl", mode: "0" },
  { label: "kscli host has no mode switch", binName: "kscli", mode: "1" },
])("CLI recovery respects the host's control-plane mode: $label", async (scenario) => {
  const { binName, mode, preProfile } = scenario;
  const args = ["probe", "--output", "json"];
  if (preProfile) args.push("--config", preProfile.name);
  const run = vi.fn(async () => {});
  const probe = defineCommand({ auth: "openapi", description: "OpenAPI fixture", run });
  const login = defineCommand({ auth: "none", description: "Login fixture", async run() {} });
  const cli = createCli(binName === "bl" ? { probe, "auth login": login } : { probe }, {
    binName,
    clientName: "test",
    npmPackage: "test",
    version: "0.0.0",
    ...(binName === "bl" ? { preControlPlane: () => resolvePreControlPlane(process.env) } : {}),
  });
  const isolated = buildIsolatedCliEnv({
    overrides: {
      BAILIAN_PRE: mode,
      BAILIAN_PRE_CONSOLE_ORIGIN: undefined,
      BAILIAN_PRE_CONSOLE_GATEWAY: undefined,
      BAILIAN_ACCESS_KEY_ID: preProfile ? "fixture-bailian-id" : undefined,
      BAILIAN_ACCESS_KEY_SECRET: preProfile ? "fixture-bailian-secret" : undefined,
      ALIBABA_CLOUD_ACCESS_KEY_ID: preProfile ? "fixture-cloud-id" : undefined,
      ALIBABA_CLOUD_ACCESS_KEY_SECRET: preProfile ? "fixture-cloud-secret" : undefined,
      DASHSCOPE_VERBOSE: "0",
      HTTP_PROXY: "",
      HTTPS_PROXY: "",
      NO_UPDATE_NOTIFIER: "1",
    },
  });
  try {
    const result = await runInProcess(
      async () => {
        if (preProfile) {
          const { name, ...file } = preProfile;
          await writeConfigFile(file, name === "default" ? undefined : name, {
            path: getConfigPath({}),
          });
        }
        await cli.run(args);
      },
      args,
      { env: isolated.env },
    );
    expect(result.exitCode).toBe(ExitCode.AUTH);
    expect(result.stdout).toBe("");
    expect(run).not.toHaveBeenCalled();
    const { message, hint } = JSON.parse(result.stderr).error;
    expect(message).toBe(
      preProfile?.access_key_id
        ? "Incomplete OpenAPI AK/SK credentials found."
        : "No OpenAPI AK/SK credentials found.",
    );
    if (preProfile) {
      expect(hint).toContain(
        preProfile.language === "zh-CN"
          ? "请保持预发模式开启。如果命令支持 AccessKey 参数，请同时传入"
          : "Keep pre-release mode enabled. If the command accepts AccessKey flags, pass both",
      );
      expect(hint).toContain("`--access-key-id`");
      expect(hint).toContain("`--access-key-secret`");
      const login = `bl auth login --open-api --access-key-id <id> --access-key-secret <secret> --config ${preProfile.name}`;
      expect(hint).toContain(
        preProfile.language === "zh-CN"
          ? `如需保存这对凭据，请运行 \`${login}\`。`
          : `To save the pair, run \`${login}\`.`,
      );
      expect(hint).not.toMatch(
        /BAILIAN_ACCESS_KEY_|ALIBABA_CLOUD_|auth login --open-api(?: --config [\w-]+)?`/u,
      );
      expect(result.stderr).not.toContain("fixture-");
    } else {
      expect(hint).toBe(
        `Set BAILIAN_ACCESS_KEY_ID / BAILIAN_ACCESS_KEY_SECRET (or ALIBABA_CLOUD_*), pass --access-key-id / --access-key-secret, or run \`${binName} auth login --open-api\` then paste your AccessKey.`,
      );
    }
  } finally {
    isolated.dispose();
  }
});

test("Console errors carry complete hints before ordinary business wrapping", async () => {
  await withIsolatedHome(async () => {
    const response = { data: { success: false, errorCode: "BailianGateway.Login.NotLogined" } };
    const fetching = vi
      .spyOn(httpTransport, "fetch")
      .mockImplementation(async () => new Response(JSON.stringify(response)));
    const context = {
      identity: {
        binName: "bl",
        commandInvocation: { bin: "aliyun", path: ["bl"] },
        version: "test",
        npmPackage: "test",
        clientName: "test",
      },
      settings: { timeout: 30, dryRun: false, output: "json", quiet: true, verbose: false },
      sources: { flags: {}, env: {}, file: { access_token: "expired" } },
      command: { auth: "console" },
      localize: (text: LocalizedText) => (typeof text === "string" ? text : text["en-US"]),
      output: createOutputReporter({ settings: { output: "json", quiet: true, verbose: false } })
        .output,
    } as unknown as RunContext;
    try {
      await authStage(context, async () => {
        let failure: BailianError | undefined;
        try {
          await context.client.console("test.api", {});
        } catch (error) {
          expect(error).toBeInstanceOf(CredentialError);
          failure = error as BailianError;
        }
        expect(failure).toBeDefined();
        expect(failure!.hint).toBe(
          "Run `aliyun bl auth login --console` to sign in or refresh your console session.",
        );
        const wrapped = new BailianError(
          failure!.message,
          failure!.exitCode,
          `${failure!.hint}\nPartial result retained.`,
          { rawResponse: failure!.rawResponse },
        );
        const result = render(wrapped, "json");
        const hint = JSON.parse(result.stderr).error.hint;
        expect(hint).toContain("aliyun bl auth login --console");
        expect(hint).toContain("Partial result retained.");
        expect(hint).not.toContain("auth status");
        expect(JSON.stringify(wrapped)).not.toContain("{{commandPrefix}}");
      });
    } finally {
      fetching.mockRestore();
    }
  });
});

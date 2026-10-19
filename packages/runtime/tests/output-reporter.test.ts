import { expect, test } from "vite-plus/test";
import { BailianError, ExitCode, type Settings } from "bailian-cli-core";
import { createOutputReporter } from "../src/output/reporter.ts";
import { createTranslator } from "../src/i18n.ts";

function capture(settings: Pick<Settings, "output" | "quiet" | "verbose">) {
  let stdout = "";
  let stderr = "";
  const reporter = createOutputReporter({
    settings,
    stdout: {
      write: (chunk) => {
        stdout += chunk;
      },
    },
    stderr: {
      write: (chunk) => {
        stderr += chunk;
      },
    },
    localize: (text) => createTranslator("en-US").localize(text),
  });
  return { reporter, stdout: () => stdout, stderr: () => stderr };
}

const matrix = (["text", "json"] as const).flatMap((output) =>
  [false, true].flatMap((quiet) => [false, true].map((verbose) => ({ output, quiet, verbose }))),
);

test.each(matrix)("output matrix $output quiet=$quiet verbose=$verbose", (settings) => {
  const streams = capture(settings);
  const { output } = streams.reporter;
  const result = { task_id: "task-demo", saved: ["/tmp/demo.png"] };
  output.progress("Downloading 50%");
  output.info("Using cache");
  output.warning({ code: "SKIPPED", message: "One file skipped" });
  output.debug({ message: "HTTP response", details: { status: 200 } });
  output.result(result, { text: "task-demo" });
  expect(streams.stdout()).toBe(
    settings.output === "json" ? JSON.stringify(result, null, 2) + "\n" : "task-demo\n",
  );
  if (settings.output === "json") {
    const lines = streams
      .stderr()
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(lines).toEqual([
      { warning: { code: "SKIPPED", message: "One file skipped" } },
      ...(settings.verbose
        ? [{ debug: { message: "HTTP response", details: { status: 200 } } }]
        : []),
    ]);
  } else {
    expect(streams.stderr().includes("Downloading 50%")).toBe(!settings.quiet);
    expect(streams.stderr().includes("Using cache")).toBe(!settings.quiet);
    expect(streams.stderr()).toContain("One file skipped");
    expect(streams.stderr().includes("HTTP response")).toBe(settings.verbose);
    expect(streams.stderr()).not.toContain("\u001b");
  }
  expect("error" in output).toBe(false);
});

test.each([false, 0, null, [], ""])("preserves valid JSON result %j", (value) => {
  const streams = capture({ output: "json", quiet: true, verbose: true });
  streams.reporter.output.result(value);
  expect(JSON.parse(streams.stdout())).toEqual(value);
});

test("rejects undefined before writing and allows a later valid result", () => {
  const streams = capture({ output: "json", quiet: false, verbose: false });
  expect(() => streams.reporter.output.result(undefined)).toThrow(/serializ/i);
  expect(streams.stdout()).toBe("");
  streams.reporter.output.result({ valid: true });
  expect(JSON.parse(streams.stdout())).toEqual({ valid: true });
});

test("rejects a second final result without appending another JSON document", () => {
  const streams = capture({ output: "json", quiet: false, verbose: false });
  streams.reporter.output.result({ first: true });
  const original = streams.stdout();
  expect(() => streams.reporter.output.result({ second: true })).toThrow(/already/i);
  expect(streams.stdout()).toBe(original);
});

test("uses the existing text formatter when no text override is supplied", () => {
  const streams = capture({ output: "text", quiet: true, verbose: false });
  streams.reporter.output.result({ task_id: "task-demo" });
  expect(streams.stdout()).toBe("task_id: task-demo\n");
});

test("independent reporters retain their settings and output destinations", async () => {
  const settings = { output: "json" as const, quiet: true, verbose: false };
  const first = capture(settings);
  const second = capture({ output: "text", quiet: false, verbose: true });
  settings.quiet = false;
  await Promise.all([
    Promise.resolve().then(() => {
      first.reporter.output.info("hidden");
      first.reporter.output.result(0);
    }),
    Promise.resolve().then(() => {
      second.reporter.output.info("shown");
      second.reporter.output.result(false, { text: "no" });
    }),
  ]);
  expect(first.stdout()).toBe("0\n");
  expect(first.stderr()).toBe("");
  expect(second.stdout()).toBe("no\n");
  expect(second.stderr()).toContain("shown");
});

test("localizes messages without changing machine codes", () => {
  let stderr = "";
  const reporter = createOutputReporter({
    settings: { output: "json", quiet: false, verbose: false },
    localize: (text) => createTranslator("zh-CN").localize(text),
    stderr: {
      write: (chunk) => {
        stderr += chunk;
      },
    },
  });
  reporter.output.warning({ code: "SKIPPED", message: { "en-US": "Skipped", "zh-CN": "已跳过" } });
  expect(JSON.parse(stderr)).toEqual({ warning: { code: "SKIPPED", message: "已跳过" } });
});

test("writes warnings, debug and a terminal error as separate JSON lines only once", () => {
  const streams = capture({ output: "json", quiet: true, verbose: true });
  streams.reporter.output.warning("warning\ncontinued");
  streams.reporter.output.debug("debug\ncontinued");
  const failure = new BailianError("Server original message", ExitCode.GENERAL, "Retry later", {
    api: { httpStatus: 500, apiCode: "ServerFailure", requestId: "request-demo" },
    cause: new Error("root cause"),
  });
  expect(streams.reporter.error(failure)).toBe(ExitCode.GENERAL);
  expect(streams.reporter.error(failure)).toBe(ExitCode.GENERAL);
  const lines = streams
    .stderr()
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(lines).toEqual([
    { warning: { message: "warning\ncontinued" } },
    { debug: { message: "debug\ncontinued" } },
    failure.toJSON(),
  ]);
  expect(streams.stdout()).toBe("");
});

test.each([new SyntaxError("Invalid JSON"), "thrown string", null])(
  "normalizes unknown failure %j",
  (failure) => {
    const streams = capture({ output: "json", quiet: true, verbose: false });
    expect(streams.reporter.error(failure)).toBe(ExitCode.GENERAL);
    const error = JSON.parse(streams.stderr()).error;
    expect(error.code).toBe(ExitCode.GENERAL);
    expect(error.message).toBe(failure instanceof Error ? failure.message : String(failure));
  },
);

test("keeps failure reports on stdout and terminal error on stderr", () => {
  const streams = capture({ output: "json", quiet: true, verbose: false });
  streams.reporter.output.result({ valid: false, issues: ["bad row"] });
  expect(streams.reporter.error(new BailianError("Validation failed", ExitCode.GENERAL))).toBe(1);
  expect(JSON.parse(streams.stdout())).toEqual({ valid: false, issues: ["bad row"] });
  expect(JSON.parse(streams.stderr()).error.message).toBe("Validation failed");
});

test("redacts structured diagnostic credentials and handles cycles and BigInt", () => {
  const streams = capture({ output: "json", quiet: false, verbose: true });
  const details: Record<string, unknown> = {
    authorization: "example-authorization",
    api_key: "example-key",
    accessKeySecret: "example-secret",
    nested: { token: "example-token", request_id: "request-demo" },
    count: 42n,
  };
  details.self = details;
  streams.reporter.output.debug({ message: "Request", details });
  const payload = JSON.parse(streams.stderr()).debug;
  expect(payload.details).toMatchObject({
    authorization: "[REDACTED]",
    api_key: "[REDACTED]",
    accessKeySecret: "[REDACTED]",
    nested: { token: "[REDACTED]", request_id: "request-demo" },
    count: "42",
    self: "[Circular]",
  });
  expect(details.api_key).toBe("example-key");
  expect(streams.stderr()).not.toContain("example-token");
});

test("text diagnostics remove terminal escape sequences", () => {
  const streams = capture({ output: "text", quiet: false, verbose: true });
  streams.reporter.output.warning("\u001b[31mwarning\u001b[0m");
  streams.reporter.output.debug({ message: "Details", details: { status: 200 } });
  streams.reporter.error(new Error("failure"));
  expect(streams.stderr()).toContain("warning");
  expect(streams.stderr()).toContain("failure");
  expect(streams.stderr()).not.toContain("\u001b");
});

test("redacts credential keys with environment and HTTP header prefixes", () => {
  const streams = capture({ output: "json", quiet: false, verbose: true });
  streams.reporter.output.debug({
    message: "Request context",
    details: {
      DASHSCOPE_API_KEY: "fake-dashscope-key",
      ALIBABA_CLOUD_ACCESS_KEY_ID: "fake-access-key",
      ALIBABA_CLOUD_ACCESS_KEY_SECRET: "fake-access-secret",
      headers: { "x-api-key": "fake-header-key", "Proxy-Authorization": "fake-proxy-auth" },
      request_id: "request-demo",
    },
  });
  expect(JSON.parse(streams.stderr()).debug.details).toEqual({
    DASHSCOPE_API_KEY: "[REDACTED]",
    ALIBABA_CLOUD_ACCESS_KEY_ID: "[REDACTED]",
    ALIBABA_CLOUD_ACCESS_KEY_SECRET: "[REDACTED]",
    headers: { "x-api-key": "[REDACTED]", "Proxy-Authorization": "[REDACTED]" },
    request_id: "request-demo",
  });
});

test("does not execute diagnostic toJSON hooks that bypass redaction", () => {
  const streams = capture({ output: "json", quiet: false, verbose: true });
  let calls = 0;
  streams.reporter.output.debug({
    message: "Diagnostic",
    details: {
      api_key: "fake-secret",
      toJSON() {
        calls += 1;
        return { api_key: "fake-secret" };
      },
    },
  });
  expect(calls).toBe(0);
  expect(JSON.parse(streams.stderr()).debug.details.api_key).toBe("[REDACTED]");
  expect(streams.stderr()).not.toContain("fake-secret");
});

test("diagnostic toJSON returning BigInt cannot break JSON line output", () => {
  const streams = capture({ output: "json", quiet: false, verbose: true });
  expect(() =>
    streams.reporter.output.warning({
      message: "Diagnostic",
      details: {
        toJSON() {
          return 42n;
        },
      },
    }),
  ).not.toThrow();
  expect(JSON.parse(streams.stderr()).warning.message).toBe("Diagnostic");
});

test("does not invoke diagnostic accessors on objects or arrays", () => {
  const streams = capture({ output: "json", quiet: false, verbose: true });
  let reads = 0;
  const details = Object.defineProperty({}, "response", {
    enumerable: true,
    get() {
      reads += 1;
      throw new Error("accessor must not run");
    },
  });
  const entries = ["initial"];
  Object.defineProperty(entries, "0", {
    get() {
      reads += 1;
      throw new Error("array accessor must not run");
    },
  });
  expect(() =>
    streams.reporter.output.debug({ message: "Details", details: { details, entries } }),
  ).not.toThrow();
  expect(reads).toBe(0);
  expect(JSON.parse(streams.stderr()).debug.details).toEqual({
    details: { response: "[Accessor]" },
    entries: ["[Accessor]"],
  });
});

test("a revoked proxy in diagnostic details cannot fail the business operation", () => {
  const streams = capture({ output: "json", quiet: false, verbose: true });
  const proxy = Proxy.revocable({}, {});
  proxy.revoke();
  expect(() =>
    streams.reporter.output.debug({ message: "Details", details: proxy.proxy }),
  ).not.toThrow();
  streams.reporter.output.result({ completed: true });
  expect(JSON.parse(streams.stdout())).toEqual({ completed: true });
  expect(JSON.parse(streams.stderr()).debug.details).toBe("[Unserializable]");
});

test.each([false, true])("text errors retain API context and causes with verbose=%s", (verbose) => {
  const streams = capture({ output: "text", quiet: true, verbose });
  const failure = new BailianError("Original service message", ExitCode.GENERAL, "Retry later", {
    api: { httpStatus: 503, apiCode: "Unavailable", requestId: "request-demo" },
    cause: new Error("transport cause", { cause: new Error("root cause") }),
  });
  streams.reporter.error(failure);
  expect(streams.stderr()).toContain("Original service message");
  expect(streams.stderr()).toContain("Retry later");
  expect(streams.stderr()).toContain("HTTP 503");
  expect(streams.stderr()).toContain("Unavailable");
  expect(streams.stderr()).toContain("request-demo");
  expect(streams.stderr()).toContain("transport cause");
  expect(streams.stderr()).toContain("root cause");
  expect(streams.stderr()).toContain("Exit code: 1");
});

test("normalizes fetch failures without losing network exit code or errno", () => {
  const streams = capture({ output: "json", quiet: true, verbose: false });
  const cause = Object.assign(new Error("getaddrinfo ENOTFOUND example.invalid"), {
    code: "ENOTFOUND",
  });
  expect(streams.reporter.error(new TypeError("fetch failed", { cause }))).toBe(ExitCode.NETWORK);
  const failure = JSON.parse(streams.stderr()).error;
  expect(failure.code).toBe(ExitCode.NETWORK);
  expect(failure.message).toContain("ENOTFOUND");
  expect(failure.cause).toEqual({ message: cause.message, code: "ENOTFOUND" });
});

test.each([
  { failure: Object.assign(new Error("aborted"), { name: "AbortError" }), code: ExitCode.TIMEOUT },
  { failure: Object.assign(new Error("missing file"), { code: "ENOENT" }), code: ExitCode.GENERAL },
])("preserves local error classification $code", ({ failure, code }) => {
  const streams = capture({ output: "json", quiet: false, verbose: false });
  expect(streams.reporter.error(failure)).toBe(code);
  const payload = JSON.parse(streams.stderr()).error;
  expect(payload.hint).toBeTruthy();
  expect(payload.cause.message).toBe(failure.message);
});

test("plain progress remains readable on non-TTY streams without animation", () => {
  const streams = capture({ output: "text", quiet: false, verbose: false });
  streams.reporter.output.progress("Downloading 50%");
  expect(streams.stderr()).toBe("Downloading 50%\n");
});

test("local error hints use the invocation language and binary name", () => {
  let stderr = "";
  const reporter = createOutputReporter({
    settings: { output: "json", quiet: true, verbose: false },
    binName: "kscli",
    localize: (text) => createTranslator("zh-CN").localize(text),
    stderr: {
      write: (chunk) => {
        stderr += chunk;
      },
    },
  });
  reporter.error(new TypeError("fetch failed"));
  const payload = JSON.parse(stderr).error;
  expect(payload.code).toBe(ExitCode.NETWORK);
  expect(payload.hint).toContain("kscli config show");
  expect(payload.hint).toContain("请检查网络");
});

test("service failures retain their message and exit code despite timeout keywords", () => {
  const streams = capture({ output: "json", quiet: false, verbose: true });
  const failure = new BailianError("Server request timed out", ExitCode.GENERAL, undefined, {
    api: { httpStatus: 504, apiCode: "ServerTimeout", requestId: "request-timeout" },
  });
  expect(streams.reporter.error(failure)).toBe(ExitCode.GENERAL);
  expect(JSON.parse(streams.stderr())).toEqual(failure.toJSON());
});

test.each(["message", "code", "details"] as const)(
  "outer diagnostic %s accessors cannot change business results",
  (field) => {
    for (const verbose of [false, true]) {
      const streams = capture({ output: "json", quiet: true, verbose });
      let reads = 0;
      const diagnostic = Object.defineProperty(
        { message: "Diagnostic", code: "TEST", details: {} },
        field,
        {
          get() {
            reads += 1;
            throw new Error("outer accessor must not run");
          },
        },
      );
      expect(() => {
        streams.reporter.output.debug(diagnostic);
        streams.reporter.output.result({ completed: true });
      }).not.toThrow();
      expect(reads).toBe(0);
      expect(JSON.parse(streams.stdout())).toEqual({ completed: true });
      if (verbose) expect(JSON.parse(streams.stderr()).debug[field]).toBe("[Accessor]");
    }
  },
);

test("outer diagnostic proxy traps cannot interrupt a warning or result", () => {
  const streams = capture({ output: "json", quiet: false, verbose: false });
  const diagnostic = Proxy.revocable({ message: "Diagnostic" }, {});
  diagnostic.revoke();
  expect(() => {
    streams.reporter.output.warning(diagnostic.proxy);
    streams.reporter.output.result({ completed: true });
  }).not.toThrow();
  expect(JSON.parse(streams.stdout())).toEqual({ completed: true });
  expect(JSON.parse(streams.stderr()).warning.message).toBe("[Unserializable]");
});

test("localized diagnostic message accessors are not invoked", () => {
  const streams = capture({ output: "json", quiet: false, verbose: true });
  let reads = 0;
  const message = {
    get "en-US"(): string {
      reads += 1;
      throw new Error("localized accessor must not run");
    },
    "zh-CN": "诊断",
  };
  expect(() => streams.reporter.output.debug({ message })).not.toThrow();
  expect(reads).toBe(0);
  expect(JSON.parse(streams.stderr()).debug.message).toBe("[Accessor]");
});

test.each(["info", "progress"] as const)(
  "%s localized getters cannot change results when quiet is toggled",
  (method) => {
    for (const quiet of [false, true]) {
      const streams = capture({ output: "text", quiet, verbose: false });
      let reads = 0;
      const message = {
        get "en-US"(): string {
          reads += 1;
          throw new Error("informational accessor must not run");
        },
        "zh-CN": "过程提示",
      };
      expect(() => {
        streams.reporter.output[method](message);
        streams.reporter.output.result({ completed: true }, { text: "completed" });
      }).not.toThrow();
      expect(reads).toBe(0);
      expect(streams.stdout()).toBe("completed\n");
      expect(streams.stderr()).toBe(quiet ? "" : "[Accessor]\n");
    }
  },
);

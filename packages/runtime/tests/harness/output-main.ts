import { BailianError, ExitCode, defineCommand, httpTransport } from "bailian-cli-core";
import { createCli } from "../../src/create-cli.ts";

const probe = defineCommand({
  description: "Output reporter integration probe",
  auth: "none",
  async run(context) {
    context.output.info({ "en-US": "Using cache", "zh-CN": "使用缓存" });
    context.output.warning({ code: "SKIPPED", message: { "en-US": "Skipped", "zh-CN": "已跳过" } });
    context.output.debug({ message: "HTTP response", details: { status: 200 } });
    context.output.result({ task_id: "task-demo" }, { text: "task-demo" });
  },
});

const fail = defineCommand({
  description: "Failure probe",
  auth: "none",
  flags: { kind: { type: "string", valueHint: "kind", description: "Failure kind" } },
  async run(context) {
    if (context.flags.kind === "network") {
      throw new TypeError("fetch failed", {
        cause: Object.assign(new Error("DNS failed"), { code: "ENOTFOUND" }),
      });
    }
    if (context.flags.kind === "report") {
      context.output.warning("One item skipped");
      context.output.debug("Failure report ready");
      context.output.result({ successful: ["task-demo"], failed: ["row-2"] });
      throw new BailianError("Partial failure", ExitCode.GENERAL, "Retry row-2", {
        api: { httpStatus: 500, apiCode: "ServerFailure", requestId: "request-demo" },
      });
    }
    throw new SyntaxError("Invalid local JSON");
  },
});

const transport = defineCommand({
  description: "HTTP output probe",
  auth: "apiKey",
  async run(context) {
    const originalFetch = httpTransport.fetch;
    httpTransport.fetch = async () =>
      new Response(
        JSON.stringify({
          code: "ServiceUnavailable",
          message: "mock server rejected",
          request_id: "request-transport",
        }),
        { status: 503 },
      );
    try {
      await context.client.requestJson({ path: "/task?token=fake-query-secret" });
    } finally {
      httpTransport.fetch = originalFetch;
    }
  },
});

await createCli(
  {
    probe,
    fail,
    transport,
    defaultProbe: { ...probe, defaultOutput: "json" },
    defaultFail: { ...fail, defaultOutput: "json" },
    defaultValidate: {
      ...probe,
      defaultOutput: "json",
      validate: () => ({ "en-US": "Rejected fixture input", "zh-CN": "测试输入被拒绝" }),
    },
  },
  {
    binName: "test-cli",
    version: "0.0.0",
    clientName: "output-reporter-test",
    npmPackage: "output-reporter-test",
  },
).run();

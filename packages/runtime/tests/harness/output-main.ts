import { defineCommand } from "bailian-cli-core";
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

await createCli(
  { probe },
  {
    binName: "test-cli",
    version: "0.0.0",
    clientName: "output-reporter-test",
    npmPackage: "output-reporter-test",
  },
).run();

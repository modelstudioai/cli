import { defineCommand } from "bailian-cli-core";
import { createCli } from "bailian-cli-runtime";
import pkg from "../../package.json" with { type: "json" };

const noop = async () => {};

/** apiKey 域 stub：用于跨域 flag 拒绝测试 */
const textChat = defineCommand({
  description: "runtime e2e stub",
  auth: "apiKey",
  flags: {
    message: { type: "string", valueHint: "<m>", description: "message" },
  },
  run: noop,
});

/** console 域 stub：用于跨域 flag 拒绝测试 */
const mcpList = defineCommand({
  description: "runtime e2e stub",
  auth: "console",
  flags: {},
  run: noop,
});

/** apiKey + optionalConsole stub：用于可选 console 预检 flag 可见性测试 */
const cmodelImport = defineCommand({
  description: "runtime e2e stub",
  auth: "apiKey",
  optionalConsole: true,
  flags: {},
  run: noop,
});

void createCli(
  { "text chat": textChat, "mcp list": mcpList, "cmodel import": cmodelImport },
  {
    binName: "bl",
    version: pkg.version,
    clientName: "runtime-e2e",
    npmPackage: "bailian-cli-runtime-e2e-harness",
  },
).run();

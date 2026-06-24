import { createCli } from "bailian-cli-runtime";
import { commands } from "../../src/index.ts";

// 契约 e2e 专用 canonical 入口：全量 commands，与 bl 命令面一致。
void createCli(commands, {
  binName: "bl",
  version: "0.0.0-test",
  clientName: "bailian-cli",
  npmPackage: "bailian-cli",
}).run();

import { createCli } from "bailian-cli-runtime";
import { e2eCommands } from "./e2e-commands.ts";

// 契约 e2e 专用 canonical 入口：全量 commands，独立于 bl/rag 产品。
void createCli(e2eCommands, {
  binName: "bl",
  version: "0.0.0-test",
  clientName: "bailian-cli",
  npmPackage: "bailian-cli",
}).run();

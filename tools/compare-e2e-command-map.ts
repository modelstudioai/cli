#!/usr/bin/env node
/**
 * Advisory：对比 bl 产品 map 与 E2E harness map 是否指向同一 command 实例。
 * 不一致时打印 warning，不阻塞测试。
 */
import { commands as cliCommands } from "../packages/cli/src/commands.ts";
import { e2eCommandMap } from "../packages/commands/tests/e2e/harness/e2e-command-map.ts";

const cliPaths = new Set(Object.keys(cliCommands));
const e2ePaths = new Set(Object.keys(e2eCommandMap));

let hasWarning = false;

for (const path of cliPaths) {
  if (!e2ePaths.has(path)) {
    console.warn(`[advisory] cli map path missing in e2e map: ${path}`);
    hasWarning = true;
  } else if (cliCommands[path] !== e2eCommandMap[path]) {
    console.warn(`[advisory] command instance mismatch for path: ${path}`);
    hasWarning = true;
  }
}

for (const path of e2ePaths) {
  if (!cliPaths.has(path)) {
    console.warn(`[advisory] e2e map path missing in cli map: ${path}`);
    hasWarning = true;
  }
}

if (!hasWarning) {
  console.log("[advisory] cli commands map and e2e harness map are aligned.");
}

process.exit(0);

import { readdirSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, test } from "vite-plus/test";
import * as commandExports from "bailian-cli-commands";
import { E2E_COMMAND_EXPORTS, e2eCommandMap } from "./e2e-command-map.ts";

const e2eDir = dirname(fileURLToPath(import.meta.url));

const exportedCommands = new Set(
  Object.values(commandExports).filter(
    (value) => typeof value === "object" && value !== null && "run" in value,
  ),
);

/** 从 runCommandE2e([...]) 调用中提取命令 path 前缀 */
function extractCommandPathsFromSource(source: string): string[] {
  const paths: string[] = [];
  const callPattern = /runCommandE2e\(\[([\s\S]*?)\]/g;

  for (const match of source.matchAll(callPattern)) {
    const arrayBody = match[1] ?? "";
    const tokens: string[] = [];
    const stringPattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'/g;
    for (const tokenMatch of arrayBody.matchAll(stringPattern)) {
      const token = tokenMatch[1] ?? tokenMatch[2] ?? "";
      if (token.startsWith("--")) break;
      tokens.push(token);
    }
    if (tokens.length > 0) paths.push(tokens.join(" "));
  }

  return paths;
}

describe("e2e-command-map contract", () => {
  test("path 唯一", () => {
    const paths = Object.keys(e2eCommandMap);
    expect(new Set(paths).size).toBe(paths.length);
  });

  test("value 均为 bailian-cli-commands 合法 export", () => {
    for (const [path, command] of Object.entries(e2eCommandMap)) {
      expect(exportedCommands.has(command), `invalid export for path "${path}"`).toBe(true);
    }
  });

  test("E2E_COMMAND_EXPORTS 白名单 ⊆ map values", () => {
    const mapValues = new Set(Object.values(e2eCommandMap));
    for (const command of E2E_COMMAND_EXPORTS) {
      expect(mapValues.has(command)).toBe(true);
    }
  });

  test("各 e2e 测试 argv 前缀在 map 中有对应 path", () => {
    const mapPaths = new Set(Object.keys(e2eCommandMap));
    const testFiles = readdirSync(e2eDir).filter(
      (name) => name.endsWith(".e2e.test.ts") && name !== "proxy.e2e.test.ts",
    );

    const missing: string[] = [];
    for (const file of testFiles) {
      const source = readFileSync(join(e2eDir, file), "utf8");
      for (const path of extractCommandPathsFromSource(source)) {
        if (!mapPaths.has(path)) missing.push(`${file}: ${path}`);
      }
    }

    expect(missing).toEqual([]);
  });
});

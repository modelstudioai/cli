import { expect, test } from "vite-plus/test";
import { captureRegistryHelp } from "../src/registry-smoke.ts";

test("captureRegistryHelp 捕获指定命令路径的非 TTY 输出", () => {
  const requestedPaths: string[][] = [];
  const renderer = {
    printHelp(commandPath: string[], output: NodeJS.WriteStream): void {
      requestedPaths.push(commandPath);
      output.write(`Usage: bl ${commandPath.join(" ")}`);
    },
  };

  const output = captureRegistryHelp(renderer, ["text", "chat"]);

  expect(output).toBe("Usage: bl text chat");
  expect(requestedPaths).toEqual([["text", "chat"]]);
});

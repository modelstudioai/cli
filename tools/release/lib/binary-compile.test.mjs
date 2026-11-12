import { expect, test } from "vite-plus/test";
import { bunCompileArguments } from "./binary-compile.mjs";

test("release compile pins the compiled marker and production NODE_ENV", () => {
  expect(bunCompileArguments("entry.ts", "out/bl", "bun-linux-x64")).toEqual([
    "build",
    "entry.ts",
    "--compile",
    "--outfile",
    "out/bl",
    "--target",
    "bun-linux-x64",
    "--define",
    'process.env.BAILIAN_COMPILED="1"',
    "--define",
    'process.env.NODE_ENV="production"',
  ]);
});

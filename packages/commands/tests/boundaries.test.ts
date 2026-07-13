import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { expect, test } from "vite-plus/test";

// 能力面边界(重构 §6 的 lint 规则):store/manager accessor 只允许对应命令族使用;
// 普通业务命令只依赖 settings/flags/client。

const ROOT = join(import.meta.dirname, "../src/commands");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

test("configStore() 仅在 commands/config/** 使用", () => {
  for (const file of walk(ROOT)) {
    if (file.includes("/config/")) continue;
    expect(readFileSync(file, "utf8").includes("configStore("), file).toBe(false);
  }
});

test("authStore() 仅在 commands/auth/** 使用", () => {
  for (const file of walk(ROOT)) {
    if (file.includes("/auth/")) continue;
    expect(readFileSync(file, "utf8").includes("authStore("), file).toBe(false);
  }
});

test("commandPacks() 仅在 commands/plugin/** 使用", () => {
  for (const file of walk(ROOT)) {
    if (file.includes("/plugin/")) continue;
    expect(readFileSync(file, "utf8").includes("commandPacks("), file).toBe(false);
  }
});

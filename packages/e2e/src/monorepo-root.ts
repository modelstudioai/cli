import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

/** Monorepo 根目录（含根 `package.json`） */
export function monorepoRoot(fromModuleUrl: string = import.meta.url): string {
  let dir = dirname(fileURLToPath(fromModuleUrl));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not locate monorepo root (pnpm-workspace.yaml)");
}

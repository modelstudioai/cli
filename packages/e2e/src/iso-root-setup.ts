/**
 * Vitest setupFiles：把 globalSetup provide 的本轮隔离父目录写入 BL_ISO_ROOT，
 * 供 mkIsolationTemp 挂载临时子目录。只依赖 iso-root-keys，不拉 isolation/core。
 */
import { inject } from "vite-plus/test";
import { ISO_ROOT_ENV, ISO_ROOT_KEY } from "./iso-root-keys.ts";

try {
  // Cast: ProvidedContext augmentation is unreliable under this package's typecheck.
  const sessionRoot = (inject as (key: string) => unknown)(ISO_ROOT_KEY);
  if (typeof sessionRoot === "string" && sessionRoot.length > 0) {
    process.env[ISO_ROOT_ENV] = sessionRoot;
  }
} catch {
  // 无 globalSetup/provide 时不写 BL_ISO_ROOT，getIsolationSessionRoot 回退到 os.tmpdir()。
}

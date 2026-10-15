import pkg from "../../../package.json" with { type: "json" };

/**
 * commands E2E harness 产品身份。
 * version 取自 commands 包（与 monorepo 同步）；npmPackage 使用非发布名，
 * 配合 update-fixture 的本地 404 隔离更新查询与 CI 中的 auto-update。
 */
export const E2E_HARNESS_IDENTITY = {
  binName: "bl",
  version: pkg.version,
  clientName: "commands-e2e",
  npmPackage: "bailian-cli-commands-e2e-harness",
} as const;

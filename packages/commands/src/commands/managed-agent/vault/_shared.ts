import type { CloudVault } from "@openagentpack/sdk";
import {
  API_TARGET_FLAGS,
  CURSOR_FLAGS,
  displayValue,
  INCLUDE_ARCHIVED_FLAG,
  SEARCH_FLAGS,
} from "../_engine/api-helpers.ts";

export const VAULT_LIST_FLAGS = {
  ...API_TARGET_FLAGS,
  ...CURSOR_FLAGS,
  ...INCLUDE_ARCHIVED_FLAG,
};

export const VAULT_SEARCH_FLAGS = {
  ...API_TARGET_FLAGS,
  limit: CURSOR_FLAGS.limit,
  ...SEARCH_FLAGS,
  ...INCLUDE_ARCHIVED_FLAG,
};

export const VAULT_GET_FLAGS = {
  ...API_TARGET_FLAGS,
  vaultId: {
    type: "string",
    valueHint: "<id>",
    required: true,
    description: { "en-US": "Vault ID", "zh-CN": "Vault ID" },
  },
} as const;

export function vaultRows(vaults: CloudVault[]): string[][] {
  return vaults.map((vault) => [
    vault.id,
    displayValue(vault.display_name),
    displayValue(vault.type),
    displayValue(vault.created_at),
    displayValue(vault.updated_at),
  ]);
}

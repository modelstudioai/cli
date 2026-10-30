export const MEMO_ITEM_ID = "bailian-memo";
export const MEMO_ROW_CONFIG_KEY = "bailian-memo-dsh#tool-bailian-memo";

export const MEMO_SETTINGS_PAGE_TARGETS = [
  { slot: "plugins.item", id: MEMO_ITEM_ID },
  { slot: "plugins.row.config", key: MEMO_ROW_CONFIG_KEY },
] as const;

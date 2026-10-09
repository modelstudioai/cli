export const KB_SETTINGS_NAMESPACE = "tool-bailian-kb";
export const KB_ITEM_ID = "bailian-kb";
export const KB_ROW_CONFIG_KEY = "bailian-kb-dsh#tool-bailian-kb";

export const KB_SETTINGS_PAGE_TARGETS = [
  { slot: "plugins.item", id: KB_ITEM_ID },
  { slot: "plugins.row.config", key: KB_ROW_CONFIG_KEY },
] as const;

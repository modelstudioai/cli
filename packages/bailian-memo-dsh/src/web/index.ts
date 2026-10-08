/**
 * Browser half: Bailian personal-memory settings page on the Plugins surface.
 */

import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type {} from "@deepseek-ai/dsh-client-ui-plugin-manager/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-api-remotes/client";
import type { Context as ClientContext } from "@deepseek-ai/cordis";
import { MemoCard } from "./MemoCard.tsx";
import { MEMO_NS, MemoCardController } from "./memo-card-controller.ts";
import { en, zh, type MemoSettingsLocaleKey } from "./locales.ts";
import { MEMO_SETTINGS_PAGE_TARGETS } from "./registration.ts";

export { MEMO_ITEM_ID, MEMO_ROW_CONFIG_KEY } from "./registration.ts";

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface SlotMap {
    "plugins.item": {
      kind: "list";
      scope: "root";
      owner: import("@deepseek-ai/dsh-client-ui-plugin-manager/client").PluginConfigViewProps;
    };
    "plugins.row.config": {
      kind: "keyed";
      scope: "root";
      owner: import("@deepseek-ai/dsh-client-ui-plugin-manager/client").PluginConfigViewProps;
    };
  }
  interface LocaleNamespaceMap {
    "settings.bailianMemo": MemoSettingsLocaleKey;
  }
}

export const NS = "settings.bailianMemo";

export const inject = ["slots", "locale", "remote", "connection", "configForms"];

export function registerMemoSettingsPages(
  ctx: ClientContext,
  t: (key: MemoSettingsLocaleKey) => string,
  card: MemoCardController,
): () => void {
  const [itemTarget, rowTarget] = MEMO_SETTINGS_PAGE_TARGETS;
  const disposeItem = ctx.slots.inject("plugins.item", () =>
    ctx.slots.register(
      {
        name: "plugins.item",
        id: itemTarget.id,
        order: 45,
        label: () => t("title"),
        locale: NS as never,
        inject: () => card.inject(),
      },
      MemoCard,
    ),
  );
  const disposeRow = ctx.slots.inject("plugins.row.config", () =>
    ctx.slots.register(
      {
        name: "plugins.row.config",
        key: rowTarget.key,
        locale: NS as never,
        inject: () => card.inject(),
      },
      MemoCard,
    ),
  );
  return () => {
    disposeRow();
    disposeItem();
  };
}

export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS as never) as (key: MemoSettingsLocaleKey) => string;
  ctx.effect(() => ctx.locale.register(NS as never, { zh, en }), "bailian-memo-dsh: dictionaries");
  const card = new MemoCardController(ctx.configForms.get(MEMO_NS), ctx);
  ctx.effect(
    () => () => {
      card.dispose();
    },
    "bailian-memo-dsh: form subscription",
  );
  ctx.effect(
    () => ctx.configForms.whileServed([MEMO_NS], () => registerMemoSettingsPages(ctx, t, card)),
    "bailian-memo-dsh: page",
  );
}

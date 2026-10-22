/**
 * Browser half: Bailian knowledge-base page on the Plugins surface.
 */

import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type {} from "@deepseek-ai/dsh-client-ui-plugin-manager/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-api-remotes/client";
import type { Context as ClientContext } from "@deepseek-ai/cordis";
import { BailianCard } from "./BailianCard.tsx";
import { BailianCardController } from "./bailian-card-controller.ts";
import { en, zh, type BailianKbLocaleKey } from "./locales.ts";
import { KB_SETTINGS_NAMESPACE, KB_SETTINGS_PAGE_TARGETS } from "./registration.ts";

export { KB_ITEM_ID, KB_ROW_CONFIG_KEY } from "./registration.ts";

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
    "settings.bailianKb": BailianKbLocaleKey;
  }
}

export const NS = "settings.bailianKb";
export const inject = ["slots", "locale", "remote", "connection", "configForms"];

export function registerKbSettingsPages(
  ctx: ClientContext,
  t: (key: BailianKbLocaleKey) => string,
  card: BailianCardController,
): () => void {
  const [itemTarget, rowTarget] = KB_SETTINGS_PAGE_TARGETS;
  const disposeItem = ctx.slots.inject("plugins.item", () =>
    ctx.slots.register(
      {
        name: "plugins.item",
        id: itemTarget.id,
        order: 40,
        label: () => t("title"),
        locale: NS as never,
        inject: () => card.inject(),
      },
      BailianCard,
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
      BailianCard,
    ),
  );
  return () => {
    disposeRow();
    disposeItem();
  };
}

export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS as never) as (key: BailianKbLocaleKey) => string;
  ctx.effect(() => ctx.locale.register(NS as never, { zh, en }), "bailian-kb-dsh: dictionaries");
  const card = new BailianCardController(ctx.configForms.get(KB_SETTINGS_NAMESPACE), ctx);
  ctx.effect(() => () => card.dispose(), "bailian-kb-dsh: form subscription");
  ctx.effect(
    () =>
      ctx.configForms.whileServed([KB_SETTINGS_NAMESPACE], () =>
        registerKbSettingsPages(ctx, t, card),
      ),
    "bailian-kb-dsh: page",
  );
}

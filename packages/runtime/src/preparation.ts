import type { RunContext } from "./middleware.ts";
import { ConfirmationRequiredError, confirmationHint } from "./confirm.ts";

/** Keep resources acquired for planning scoped to this invocation. */
export async function runPreparedCommand(context: RunContext): Promise<void> {
  if (!context.command.prepare) return context.command.run(context);
  const preparation = await context.command.prepare({ ...context, prepared: undefined });
  try {
    const notices = preparation.notices.map((notice) => ({
      ...notice,
      message: context.localize(notice.message),
    }));
    if (context.settings.dryRun) {
      if (preparation.renderDryRun) return preparation.renderDryRun();
      context.output.result({ plan: preparation.preview, risk: preparation.risk, notices });
      return;
    }
    if (preparation.risk && !context.confirmed) {
      throw new ConfirmationRequiredError({
        message: context.localize(preparation.risk.message),
        hint: context.localize(confirmationHint()),
        plan: preparation.preview,
        notices,
      });
    }
    for (const notice of notices) {
      context.output.warning({
        code: notice.code,
        message: notice.message,
        ...(notice.url ? { details: { url: notice.url } } : {}),
      });
    }
    context.prepared = preparation.data;
    await context.command.run(context);
  } finally {
    preparation.dispose?.();
  }
}

import type { RunContext } from "./middleware.ts";
import { ConfirmationRequiredError, confirmationHint } from "./confirm.ts";

/** Returns false when the read-only preview has completed the invocation. */
export async function prepareCommand(context: RunContext): Promise<boolean> {
  if (!context.command.prepare) return true;
  const preparation = await context.command.prepare({ ...context, prepared: undefined });
  const notices = preparation.notices.map((notice) => ({
    ...notice,
    message: context.localize(notice.message),
  }));
  if (context.settings.dryRun) {
    context.output.result({ plan: preparation.preview, risk: preparation.risk, notices });
    return false;
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
  return true;
}

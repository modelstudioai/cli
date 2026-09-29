import { detectOutputFormat } from "bailian-cli-core";
import type { RunContext } from "./middleware.ts";
import { ConfirmationRequiredError, confirmationHint } from "./confirm.ts";
import { emitResult } from "./output/output.ts";

/** Returns false when the read-only preview has completed the invocation. */
export async function prepareCommand(context: RunContext): Promise<boolean> {
  if (!context.command.prepare) return true;
  const preparation = await context.command.prepare({ ...context, prepared: undefined });
  const notices = preparation.notices.map((notice) => ({
    ...notice,
    message: context.localize(notice.message),
  }));
  if (context.settings.dryRun) {
    emitResult(
      { plan: preparation.preview, risk: preparation.risk, notices },
      detectOutputFormat(context.settings.output),
    );
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
    process.stderr.write(
      context.settings.output === "json"
        ? JSON.stringify({ warning: notice }) + "\n\n"
        : `${notice.message}${notice.url ? `\n${notice.url}` : ""}\n`,
    );
  }
  context.prepared = preparation.data;
  return true;
}

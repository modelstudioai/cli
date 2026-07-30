import type { RuntimeFeedbackEvent } from "@openagentpack/sdk";

/**
 * Render SDK runtime feedback to stderr, keeping stdout a clean data channel.
 * Used as the `onFeedback` sink for plan/apply so progress messages don't mix
 * with structured output.
 */
export function renderAgentFeedback(event: RuntimeFeedbackEvent): void {
  process.stderr.write(`${event.message}\n`);
}

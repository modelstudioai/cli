import type { RuntimeFeedbackEvent } from "@openagentpack/sdk";
import type { CommandOutput } from "bailian-cli-core";
import { writeSdkDiagnostic } from "./transport.ts";

export function renderAgentFeedback(output: CommandOutput, event: RuntimeFeedbackEvent): void {
  writeSdkDiagnostic(() => {
    if (event.level === "warning" || event.level === "error") {
      output.warning({
        code: "AGENT_RUNTIME_FEEDBACK",
        message: event.message,
        details: { type: event.type, resource: event.resource },
      });
    } else output.info(event.message);
  });
}

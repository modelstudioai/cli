import { PipelineError } from "../errors.ts";
import { registerStep } from "../dispatcher.ts";
import type { StepDispatcher } from "../dispatcher.ts";
import type { StepOutputSchema } from "../types.ts";

const SCRIPT_JS_OUTPUT_SCHEMA: StepOutputSchema = {
  description: "Execute inline JavaScript; output shape is user-defined by the return value",
  paths: [{ path: "/data", description: "Return value of the script (user-defined structure)" }],
};

export function registerScriptJsStep(dispatcher?: StepDispatcher): void {
  registerStep(
    "script/js",
    (_input) => {
      const code = _input.code as string;
      if (!code || typeof code !== "string") {
        throw new PipelineError("script_js_error", "script/js requires a 'code' string input", {
          step: "script/js",
        });
      }
      const args = (_input.args ?? {}) as Record<string, unknown>;
      try {
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        const fn = new Function("args", code);
        const result = fn(args);
        return { data: result ?? {} };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new PipelineError("script_js_error", `script/js execution failed: ${message}`, {
          step: "script/js",
        });
      }
    },
    dispatcher,
    SCRIPT_JS_OUTPUT_SCHEMA,
  );
}

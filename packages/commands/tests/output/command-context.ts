import type { LocalizedText, Settings } from "bailian-cli-core";
import { createOutputReporter } from "bailian-cli-runtime";

/** Bind direct command fixtures to the same resolved settings as the real runtime. */
export function withCommandOutput<Context extends { settings: Settings }>(context: Context) {
  const localize = (message: LocalizedText) =>
    typeof message === "string" ? message : message["en-US"];
  return {
    ...context,
    localize,
    output: createOutputReporter({ settings: context.settings, localize }).output,
  };
}

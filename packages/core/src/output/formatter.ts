import { formatText } from "./text.ts";
import { formatJson } from "./json.ts";

export type OutputFormat = "rich" | "json";

export function detectOutputFormat(flagValue?: string): OutputFormat {
  if (flagValue === "json" || flagValue === "rich") {
    return flagValue;
  }
  return "json";
}

export function formatOutput(data: unknown, format: OutputFormat): string {
  switch (format) {
    case "json":
      return formatJson(data);
    case "rich":
      return formatText(data);
  }
}

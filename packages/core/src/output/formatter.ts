import { formatText } from "./text.ts";
import { formatJson } from "./json.ts";

export type OutputFormat = "text" | "json";

export function detectOutputFormat(flagValue?: string): OutputFormat {
  if (flagValue === "json" || flagValue === "text") {
    return flagValue;
  }
  return "text";
}

export function formatOutput(data: unknown, format: OutputFormat): string {
  switch (format) {
    case "json":
      return formatJson(data);
    case "text":
      return formatText(data);
  }
}

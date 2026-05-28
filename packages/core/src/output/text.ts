import { stringify } from "yaml";

export function formatText(data: unknown): string {
  return stringify(data).replace(/\n$/, "");
}

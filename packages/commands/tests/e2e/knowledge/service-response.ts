import { parseStdoutJson } from "../helpers.ts";

/** Read supported service mutation envelopes; quiet never implies a bare scalar. */
export function readServiceMutationField(
  stdout: string,
  field: "agent_id" | "agent_version",
): string {
  const response = parseStdoutJson<{ data?: Record<string, unknown>; [key: string]: unknown }>(
    stdout,
  );
  const nested = response?.data?.[field];
  const value = typeof nested === "string" ? nested : response?.[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing ${field} in service JSON response.`);
  }
  return value;
}

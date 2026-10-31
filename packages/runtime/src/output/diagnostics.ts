import type { LocalizedText, OutputMessage } from "bailian-cli-core";

import { sanitizeDiagnosticDetails } from "bailian-cli-core";
export { sanitizeDiagnosticDetails } from "bailian-cli-core";

export function diagnosticPayload(
  input: OutputMessage,
  localize: (text: LocalizedText) => string,
): { message: string; code?: string; details?: unknown } {
  if (typeof input === "string") return { message: localize(input) };
  try {
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const readField = (descriptor: PropertyDescriptor | undefined): unknown => {
      if (!descriptor) return undefined;
      return "value" in descriptor
        ? sanitizeDiagnosticDetails(descriptor.value as unknown)
        : "[Accessor]";
    };
    if (Object.hasOwn(descriptors, "message")) {
      const message = readField(descriptors.message) as LocalizedText;
      const code = readField(descriptors.code);
      const details = readField(descriptors.details);
      return {
        message: localize(message),
        ...(typeof code === "string" ? { code } : {}),
        ...(details === undefined ? {} : { details }),
      };
    }
    return { message: localize(sanitizeDiagnosticDetails(input) as LocalizedText) };
  } catch {
    // Top-level proxy traps and malformed diagnostics must not interrupt commands.
    return { message: "[Unserializable]" };
  }
}

const MAX_DIAGNOSTIC_DEPTH = 8;
const SECRET_KEY =
  /(?:authorization|cookie|apikey|accesskey(?:id)?|privatekey|credentials?|token|password|secret)$/i;

/** Convert diagnostics to inert data; never invoke accessors or serialization hooks. */
export function sanitizeDiagnosticDetails(
  value: unknown,
  ancestors = new Set<object>(),
  depth = 0,
): unknown {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return "[Function]";
  if (value === null || typeof value !== "object") return value;
  if (ancestors.has(value)) return "[Circular]";
  if (depth >= MAX_DIAGNOSTIC_DEPTH) return "[Truncated]";
  ancestors.add(value);
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const readDescriptor = (descriptor: PropertyDescriptor | undefined): unknown => {
      if (!descriptor) return undefined;
      if (!("value" in descriptor)) return "[Accessor]";
      return sanitizeDiagnosticDetails(descriptor.value as unknown, ancestors, depth + 1);
    };
    if (Array.isArray(value)) {
      const length = descriptors.length?.value as number;
      return Array.from({ length }, (_entry, index) => readDescriptor(descriptors[String(index)]));
    }
    return Object.fromEntries(
      Object.entries(descriptors)
        .filter(([, descriptor]) => descriptor.enumerable)
        .map(([key, descriptor]) => [
          key,
          SECRET_KEY.test(key.replaceAll(/[-_]/g, "")) ? "[REDACTED]" : readDescriptor(descriptor),
        ]),
    );
  } catch {
    // Proxy traps and exotic objects must not make verbose change business behavior.
    return "[Unserializable]";
  } finally {
    ancestors.delete(value);
  }
}

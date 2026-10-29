export interface InitCreatedResource {
  kind: "knowledge-base" | "service" | "file";
  id: string;
  created: true;
}

/** Recovery for the live test even when init never emits its final stdout result. */
export function initCreatedResources(stdout: string, stderr: string): InitCreatedResource[] {
  const resources = new Map<string, InitCreatedResource>();
  const collect = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const resource = value as Record<string, unknown>;
    if (resource.created !== true || typeof resource.id !== "string" || !resource.id.trim()) return;
    if (
      resource.kind !== "knowledge-base" &&
      resource.kind !== "service" &&
      resource.kind !== "file"
    )
      return;
    resources.set(`${resource.kind}:${resource.id}`, {
      kind: resource.kind,
      id: resource.id,
      created: true,
    });
  };
  try {
    const result = JSON.parse(stdout);
    if (Array.isArray(result?.resources)) result.resources.forEach(collect);
  } catch {
    /* A failed command may have no final result. */
  }
  for (const line of stderr.split(/\r?\n/)) {
    try {
      const record = JSON.parse(line);
      if (record?.code === "KNOWLEDGE_INIT_RESOURCE") collect(record.resource);
    } catch {
      /* Ignore progress text and truncated diagnostics. */
    }
  }
  return [...resources.values()];
}

/** Probe assertion: a matching row count alone cannot prove sentinel survival. */
export function exactIndexInventory(value: unknown, expectedIds: readonly string[]): boolean {
  if (!value || typeof value !== "object") return false;
  const data = (value as { data?: unknown }).data;
  if (!data || typeof data !== "object") return false;
  const { rows, total_count: total } = data as { rows?: unknown; total_count?: unknown };
  if (!Array.isArray(rows) || total !== expectedIds.length || rows.length !== expectedIds.length)
    return false;
  const expected = new Set(expectedIds);
  if (expected.size !== expectedIds.length || expectedIds.some((id) => !id)) return false;
  const actual = new Set<string>();
  for (const row of rows) {
    if (
      !row ||
      typeof row !== "object" ||
      typeof row.doc_id !== "string" ||
      !expected.has(row.doc_id) ||
      actual.has(row.doc_id)
    )
      return false;
    actual.add(row.doc_id);
  }
  return actual.size === expected.size;
}

/** Format an integer with en-US thousands separators for table / text output. */
export function formatNumber(num: number): string {
  return num.toLocaleString("en-US");
}

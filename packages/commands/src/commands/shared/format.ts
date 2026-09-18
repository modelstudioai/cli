/** Format an integer with en-US thousands separators for table / text output. */
export function formatNumber(num: number): string {
  return num.toLocaleString("en-US");
}

/** Format a millisecond timestamp as `YYYY-MM-DD`. */
export function formatDate(ts: number): string {
  const date = new Date(ts);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Format a millisecond timestamp as `YYYY-MM-DD HH:mm:ss`. */
export function formatDateTime(ts: number): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = new Date(ts);
  return `${formatDate(ts)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

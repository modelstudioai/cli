/** Presentation only: never normalize or mutate the server response used by JSON output. */
export function firstNonEmptyText(...values: unknown[]): string {
  return (
    values.find((value): value is string => typeof value === "string" && value.trim().length > 0) ??
    ""
  );
}

function formatMilliseconds(value: number): string {
  const milliseconds = Math.floor(value);
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.floor(milliseconds / 1000) % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds % 1000).padStart(3, "0")}`;
}

export function mediaSummary(metadata: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const start = metadata.clip_start_time;
  const end = metadata.clip_end_time;
  if (
    typeof start === "number" &&
    typeof end === "number" &&
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start >= 0 &&
    end >= start
  ) {
    lines.push(`clip: ${formatMilliseconds(start)}–${formatMilliseconds(end)}`);
  }
  if (typeof metadata.clip_description === "string" && metadata.clip_description.trim()) {
    lines.push(`clip_description: ${metadata.clip_description}`);
  }
  for (const key of ["video_url", "audio_url", "image_url"]) {
    const value = metadata[key];
    const urls = Array.isArray(value) ? value : [value];
    for (const url of urls) if (typeof url === "string" && url) lines.push(`${key}: ${url}`);
  }
  if (Array.isArray(metadata.audio_segments)) {
    // Preserve full timing, speaker, content and unknown fields, including cross-clip segments.
    for (const segment of metadata.audio_segments)
      lines.push(`audio_segment: ${JSON.stringify(segment)}`);
  }
  return lines;
}

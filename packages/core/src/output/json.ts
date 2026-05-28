export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function formatErrorJson(code: number, message: string, hint?: string): string {
  return JSON.stringify(
    {
      error: {
        code,
        message,
        ...(hint ? { hint } : {}),
      },
    },
    null,
    2,
  );
}

import { BailianError } from "./base.ts";
import { ExitCode } from "./codes.ts";

export interface ApiErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number | string;
  };
  code?: string;
  message?: string;
  request_id?: string;
}

export function mapApiError(status: number, body: ApiErrorBody, _url?: string): BailianError {
  const apiMsg = body.error?.message || body.message || `HTTP ${status}`;
  const rawCode = body.error?.type ?? body.code;
  const apiCode =
    typeof rawCode === "string"
      ? rawCode
      : typeof rawCode === "number"
        ? String(rawCode)
        : undefined;

  return new BailianError(apiMsg, ExitCode.GENERAL, undefined, {
    api: {
      httpStatus: status,
      apiCode,
      requestId: body.request_id,
    },
  });
}

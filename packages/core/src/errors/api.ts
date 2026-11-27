import { BailianError } from "./base.ts";
import { ExitCode } from "./codes.ts";

export interface ApiErrorBody {
  success?: boolean;
  error?: {
    message?: string;
    type?: string;
    code?: number | string;
  };
  code?: number | string;
  message?: string;
  request_id?: string;
  requestID?: string;
  requestId?: string;
  error_code?: string;
  error_msg?: string;
  errorCode?: string;
  errorMsg?: string;
}

export function apiErrorContext(body: ApiErrorBody) {
  const rawCode =
    body.error?.type ?? body.error?.code ?? body.code ?? body.error_code ?? body.errorCode;
  const apiCode =
    typeof rawCode === "string"
      ? rawCode
      : typeof rawCode === "number"
        ? String(rawCode)
        : undefined;

  return { apiCode, requestId: body.request_id ?? body.requestID ?? body.requestId };
}

export function mapApiError(status: number, body: ApiErrorBody, _url?: string): BailianError {
  const apiMsg =
    body.error?.message || body.message || body.error_msg || body.errorMsg || `HTTP ${status}`;
  return new BailianError(apiMsg, ExitCode.GENERAL, undefined, {
    api: { httpStatus: status, ...apiErrorContext(body) },
  });
}

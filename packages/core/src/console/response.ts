import { BailianError } from "../errors/base.ts";
import { ExitCode } from "../errors/codes.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const ENVELOPE_KEYS = new Set([
  "data",
  "DataV2",
  "success",
  "successResponse",
  "failed",
  "code",
  "errorCode",
  "errorMsg",
  "message",
  "requestId",
  "request_id",
  "traceId",
  // Transport metadata belongs to the envelope, not to the business payload.
  "httpStatusCode",
  "httpStatus",
  "api",
  "ret",
]);

function isEnvelope(value: Record<string, unknown>, protocolLayer = false): boolean {
  return (
    // DataV2 and its result are known protocol positions. Their status markers
    // remain authoritative when the gateway adds metadata such as appName.
    (protocolLayer &&
      (typeof value.success === "boolean" ||
        typeof value.failed === "boolean" ||
        Array.isArray(value.ret))) ||
    Object.hasOwn(value, "DataV2") ||
    typeof value.successResponse === "boolean" ||
    (Object.keys(value).every((key) => ENVELOPE_KEYS.has(key)) &&
      (Object.hasOwn(value, "data") ||
        Object.hasOwn(value, "errorCode") ||
        Array.isArray(value.ret) ||
        typeof value.success === "boolean" ||
        typeof value.failed === "boolean"))
  );
}

function stringField(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number") return String(value);
  return undefined;
}

/**
 * Read the known Console protocol layers, not arbitrary business `data` fields.
 * Unlike the legacy unwrapResponse, failures are checked before discarding the
 * envelope and a successful null payload remains null. Used by the typed reads.
 */
export function unwrapConsoleResponse(raw: unknown): unknown {
  const layers: Record<string, unknown>[] = [];
  let payload = raw;
  let protocolLayer: "dataV2" | "result" | undefined;
  while (isRecord(payload) && isEnvelope(payload, protocolLayer !== undefined)) {
    layers.push(payload);
    if (layers.length > 6) {
      throw new BailianError(
        "Invalid Console response envelope. / Console 响应信封无效。",
        ExitCode.GENERAL,
      );
    }
    if (Object.hasOwn(payload, "DataV2")) {
      payload = payload.DataV2;
      protocolLayer = "dataV2";
    } else if (Object.hasOwn(payload, "data")) {
      protocolLayer = protocolLayer === "dataV2" ? "result" : undefined;
      payload = payload.data;
    } else break;
  }

  const failedRet = layers.flatMap((layer) =>
    Array.isArray(layer.ret)
      ? layer.ret.filter(
          (entry): entry is string => typeof entry === "string" && !entry.startsWith("SUCCESS::"),
        )
      : [],
  );
  const failedLayers = layers.filter((layer) => {
    const errorCode = stringField(layer.errorCode);
    return (
      layer.success === false ||
      layer.successResponse === false ||
      layer.failed === true ||
      (layer.success !== true &&
        layer.successResponse !== true &&
        errorCode !== undefined &&
        errorCode !== "0" &&
        errorCode !== "200")
    );
  });
  if (failedLayers.length > 0 || failedRet.length > 0) {
    const innerFirst = [...failedLayers].reverse();
    const message =
      innerFirst
        .map((layer) => stringField(layer.errorMsg) ?? stringField(layer.message))
        .find(Boolean) ??
      (failedRet.join("; ") ||
        "Console service failed without a message. / Console 服务失败，未提供错误消息。");
    const apiCode = innerFirst
      .map(
        (layer) =>
          stringField(layer.errorCode) ??
          (layer.success === false || layer.failed === true ? stringField(layer.code) : undefined),
      )
      .find(Boolean);
    const requestId = layers
      .map((layer) => stringField(layer.requestId) ?? stringField(layer.request_id))
      .find(Boolean);
    const details = [
      "HTTP 200",
      apiCode ? `code=${apiCode}` : "",
      requestId ? `request_id=${requestId}` : "",
    ]
      .filter(Boolean)
      .join("; ");
    throw new BailianError(`${message} (${details})`, ExitCode.GENERAL, undefined, {
      api: { httpStatus: 200, apiCode, requestId },
      rawResponse: JSON.stringify(raw),
    });
  }
  return payload;
}

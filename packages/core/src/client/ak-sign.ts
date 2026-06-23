/**
 * Alibaba Cloud V3 Signature (ROA style) for Bailian Cloud API.
 *
 * Used by Knowledge Base Retrieve API which requires AK/SK authentication
 * instead of Bearer token.
 *
 * Reference: https://help.aliyun.com/document_detail/2712195.html
 */

import { createHmac, createHash, randomUUID } from "crypto";

export interface AkSignConfig {
  accessKeyId: string;
  accessKeySecret: string;
  action: string;
  version: string;
  body: string;
  host: string;
  pathname: string;
  method?: string;
  /** ACS3 canonical query string (sorted, encoded, no leading `?`). Empty for POST body-only APIs. */
  queryString?: string;
}

/** Build ACS3 canonical query string from POP query parameters. */
export function buildCanonicalQuery(params: Record<string, string | string[] | undefined>): string {
  const pairs: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      const sorted = [...value].sort();
      for (const v of sorted) {
        if (v !== "") pairs.push([key, v]);
      }
    } else {
      pairs.push([key, value]);
    }
  }
  pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return pairs.map(([k, v]) => `${encodeRFC3986(k)}=${encodeRFC3986(v)}`).join("&");
}

function encodeRFC3986(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function signRequest(cfg: AkSignConfig): Record<string, string> {
  const method = cfg.method ?? "POST";
  const now = new Date();
  const dateISO = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  const nonce = randomUUID();

  const hashedBody = sha256Hex(cfg.body);

  const headers: Record<string, string> = {
    host: cfg.host,
    "x-acs-action": cfg.action,
    "x-acs-version": cfg.version,
    "x-acs-date": dateISO,
    "x-acs-signature-nonce": nonce,
    "x-acs-content-sha256": hashedBody,
    "content-type": "application/json",
  };

  // Build canonical headers (sorted, lowercase)
  const signedHeaderKeys = Object.keys(headers)
    .filter((k) => k === "host" || k === "content-type" || k.startsWith("x-acs-"))
    .sort();

  const canonicalHeaders = signedHeaderKeys.map((k) => `${k}:${headers[k]}`).join("\n") + "\n";

  const signedHeadersStr = signedHeaderKeys.join(";");

  const queryString = cfg.queryString ?? "";

  // Build canonical request
  const canonicalRequest = [
    method,
    cfg.pathname,
    queryString,
    canonicalHeaders,
    signedHeadersStr,
    hashedBody,
  ].join("\n");

  // Build string to sign
  const algorithm = "ACS3-HMAC-SHA256";
  const hashedCanonical = sha256Hex(canonicalRequest);
  const stringToSign = `${algorithm}\n${hashedCanonical}`;

  // Calculate signature
  const signature = hmacSHA256Hex(cfg.accessKeySecret, stringToSign);

  headers["authorization"] =
    `${algorithm} Credential=${cfg.accessKeyId},SignedHeaders=${signedHeadersStr},Signature=${signature}`;

  return headers;
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function hmacSHA256Hex(key: string, data: string): string {
  return createHmac("sha256", key).update(data, "utf8").digest("hex");
}

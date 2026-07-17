import { createHmac, createHash, randomUUID } from "crypto";

export type AcsQueryParams = Record<string, string | string[] | undefined | number>;

export interface AcsSignConfig {
  accessKeyId: string;
  accessKeySecret: string;
  securityToken?: string;
  action: string;
  version: string;
  body: string;
  host: string;
  pathname: string;
  method?: string;
  /** ACS3 canonical query string (sorted, encoded, no leading `?`). */
  queryString?: string;
}

/** Build ACS3 canonical query string from OpenAPI query parameters. */
export function buildAcsCanonicalQuery(params: AcsQueryParams): string {
  const pairs: Array<[string, string | number | undefined]> = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const v = value[i];
        if (v !== "") pairs.push([`${key}.${i + 1}`, v]);
      }
    } else {
      pairs.push([key, value]);
    }
  }
  pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return pairs
    .map(([key, value]) => `${encodeRFC3986(key)}=${encodeRFC3986(String(value))}`)
    .join("&");
}

export function signAcsRequest(cfg: AcsSignConfig): Record<string, string> {
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
  if (cfg.securityToken) headers["x-acs-security-token"] = cfg.securityToken;

  const signedHeaderKeys = Object.keys(headers)
    .filter((k) => k === "host" || k === "content-type" || k.startsWith("x-acs-"))
    .sort();
  const canonicalHeaders = signedHeaderKeys.map((k) => `${k}:${headers[k]}`).join("\n") + "\n";
  const signedHeadersStr = signedHeaderKeys.join(";");
  const queryString = cfg.queryString ?? "";
  const canonicalRequest = [
    method,
    cfg.pathname,
    queryString,
    canonicalHeaders,
    signedHeadersStr,
    hashedBody,
  ].join("\n");

  const algorithm = "ACS3-HMAC-SHA256";
  const hashedCanonical = sha256Hex(canonicalRequest);
  const stringToSign = `${algorithm}\n${hashedCanonical}`;
  const signature = hmacSHA256Hex(cfg.accessKeySecret, stringToSign);

  headers.authorization = `${algorithm} Credential=${cfg.accessKeyId},SignedHeaders=${signedHeadersStr},Signature=${signature}`;

  return headers;
}

function encodeRFC3986(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function hmacSHA256Hex(key: string, data: string): string {
  return createHmac("sha256", key).update(data, "utf8").digest("hex");
}

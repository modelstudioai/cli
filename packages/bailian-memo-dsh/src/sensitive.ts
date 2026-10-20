/**
 * Pre-upload sensitive / credential filters for curator and remember paths.
 */

const CREDENTIAL_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9]{16,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bLTAI[A-Za-z0-9]{12,}\b/g,
  /\bBearer\s+[A-Za-z0-9._-]+\b/gi,
  /\bapi[_-]?key\s*[:=]\s*\S+/gi,
  /\bpassword\s*[:=]\s*\S+/gi,
  /\bsecret\s*[:=]\s*\S+/gi,
  /\b-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
];

const SENSITIVE_HINTS =
  /(?:病史|诊断|病历|信用卡|银行卡|身份证号|护照|社保|精确地址|medical history|credit card|ssn|passport|home address)/i;

export interface FilterResult {
  /** Text safe to send, or null when the whole fragment must be skipped. */
  safeText: string | null;
  /** Whether credential-like material was detected. */
  blockedCredential: boolean;
  /** Whether sensitive personal data was detected without explicit grant. */
  blockedSensitive: boolean;
}

/** Strip or reject credential-bearing text before any Memory upload. */
export function filterForUpload(
  text: string,
  options: { allowSensitive?: boolean } = {},
): FilterResult {
  let working = text;
  let blockedCredential = false;
  for (const pattern of CREDENTIAL_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(working)) {
      blockedCredential = true;
      working = working.replace(pattern, "[REDACTED]");
    }
  }
  // Any credential hit refuses the whole fragment — never store adjacent prose
  // that still implies a secret was present.
  if (blockedCredential) {
    return { safeText: null, blockedCredential: true, blockedSensitive: false };
  }
  const blockedSensitive = !options.allowSensitive && SENSITIVE_HINTS.test(working);
  if (blockedSensitive) {
    return { safeText: null, blockedCredential, blockedSensitive: true };
  }
  return { safeText: working, blockedCredential, blockedSensitive: false };
}

/** Structured curator output must quote source text verbatim for commits. */
export function quotesMatchSource(quote: string, sourceTexts: readonly string[]): boolean {
  const normalizedQuote = quote.trim();
  if (normalizedQuote.length === 0) return false;
  return sourceTexts.some((source) => source.includes(normalizedQuote));
}

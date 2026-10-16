import {
  BailianError,
  ExitCode,
  getApiKeyLoginKind,
  normalizeModelBaseUrl,
  requestJson,
  type ApiKeyLoginKind,
  type AuthPersistPatch,
  type AuthStore,
  type Identity,
  type Settings,
} from "bailian-cli-core";

interface ApiKeyValidationDeps {
  identity: Identity;
  settings: Settings;
}

interface ApiKeyLoginDeps extends ApiKeyValidationDeps {
  authStore: AuthStore;
}

interface ApiKeyLoginProfile {
  persistBaseUrl?: string;
  defaultTextModel?: string;
  defaultVideoModel?: string;
  defaultImageToVideoModel?: string;
  defaultReferenceToVideoModel?: string;
  defaultImageModel?: string;
  defaultSpeechModel?: string;
  defaultSpeechRecognitionModel?: string;
  apiKeyCapabilities?: readonly string[];
  persistPatch?: AuthPersistPatch;
}

type ApiKeyEndpointKind = Exclude<ApiKeyLoginKind, "unknown">;

interface ApiKeyValidationCandidate {
  baseUrl: string;
  kind: ApiKeyEndpointKind;
  modelsUrl: string;
}

export interface ApiKeyValidationOptions {
  explicitBaseUrl?: string;
  storedBaseUrl?: string;
  workspaceId?: string;
}

export interface ApiKeyValidationResult {
  baseUrl: string;
  kind: ApiKeyEndpointKind;
}

const API_KEY_VALIDATION_TIMEOUT_SECONDS = 5;
const DEFINITIVE_VALIDATION_FAILURE_STATUSES = new Set([200, 400, 401, 403, 404, 405]);
const ORDINARY_WORKSPACE_REGIONS = [
  "cn-beijing",
  "ap-southeast-1",
  "cn-hongkong",
  "ap-northeast-1",
  "eu-central-1",
  "us-east-1",
] as const;

const KNOWN_BASE_URLS: Readonly<Record<ApiKeyEndpointKind, readonly string[]>> = {
  ordinary: [
    "https://dashscope.aliyuncs.com",
    "https://dashscope-intl.aliyuncs.com",
    "https://dashscope-us.aliyuncs.com",
    "https://cn-hongkong.dashscope.aliyuncs.com",
  ],
  "token-plan": [
    "https://token-plan.cn-beijing.maas.aliyuncs.com",
    "https://token-plan.ap-southeast-1.maas.aliyuncs.com",
  ],
};

function modelsUrl(baseUrl: string, kind: ApiKeyEndpointKind): string {
  const url = new URL(
    kind === "token-plan" ? "/compatible-mode/v1/models" : "/api/v1/models",
    `${baseUrl}/`,
  );
  if (kind === "ordinary") {
    url.searchParams.set("page_no", "1");
    url.searchParams.set("page_size", "1");
  }
  return url.toString();
}

function validationKinds(apiKeyKind: ApiKeyLoginKind): ApiKeyEndpointKind[] {
  if (apiKeyKind === "unknown") return ["ordinary", "token-plan"];
  return [apiKeyKind];
}

function isTokenPlanBaseUrl(baseUrl: string): boolean {
  return new URL(normalizeModelBaseUrl(baseUrl)).hostname.startsWith("token-plan.");
}

function addCandidate(
  candidates: ApiKeyValidationCandidate[],
  seenUrls: Set<string>,
  baseUrl: string,
  kind: ApiKeyEndpointKind,
): void {
  const normalizedBaseUrl = normalizeModelBaseUrl(baseUrl);
  const url = modelsUrl(normalizedBaseUrl, kind);
  if (seenUrls.has(url)) return;
  seenUrls.add(url);
  candidates.push({ baseUrl: normalizedBaseUrl, kind, modelsUrl: url });
}

export function apiKeyValidationCandidates(
  key: string,
  options: ApiKeyValidationOptions,
): ApiKeyValidationCandidate[] {
  const apiKeyKind = getApiKeyLoginKind(key);
  const kinds = validationKinds(apiKeyKind);
  const candidates: ApiKeyValidationCandidate[] = [];
  const seenUrls = new Set<string>();

  if (options.explicitBaseUrl) {
    for (const kind of kinds) addCandidate(candidates, seenUrls, options.explicitBaseUrl, kind);
    return candidates;
  }

  if (options.storedBaseUrl) {
    const storedIsTokenPlan = isTokenPlanBaseUrl(options.storedBaseUrl);
    for (const kind of kinds) {
      if (apiKeyKind === "unknown" || storedIsTokenPlan === (kind === "token-plan")) {
        addCandidate(candidates, seenUrls, options.storedBaseUrl, kind);
      }
    }
  }

  if (options.workspaceId && kinds.includes("ordinary")) {
    for (const region of ORDINARY_WORKSPACE_REGIONS) {
      addCandidate(
        candidates,
        seenUrls,
        `https://${options.workspaceId}.${region}.maas.aliyuncs.com`,
        "ordinary",
      );
    }
  }

  for (const kind of kinds) {
    for (const baseUrl of KNOWN_BASE_URLS[kind]) {
      addCandidate(candidates, seenUrls, baseUrl, kind);
    }
  }
  return candidates;
}

function isDefinitiveCandidateFailure(error: unknown): boolean {
  if (!(error instanceof BailianError)) return false;
  const status = error.api?.httpStatus;
  return status !== undefined && DEFINITIVE_VALIDATION_FAILURE_STATUSES.has(status);
}

/** Validate a key without consuming model quota and return the first matching endpoint. */
export async function validateApiKey(
  deps: ApiKeyValidationDeps,
  key: string,
  options: ApiKeyValidationOptions,
): Promise<ApiKeyValidationResult> {
  const candidates = apiKeyValidationCandidates(key, options);
  const results = await Promise.all(
    candidates.map(async (candidate) => {
      try {
        await requestJson<unknown>(deps, {
          url: candidate.modelsUrl,
          headers: { Authorization: `Bearer ${key}` },
          timeout: Math.min(deps.settings.timeout, API_KEY_VALIDATION_TIMEOUT_SECONDS),
        });
        return { candidate };
      } catch (error) {
        return { candidate, error };
      }
    }),
  );

  const success = results.find((result) => result.error === undefined);
  if (success) return { baseUrl: success.candidate.baseUrl, kind: success.candidate.kind };

  const inconclusive = results.find((result) => !isDefinitiveCandidateFailure(result.error));
  if (inconclusive?.error !== undefined) throw inconclusive.error;

  const explicitHint = options.explicitBaseUrl
    ? "Check that the API key belongs to this Base URL."
    : "For a workspace-specific or custom endpoint, retry with --base-url <url>.";
  throw new BailianError(
    "API key validation failed: the key was not accepted by any supported model endpoint.",
    ExitCode.AUTH,
    explicitHint,
  );
}

/**
 * Persist an already-trusted API key and optional profile defaults.
 * Console login uses this directly because its callback already supplies the key and endpoint;
 * direct API-key login must call validateApiKey first.
 */
export async function persistApiKey(
  deps: ApiKeyLoginDeps,
  key: string,
  profile: ApiKeyLoginProfile,
): Promise<void> {
  const persistBaseUrl = profile.persistBaseUrl
    ? normalizeModelBaseUrl(profile.persistBaseUrl)
    : undefined;
  await deps.authStore.login({
    ...profile.persistPatch,
    api_key: key,
    base_url: persistBaseUrl,
    default_text_model: profile.defaultTextModel,
    default_video_model: profile.defaultVideoModel,
    default_image_to_video_model: profile.defaultImageToVideoModel,
    default_reference_to_video_model: profile.defaultReferenceToVideoModel,
    default_image_model: profile.defaultImageModel,
    default_speech_model: profile.defaultSpeechModel,
    default_speech_recognition_model: profile.defaultSpeechRecognitionModel,
    api_key_capabilities: profile.apiKeyCapabilities ? [...profile.apiKeyCapabilities] : undefined,
  });
}

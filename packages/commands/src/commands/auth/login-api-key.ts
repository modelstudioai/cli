import {
  BailianError,
  ExitCode,
  chatPath,
  requestJson,
  normalizeModelBaseUrl,
  applyChatEnableThinking,
  resolveChatEnableThinking,
  withEnableThinkingRetry,
  type AuthPersistPatch,
  type AuthStore,
  type Identity,
  type Settings,
} from "bailian-cli-core";

interface ApiKeyLoginDeps {
  identity: Identity;
  settings: Settings;
  authStore: AuthStore;
}

interface ApiKeyLoginProfile {
  baseUrl: string;
  persistBaseUrl?: string;
  defaultTextModel?: string;
  defaultVideoModel?: string;
  defaultImageToVideoModel?: string;
  defaultReferenceToVideoModel?: string;
  defaultImageModel?: string;
  persistPatch?: AuthPersistPatch;
}

const RETRY_DELAY_BASE_MS = 500;

function canRetry(error: unknown): boolean {
  if (error instanceof BailianError) {
    if (error.exitCode === ExitCode.NETWORK || error.exitCode === ExitCode.TIMEOUT) return true;
    const status = error.api?.httpStatus;
    return status === 401 || (status !== undefined && status >= 500);
  }
  if (error instanceof Error) {
    return (
      error.name === "AbortError" ||
      error.name === "TimeoutError" ||
      error.message.includes("timed out") ||
      error.message === "fetch failed"
    );
  }
  return false;
}

export async function validateAndPersistApiKey(
  deps: ApiKeyLoginDeps,
  key: string,
  profile: ApiKeyLoginProfile,
): Promise<void> {
  process.stderr.write("Testing key... ");
  const httpDeps = { identity: deps.identity, settings: deps.settings };
  const baseUrl = normalizeModelBaseUrl(profile.baseUrl);
  const persistBaseUrl = profile.persistBaseUrl
    ? normalizeModelBaseUrl(profile.persistBaseUrl)
    : undefined;
  const validationModel = profile.defaultTextModel || "qwen3.7-max";
  const body: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    max_tokens: number;
    stream: boolean;
    enable_thinking?: boolean;
  } = {
    model: validationModel,
    messages: [{ role: "user", content: "hi" }],
    max_tokens: 1,
    stream: false,
  };

  const requestOpts = {
    url: baseUrl + chatPath(),
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    timeout: Math.min(deps.settings.timeout, 30),
    body,
  };

  try {
    await withEnableThinkingRetry({
      // Validation requests are always non-streaming.
      initial: resolveChatEnableThinking({ stream: false }),
      apply: (value) => applyChatEnableThinking(body, value),
      run: async () => {
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await requestJson<unknown>(httpDeps, requestOpts);
            return;
          } catch (error) {
            if (attempt >= 3 || !canRetry(error)) throw error;
            const delayMs = RETRY_DELAY_BASE_MS * 2 ** (attempt - 1);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        }
      },
    });
  } catch (error) {
    process.stderr.write("Failed\n");
    throw error;
  }

  process.stderr.write("Valid\n");
  await deps.authStore.login({
    ...profile.persistPatch,
    api_key: key,
    base_url: persistBaseUrl,
    default_text_model: profile.defaultTextModel,
    default_video_model: profile.defaultVideoModel,
    default_image_to_video_model: profile.defaultImageToVideoModel,
    default_reference_to_video_model: profile.defaultReferenceToVideoModel,
    default_image_model: profile.defaultImageModel,
  });
}

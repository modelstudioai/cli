import { assertWorkspaceBinding } from "./personal-config.js";
import type { ConsoleLoginCredentials } from "./console-login.js";

export type CredentialSourceCategory =
  | "environment"
  | "local"
  | "projectEnvironment"
  | "userEnvironment";

export interface CredentialDescription {
  configured: boolean;
  source?: string;
  writable: boolean;
}

export interface ResolvedCredential {
  value: string;
  source: string;
}

export interface PersonalWorkspaceConfig {
  workspace_id: string | null;
}

export interface CredentialAutofillDependencies<Personal extends PersonalWorkspaceConfig> {
  describeApiKey: () => Promise<CredentialDescription>;
  resolveApiKey: () => Promise<ResolvedCredential | undefined>;
  readPersonal: () => Promise<Personal>;
  writeApiKey: (value: string) => Promise<void>;
  unsetApiKey?: () => Promise<void>;
  readWorkspace: () => string | undefined;
  writeWorkspace: (workspaceId: string | undefined) => Promise<void>;
  verify: (credentials: Required<ConsoleLoginCredentials>) => Promise<void>;
}

export function credentialSourceCategory(
  source: string | undefined,
): CredentialSourceCategory | undefined {
  if (source === "env") return "environment";
  if (source === "file") return "local";
  if (source === "project-env") return "projectEnvironment";
  if (source === "user-env") return "userEnvironment";
  return undefined;
}

function environmentOverrideError(): Error {
  return new Error(
    "BAILIAN_MEMO_API_KEY from the launching environment takes priority and cannot be updated here. " +
      "Unset it in the shell or service that starts dsh, restart dsh, then try again. / 启动环境中的 BAILIAN_MEMO_API_KEY 优先且不可在此修改，请取消该环境变量并重启 dsh。",
  );
}

export async function applyCredentialAutofill<Personal extends PersonalWorkspaceConfig>(
  credentials: ConsoleLoginCredentials,
  dependencies: CredentialAutofillDependencies<Personal>,
): Promise<string[]> {
  if (!credentials.apiKey || !credentials.workspaceId) {
    throw new Error(
      "The Bailian callback must return both an API key and Workspace; no credentials were changed.",
    );
  }

  return applyConnectionSettings(credentials, dependencies);
}

/** Manual blank API key retains the existing credential, including read-only environment keys. */
export async function applyConnectionSettings<Personal extends PersonalWorkspaceConfig>(
  credentials: ConsoleLoginCredentials,
  dependencies: CredentialAutofillDependencies<Personal>,
): Promise<string[]> {
  const replacementKey = credentials.apiKey?.trim();
  const workspaceId = credentials.workspaceId?.trim();
  if (!workspaceId) throw new Error("Workspace is required. / 请填写 Workspace。");
  const description = await dependencies.describeApiKey();
  if (replacementKey && !description.writable) throw environmentOverrideError();
  const previousCredential = await dependencies.resolveApiKey();
  const candidateKey = replacementKey || previousCredential?.value;
  if (!candidateKey) throw new Error("API key is required. / 请填写 API Key。");
  const previousPersonal = await dependencies.readPersonal();
  assertWorkspaceBinding(workspaceId, previousPersonal.workspace_id);
  const previousWorkspace = dependencies.readWorkspace();
  let apiKeyWritten = false;
  let workspaceWritten = false;

  try {
    await dependencies.verify({ apiKey: candidateKey, workspaceId });
    if (replacementKey) {
      await dependencies.writeApiKey(replacementKey);
      apiKeyWritten = true;
    }
    await dependencies.writeWorkspace(workspaceId);
    workspaceWritten = true;
    const effectiveCredential = await dependencies.resolveApiKey();
    if (!effectiveCredential || effectiveCredential.value !== candidateKey) {
      if (effectiveCredential?.source === "env") throw environmentOverrideError();
      throw new Error(
        "The updated API key is not the effective dsh credential. / 更新的 API Key 未成为 dsh 生效凭据。",
      );
    }
    return replacementKey ? ["apiKey", "workspaceId"] : ["workspaceId"];
  } catch (error) {
    if (workspaceWritten)
      await dependencies.writeWorkspace(previousWorkspace).catch(() => undefined);
    if (apiKeyWritten) {
      if (previousCredential)
        await dependencies.writeApiKey(previousCredential.value).catch(() => undefined);
      else await dependencies.unsetApiKey?.().catch(() => undefined);
    }
    let message =
      error instanceof Error ? error.message : "Connection update failed. / 连接更新失败。";
    for (const secret of [candidateKey, previousCredential?.value]) {
      if (secret) message = message.split(secret).join("[redacted]");
    }
    throw new Error(message);
  }
}

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
  writePersonal: (personal: Personal) => Promise<void>;
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
    "DASHSCOPE_API_KEY from the launching environment takes priority and cannot be updated here. " +
      "Unset it in the shell or service that starts dsh, restart dsh, then try again.",
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

  const description = await dependencies.describeApiKey();
  if (!description.writable) throw environmentOverrideError();

  const previousCredential = await dependencies.resolveApiKey();
  const previousPersonal = await dependencies.readPersonal();
  let apiKeyWritten = false;
  let workspaceWritten = false;

  try {
    await dependencies.writeApiKey(credentials.apiKey);
    apiKeyWritten = true;
    await dependencies.writePersonal({
      ...previousPersonal,
      workspace_id: credentials.workspaceId,
    });
    workspaceWritten = true;

    const effectiveCredential = await dependencies.resolveApiKey();
    if (!effectiveCredential || effectiveCredential.value !== credentials.apiKey) {
      if (effectiveCredential?.source === "env") throw environmentOverrideError();
      throw new Error(
        "The updated API key is not the effective dsh credential; no credentials were changed.",
      );
    }

    await dependencies.verify({
      apiKey: effectiveCredential.value,
      workspaceId: credentials.workspaceId,
    });
    return ["apiKey", "workspaceId"];
  } catch (error) {
    if (workspaceWritten) {
      await dependencies.writePersonal(previousPersonal).catch(() => undefined);
    }
    if (apiKeyWritten) {
      if (previousCredential) {
        await dependencies.writeApiKey(previousCredential.value).catch(() => undefined);
      } else {
        await dependencies.unsetApiKey?.().catch(() => undefined);
      }
    }
    throw error;
  }
}

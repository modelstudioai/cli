import type { BlCliConfig } from "./bl-cli.js";

interface Configuration {
  configInitialized?: boolean;
  workspaceId?: string;
  defaultRetrieveAgentId?: string;
  defaultChatAgentId?: string;
}

interface InitializationDependencies {
  read: () => Configuration;
  readSeed: () => BlCliConfig;
  resolve: (reference: string) => Promise<string | undefined>;
  set: (reference: string, value: string) => Promise<void>;
  update: (patch: Partial<Configuration>) => Promise<void>;
}

/** Import legacy values once; runtime consumers only read the dsh settings. */
export async function initializeConfiguration(deps: InitializationDependencies): Promise<void> {
  const current = deps.read();
  const apiKey = await deps.resolve("BAILIAN_KB_API_KEY");
  const seed = !apiKey || !current.configInitialized ? deps.readSeed() : {};
  if (!apiKey && seed.apiKey) await deps.set("BAILIAN_KB_API_KEY", seed.apiKey);
  if (current.configInitialized) return;
  const patch: Partial<Configuration> = { configInitialized: true };
  if (current.workspaceId === undefined) {
    patch.workspaceId = (await deps.resolve("BAILIAN_WORKSPACE_ID")) ?? seed.workspaceId ?? "";
  }
  if (current.defaultRetrieveAgentId === undefined) {
    patch.defaultRetrieveAgentId = (await deps.resolve("BAILIAN_DEFAULT_RETRIEVE_AGENT_ID")) ?? "";
  }
  if (current.defaultChatAgentId === undefined) {
    patch.defaultChatAgentId = (await deps.resolve("BAILIAN_DEFAULT_CHAT_AGENT_ID")) ?? "";
  }
  await deps.update(patch);
}

export function requireWorkspace(value: string | undefined): string {
  const workspace = value?.trim();
  if (!workspace)
    throw new Error(
      "Workspace is not configured in dsh settings. / 请在 dsh 插件设置中配置 Workspace。",
    );
  return workspace;
}

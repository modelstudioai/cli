/** Write-only connection updates; validate a candidate pair before publishing it. */
import { requireWorkspace } from "./configuration.js";

interface ConnectionDependencies {
  describe: () => Promise<{ writable: boolean }>;
  resolve: () => Promise<string | undefined>;
  readWorkspace: () => string | undefined;
  writeKey: (value: string) => Promise<void>;
  unsetKey: () => Promise<void>;
  writeWorkspace: (value: string) => Promise<void>;
  verify: (apiKey: string, workspaceId: string) => Promise<void>;
}

export async function saveConnection(
  input: { apiKey?: string; workspaceId?: string },
  deps: ConnectionDependencies,
): Promise<void> {
  const workspace = requireWorkspace(input.workspaceId);
  const replacement = input.apiKey?.trim();
  const previousKey = await deps.resolve();
  const key = replacement || previousKey;
  if (!key) throw new Error("API Key is required. / 请填写 API Key。");
  if (replacement && !(await deps.describe()).writable) {
    throw new Error(
      "The launch environment owns this API Key; update it there and restart dsh. / API Key 来自启动环境，请在启动环境中修改并重启 dsh。",
    );
  }
  let keyWritten = false;
  const previousWorkspace = deps.readWorkspace();
  let workspaceWritten = false;
  try {
    await deps.verify(key, workspace);
    if (replacement) {
      await deps.writeKey(replacement);
      keyWritten = true;
      if ((await deps.resolve()) !== replacement)
        throw new Error("The new API Key is not effective. / 新 API Key 未生效。");
    }
    workspaceWritten = true;
    await deps.writeWorkspace(workspace);
  } catch (error) {
    if (workspaceWritten) await deps.writeWorkspace(previousWorkspace ?? "").catch(() => undefined);
    if (keyWritten) {
      await (previousKey ? deps.writeKey(previousKey) : deps.unsetKey()).catch(() => undefined);
    }
    let message =
      error instanceof Error ? error.message : "Connection update failed. / 连接配置保存失败。";
    for (const secret of [key, previousKey])
      if (secret) message = message.split(secret).join("[redacted]");
    throw new Error(message);
  }
}

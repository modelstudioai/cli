import { homedir } from "os";
import {
  maskToken,
  type Settings,
  type ApiKeyCredential,
  type CommandOutput,
} from "bailian-cli-core";
import { isTerminal } from "./color.ts";

export function maybeShowStatusBar(
  settings: Settings,
  token: string,
  resolved: ApiKeyCredential,
  output: CommandOutput,
): void {
  if (!isTerminal(process.stderr)) return;
  const filePath = settings.configPath?.replace(homedir(), "~") ?? "~/.bailian/config.json";
  const maskedKey = maskToken(token);
  output.info({
    "en-US": `BAILIAN ${filePath} | Auth: ${maskedKey} ${resolved.source} · api-key`,
    "zh-CN": `BAILIAN ${filePath} | 鉴权：${maskedKey} ${resolved.source} · api-key`,
  });
}

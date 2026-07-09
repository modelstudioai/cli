import { homedir } from "os";
import { maskToken, type Settings, type ApiKeyCredential } from "bailian-cli-core";
import { ansi, isTerminal } from "./color.ts";

function tildePath(p: string): string {
  return p.startsWith(homedir()) ? p.replace(homedir(), "~") : p;
}

export function maybeShowStatusBar(
  settings: Settings,
  token: string,
  resolved: ApiKeyCredential,
): void {
  if (settings.quiet || !isTerminal(process.stderr)) return;

  const filePath = settings.configPath ? tildePath(settings.configPath) : "~/.bailian/config.json";
  const authTag = `${resolved.source} · api-key`;
  const maskedKey = maskToken(token);
  const color = ansi(process.stderr);

  process.stderr.write(
    `${color.brandBlue("BAILIAN")} ` +
      `${color.dim(filePath)} ` +
      `${color.dim("|")} ` +
      `${color.dim("Auth:")} ${color.keyPink(maskedKey)} ${color.dim(authTag)}\n`,
  );
}

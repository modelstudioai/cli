import { homedir } from "os";
import { maskToken, type Settings, type ApiKeyCredential } from "bailian-cli-core";

const reset = "\x1b[0m";
const dim = "\x1b[2m";
const bold = "\x1b[1m";
const mmBlue = "\x1b[38;2;43;82;255m";
const mmPink = "\x1b[38;2;236;72;153m";

function tildePath(p: string): string {
  return p.startsWith(homedir()) ? p.replace(homedir(), "~") : p;
}

export function maybeShowStatusBar(
  settings: Settings,
  token: string,
  resolved: ApiKeyCredential,
): void {
  if (settings.quiet || !process.stderr.isTTY) return;

  const filePath = settings.configPath ? tildePath(settings.configPath) : "~/.bailian/config.json";
  const authTag = `${resolved.source} · api-key`;
  const maskedKey = maskToken(token);

  process.stderr.write(
    `${bold}${mmBlue}BAILIAN${reset} ` +
      `${dim}${filePath}${reset} ` +
      `${dim}|${reset} ` +
      `${dim}Auth:${reset} ${mmPink}${maskedKey}${reset} ${dim}${authTag}${reset}\n`,
  );
}

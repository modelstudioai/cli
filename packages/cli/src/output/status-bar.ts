import { homedir } from "os";
import { maskToken, type Config, type ResolvedCredential } from "bailian-cli-core";

const reset = "\x1b[0m";
const dim = "\x1b[2m";
const bold = "\x1b[1m";
const mmBlue = "\x1b[38;2;43;82;255m";
const mmCyan = "\x1b[38;2;6;184;212m";
const mmPink = "\x1b[38;2;236;72;153m";

function tildePath(p: string): string {
  return p.startsWith(homedir()) ? p.replace(homedir(), "~") : p;
}

export function maybeShowStatusBar(config: Config, credential: ResolvedCredential): void {
  if (config.quiet || !process.stderr.isTTY) return;

  const filePath = config.configPath ? tildePath(config.configPath) : "~/.bailian/config.json";
  const regionSrc = config.fileRegion ? `${config.fileRegion} (file)` : "cn (default)";
  const keySrc = credential.source === "flag" ? "(flag)" : "(active)";
  const maskedKey = maskToken(credential.token);

  process.stderr.write(
    `${bold}${mmBlue}BAILIAN${reset} ` +
      `${dim}${filePath}${reset} ` +
      `${dim}|${reset} ` +
      `${dim}Region:${reset} ${mmCyan}${regionSrc}${reset} ` +
      `${dim}|${reset} ` +
      `${dim}Mode:${reset} ${mmCyan}${credential.mode}${reset} ` +
      `${dim}|${reset} ` +
      `${dim}Key:${reset} ${mmPink}${maskedKey}${reset} ${dim}${keySrc}${reset}\n`,
  );
}

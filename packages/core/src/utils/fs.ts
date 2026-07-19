import { readFileSync } from "fs";

const STDIN_FILE_DESCRIPTOR = 0;

export function readTextFromPathOrStdin(path: string): string {
  return readFileSync(path === "-" ? STDIN_FILE_DESCRIPTOR : path, "utf-8");
}

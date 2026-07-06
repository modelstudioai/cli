import { existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { Settings } from "../config/schema.ts";

const DEFAULT_OUTPUT_DIR = () => join(homedir(), "bailian-output");

/**
 * Resolve the output directory for generated files.
 *
 * Priority:
 * 1. User-specified dir (e.g. --out-dir flag)
 * 2. Config file output_dir
 * 3. Default: ~/bailian-output/
 *
 * Optionally appends a subdirectory (e.g. 'images', 'videos', 'speech').
 * Creates the directory if it doesn't exist.
 */
export function resolveOutputDir(
  settings: Settings,
  options?: { flagDir?: string; subDir?: string },
): string {
  const base = options?.flagDir || settings.outputDir || DEFAULT_OUTPUT_DIR();
  const dir = options?.subDir ? join(base, options.subDir) : base;

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  return dir;
}

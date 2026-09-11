import { randomUUID } from "node:crypto";
import { link, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { BailianError, ExitCode } from "bailian-cli-core";

export async function readInputFile(path: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(resolve(path)));
}

export async function readJsonInput(argument: string): Promise<unknown> {
  const source = argument.startsWith("@")
    ? await readFile(resolve(argument.slice(1)), "utf8")
    : argument;
  try {
    return JSON.parse(source) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new BailianError(`Invalid JSON input: ${message}`, ExitCode.USAGE);
  }
}

export async function writeOutputFile(
  outputPath: string,
  content: Uint8Array,
  force = false,
): Promise<string> {
  const destination = resolve(outputPath);
  const parent = dirname(destination);
  await mkdir(parent, { recursive: true });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await writeFile(temporary, content, { flag: "wx" });
  try {
    if (force) {
      await rename(temporary, destination);
    } else {
      try {
        await link(temporary, destination);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "EEXIST") {
          throw new BailianError(
            `Output file already exists: ${destination}`,
            ExitCode.USAGE,
            "Choose another --output-file path or re-run with --force.",
          );
        }
        throw error;
      }
      await unlink(temporary);
    }
    return destination;
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

export function inferMimeType(path: string): string {
  const filename = basename(path).toLocaleLowerCase();
  if (filename.endsWith(".json")) return "application/json";
  if (filename.endsWith(".md")) return "text/markdown";
  if (filename.endsWith(".txt")) return "text/plain";
  if (filename.endsWith(".pdf")) return "application/pdf";
  if (filename.endsWith(".png")) return "image/png";
  if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) return "image/jpeg";
  if (filename.endsWith(".zip")) return "application/zip";
  return "application/octet-stream";
}

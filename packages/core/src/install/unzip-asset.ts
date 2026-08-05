/**
 * Extract a single file entry from a ZIP into `destPath` (overwrites).
 * Uses yauzl (already a core dependency for dataset ZIP validation).
 */
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import * as yauzl from "yauzl";

function openZip(zipPath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (error, zipfile) => {
      if (error || !zipfile) {
        reject(error ?? new Error(`Failed to open zip: ${zipPath}`));
        return;
      }
      resolve(zipfile);
    });
  });
}

function entryBaseName(fileName: string): string {
  const normalized = fileName.replace(/\\/g, "/");
  return normalized.includes("/") ? normalized.slice(normalized.lastIndexOf("/") + 1) : normalized;
}

/**
 * Extract `entryName` (or the first non-directory entry) from `zipPath` to `destPath`.
 * Returns the archive entry basename that was extracted.
 */
export async function extractZipEntryToFile(
  zipPath: string,
  destPath: string,
  entryName?: string,
): Promise<string> {
  const zipfile = await openZip(zipPath);

  return new Promise((resolve, reject) => {
    let settled = false;

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      try {
        zipfile.close();
      } catch {
        /* ignore */
      }
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    const succeed = (baseName: string) => {
      if (settled) return;
      settled = true;
      try {
        zipfile.close();
      } catch {
        /* ignore */
      }
      resolve(baseName);
    };

    zipfile.on("error", fail);
    zipfile.on("end", () => {
      if (settled) return;
      fail(
        new Error(
          entryName
            ? `Zip entry not found: ${entryName} in ${zipPath}`
            : `Zip has no file entries: ${zipPath}`,
        ),
      );
    });

    zipfile.on("entry", (current: yauzl.Entry) => {
      if (settled) return;
      const name = current.fileName.replace(/\\/g, "/");
      if (name.endsWith("/")) {
        zipfile.readEntry();
        return;
      }
      const base = entryBaseName(name);
      const isMatch = entryName ? name === entryName || base === entryName : true;
      if (!isMatch) {
        zipfile.readEntry();
        return;
      }

      zipfile.openReadStream(current, (streamError, readStream) => {
        if (streamError || !readStream) {
          fail(streamError ?? new Error(`Failed to read zip entry: ${current.fileName}`));
          return;
        }
        void (async () => {
          try {
            await mkdir(dirname(destPath), { recursive: true });
            await pipeline(readStream, createWriteStream(destPath));
            succeed(base);
          } catch (error) {
            fail(error);
          }
        })();
      });
    });

    zipfile.readEntry();
  });
}

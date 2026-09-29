import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync } from "node:zlib";
import tar from "tar-stream";
import { expect, test } from "vite-plus/test";
import { installSkillFromBuffer } from "../src/skills/installer.ts";
import { validateSkillDir } from "../src/skills/validate.ts";

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../skills");

function collectFiles(directory: string, prefix = ""): Record<string, Buffer> {
  const files: Record<string, Buffer> = {};
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory())
      Object.assign(files, collectFiles(join(directory, entry.name), relative));
    else if (entry.isFile()) files[relative] = readFileSync(join(directory, entry.name));
    else throw new Error(`Unexpected non-regular skill asset: ${relative}`);
  }
  return files;
}

async function archive(files: Record<string, Buffer>): Promise<Buffer> {
  const pack = tar.pack();
  const chunks: Buffer[] = [];
  pack.on("data", (chunk: Buffer) => chunks.push(chunk));
  const complete = new Promise<void>((resolvePromise, reject) => {
    pack.on("end", resolvePromise);
    pack.on("error", reject);
  });
  for (const name of Object.keys(files).sort()) pack.entry({ name }, files[name]);
  pack.finalize();
  await complete;
  return brotliCompressSync(Buffer.concat(chunks));
}

test("actual knowledge and protocol archives install with all reference bytes intact", async () => {
  const configDirectory = mkdtempSync(join(tmpdir(), "knowledge-skill-install-"));
  const savedConfigDirectory = process.env.BAILIAN_CONFIG_DIR;
  process.env.BAILIAN_CONFIG_DIR = configDirectory;
  try {
    for (const name of ["bailian-protocol", "bailian-knowledge"]) {
      const files = collectFiles(join(skillRoot, name));
      if (name === "bailian-knowledge") {
        expect(Object.keys(files).sort()).toEqual([
          "SKILL.md",
          "reference/index.md",
          "reference/knowledge.md",
          "reference/kscli.md",
        ]);
      }
      await installSkillFromBuffer(name, await archive(files));
      const installed = join(configDirectory, "skills", name);
      expect(validateSkillDir(installed, name).name).toBe(name);
      expect(collectFiles(installed)).toEqual(files);
    }
  } finally {
    if (savedConfigDirectory === undefined) delete process.env.BAILIAN_CONFIG_DIR;
    else process.env.BAILIAN_CONFIG_DIR = savedConfigDirectory;
    rmSync(configDirectory, { recursive: true, force: true });
  }
});

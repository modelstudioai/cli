import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import type { PipelineDefinition } from "bailian-cli-runtime";

export async function loadPipelineFile(filePath: string): Promise<PipelineDefinition> {
  const raw = await readFile(filePath, "utf-8").catch((err: Error) => {
    process.stderr.write(`Error: cannot read pipeline file: ${err.message}\n`);
    process.exit(2);
  });
  const ext = extname(filePath).toLowerCase();
  let parsed: unknown;
  if (ext === ".yaml" || ext === ".yml") {
    const { parse: parseYaml } = await import("yaml");
    parsed = parseYaml(raw);
  } else {
    try {
      parsed = JSON.parse(raw);
    } catch {
      const { parse: parseYaml } = await import("yaml");
      parsed = parseYaml(raw);
    }
  }
  return parsed as PipelineDefinition;
}

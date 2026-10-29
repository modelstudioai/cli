import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";
import { knowledgeReferenceSchemas } from "./generate-knowledge-reference.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test.each([
  { filename: "packages/kscli/README.md", product: "kscli", minimum: 4 },
  { filename: "packages/kscli/README.zh.md", product: "kscli", minimum: 4 },
  { filename: "README.md", product: "bl", minimum: 1 },
  { filename: "README.zh.md", product: "bl", minimum: 1 },
] as const)(
  "$filename quick-start commands match the actual schema",
  ({ filename, product, minimum }) => {
    const readme = readFileSync(resolve(root, filename), "utf8");
    const section = readme.split(/## (?:Quick Start|快速开始)\n/)[1]?.split(/\n## /)[0];
    expect(section).toBeDefined();
    const schema = knowledgeReferenceSchemas()[product];
    const commands = [...section!.matchAll(/```bash\n([\s\S]*?)\n```/g)]
      .flatMap((match) => match[1].replace(/\\\n\s*/g, " ").split("\n"))
      .filter((line) => line.startsWith(`${product} `));
    expect(commands.length).toBeGreaterThanOrEqual(minimum);
    for (const line of commands) {
      const tokens = line.match(/"[^"]*"|'[^']*'|\S+/g)!.slice(1);
      if (tokens[0] === "--introspect") continue;
      const command = schema.commands.find((candidate) =>
        candidate.path.every((part, index) => tokens[index] === part),
      );
      expect(command, line).toBeDefined();
      if (!command) continue;
      const flags = {
        ...schema.globalFlags,
        ...schema.credentialFlags[command.auth],
        ...command.flags,
      };
      const supplied = new Set<string>();
      for (let offset = command.path.length; offset < tokens.length; offset++) {
        const name = tokens[offset];
        expect(flags[name], `${line}: unknown ${name}`).toBeDefined();
        const flag = flags[name];
        supplied.add(name);
        if (flag?.type !== "switch") {
          const value = tokens[++offset];
          expect(value, `${line}: missing value for ${name}`).toBeDefined();
          if (flag?.choices) expect(flag.choices).toContain(value);
        }
      }
      for (const [name, flag] of Object.entries(flags)) {
        if (flag.type !== "switch" && flag.required)
          expect(supplied.has(name), `${line}: required ${name}`).toBe(true);
      }
    }
  },
);

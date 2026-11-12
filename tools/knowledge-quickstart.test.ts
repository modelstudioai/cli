import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";
import { commands as blCommands } from "../packages/cli/src/commands.ts";
import { commands as kscliCommands } from "../packages/kscli/src/commands.ts";
import blPackage from "../packages/cli/package.json" with { type: "json" };
import kscliPackage from "../packages/kscli/package.json" with { type: "json" };
import { CommandRegistry } from "../packages/runtime/src/registry.ts";
import { buildCommandSchema, type CommandSchema } from "../packages/runtime/src/introspect.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// README Quick Start sections can mix domains. Reference generation intentionally
// scopes bl to knowledge, but these examples need each product's complete map.
// Build metadata only, once: no CLI execution, credentials, or subprocesses.
const schemas = {
  bl: buildCommandSchema(new CommandRegistry(blCommands, "bl"), {
    binName: "bl",
    version: blPackage.version,
    npmPackage: blPackage.name,
    clientName: blPackage.name,
  }),
  kscli: buildCommandSchema(new CommandRegistry(kscliCommands, "kscli"), {
    binName: "kscli",
    version: kscliPackage.version,
    npmPackage: kscliPackage.name,
    clientName: kscliPackage.name,
  }),
};

function expectCommandMatchesSchema(line: string, schema: CommandSchema) {
  const tokens = line.match(/"[^"]*"|'[^']*'|\S+/g)!.slice(1);
  if (tokens[0] === "--introspect") return;
  const command = schema.commands.find((candidate) =>
    candidate.path.every((part, index) => tokens[index] === part),
  );
  expect(command, line).toBeDefined();
  if (!command) return;
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
    const schema = schemas[product];
    const commands = [...section!.matchAll(/```bash\n([\s\S]*?)\n```/g)]
      .flatMap((match) => match[1].replace(/\\\n\s*/g, " ").split("\n"))
      .filter((line) => line.startsWith(`${product} `));
    expect(commands.length).toBeGreaterThanOrEqual(minimum);
    // Other domains must not hide an accidentally removed knowledge quick start.
    if (product === "bl")
      expect(
        commands.some((line) => line.startsWith("bl knowledge ")),
        filename,
      ).toBe(true);
    for (const line of commands) expectCommandMatchesSchema(line, schema);
  },
);

test.each([
  "bl knowledge init --workspace-id <workspace-id> --dry-run",
  "bl dataset groups --page 1 --page-size 10 --output json",
  "bl dataset version --dataset-group-id <group-id> --output json",
  "bl dataset version --dataset-id <version-id> --include-status --output json",
  "bl file url --file-key <file-key> --output json",
  "bl deploy instances --page 1 --page-size 10 --output json",
])("mixed-domain bl quick starts remain checked: %s", (line) => {
  expect(schemas.bl.scope).toEqual([]);
  expect(() => expectCommandMatchesSchema(line, schemas.bl)).not.toThrow();
});

test.each([
  { product: "bl", line: "bl knowledge unknown-command" },
  { product: "bl", line: "bl knowledge init --workspace-id <id> --unknown-flag" },
  { product: "bl", line: "bl dataset unknown-command" },
  { product: "bl", line: "bl dataset groups --unknown-flag" },
  { product: "bl", line: "bl dataset groups --page-size" },
  { product: "bl", line: "bl file url" },
  { product: "kscli", line: "kscli dataset groups" },
  { product: "kscli", line: "kscli init --workspace-id <id> --unknown-flag" },
] as const)("invalid examples must not be silently skipped: $line", ({ product, line }) => {
  expect(() => expectCommandMatchesSchema(line, schemas[product])).toThrow();
});

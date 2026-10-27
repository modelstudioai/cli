import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync } from "node:zlib";
import tar from "tar-stream";
import { expect, test } from "vite-plus/test";
import { runNodeMain } from "e2e/runner";
import { knowledgeReferenceSchemas } from "../../../../tools/generate-knowledge-reference.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

test.each([
  { product: "cli", schema: "bl", args: ["knowledge", "--introspect"] },
  { product: "kscli", schema: "kscli", args: ["--introspect"] },
] as const)(
  "$product introspection equals the schema used by its generated reference",
  async ({ product, schema, args }) => {
    const directory = await mkdtemp(join(tmpdir(), "knowledge-reference-cli-"));
    try {
      const result = await runNodeMain(join(root, "packages", product, "src/main.ts"), [...args], {
        cwd: directory,
        env: { BAILIAN_CONFIG_DIR: join(directory, "config"), DASHSCOPE_API_KEY: "" },
      });
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toEqual(knowledgeReferenceSchemas()[schema]);
      expect(await readdir(directory)).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

async function skillFiles(directory: string, prefix = ""): Promise<Record<string, Buffer>> {
  const files: Record<string, Buffer> = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory())
      Object.assign(files, await skillFiles(join(directory, entry.name), relative));
    else if (entry.isFile()) files[relative] = await readFile(join(directory, entry.name));
    else throw new Error(`Unexpected skill asset: ${relative}`);
  }
  return files;
}

async function packageSkill(files: Record<string, Buffer>) {
  const pack = tar.pack();
  const chunks: Buffer[] = [];
  const hash = createHash("sha256");
  pack.on("data", (chunk: Buffer) => chunks.push(chunk));
  const completion = new Promise<void>((resolvePromise, reject) => {
    pack.on("end", resolvePromise);
    pack.on("error", reject);
  });
  for (const name of Object.keys(files).sort()) {
    hash.update(name).update(files[name]);
    pack.entry({ name }, files[name]);
  }
  pack.finalize();
  await completion;
  return {
    contentHash: `sha256:${hash.digest("hex")}`,
    body: brotliCompressSync(Buffer.concat(chunks)),
  };
}

test("local registry delivers knowledge through init and subset add; update stays within installed skills", async () => {
  const directory = await mkdtemp(join(tmpdir(), "knowledge-registry-e2e-"));
  const resources = new Map<string, Buffer>();
  const requests: string[] = [];
  const entries: Record<string, { contentHash: string; compression: string }> = {};
  const server = createServer((request, response) => {
    const path = request.url ?? "/";
    requests.push(path);
    const body = resources.get(path);
    response.writeHead(body ? 200 : 404);
    response.end(body ?? "missing");
  });
  try {
    for (const name of ["bailian-protocol", "bailian-knowledge", "unrelated-skill"]) {
      const files =
        name === "unrelated-skill"
          ? { "SKILL.md": Buffer.from("---\nname: unrelated-skill\ndescription: test only\n---\n") }
          : await skillFiles(join(root, "skills", name));
      const asset = await packageSkill(files);
      entries[name] = { contentHash: asset.contentHash, compression: "tar.br" };
      resources.set(`/${name}/skill.tar.br`, asset.body);
    }
    resources.set("/index.json", Buffer.from(JSON.stringify({ skills: entries })));
    await new Promise<void>((resolvePromise, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolvePromise);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing registry address");
    const run = async (environment: string, args: string[]) => {
      const home = join(directory, environment);
      await mkdir(home, { recursive: true });
      const isolated: NodeJS.ProcessEnv = {
        HOME: home,
        USERPROFILE: home,
        BAILIAN_CONFIG_DIR: join(home, "config"),
        BAILIAN_SKILL_REGISTRY_URL: `http://127.0.0.1:${address.port}`,
      };
      for (const name of [
        "CODEX_HOME",
        "XDG_CONFIG_HOME",
        "APPDATA",
        "FLATPAK_XDG_CONFIG_HOME",
        "AUTOHAND_HOME",
        "CLAUDE_CONFIG_DIR",
        "DSH_HOME",
        "GROK_HOME",
        "HERMES_HOME",
        "VIBE_HOME",
      ]) {
        isolated[name] = join(home, name.toLowerCase());
      }
      const result = await runNodeMain(
        join(root, "packages/cli/src/main.ts"),
        ["skill", ...args, "--output", "json", "--quiet"],
        { cwd: home, env: isolated },
      );
      expect(result.exitCode, result.stderr + result.stdout).toBe(0);
      return JSON.parse(result.stdout);
    };
    const initialized = await run("init", ["init"]);
    expect(initialized.skills.sort()).toEqual(["bailian-knowledge", "bailian-protocol"]);
    await run("subset", ["add", "--name", "bailian-protocol"]);
    const beforeUpdate = requests.length;
    await run("subset", ["update"]);
    expect(requests.slice(beforeUpdate)).toEqual(["/index.json"]);
    const updatedFiles = await skillFiles(join(root, "skills/bailian-protocol"));
    updatedFiles["revision.txt"] = Buffer.from("local registry updated revision\n");
    const updatedAsset = await packageSkill(updatedFiles);
    entries["bailian-protocol"] = { contentHash: updatedAsset.contentHash, compression: "tar.br" };
    resources.set("/bailian-protocol/skill.tar.br", updatedAsset.body);
    resources.set("/index.json", Buffer.from(JSON.stringify({ skills: entries })));
    const beforeChangedUpdate = requests.length;
    await run("subset", ["update"]);
    expect(requests.slice(beforeChangedUpdate)).toEqual([
      "/index.json",
      "/bailian-protocol/skill.tar.br",
    ]);
    expect(await skillFiles(join(directory, "subset/config/skills/bailian-protocol"))).toEqual(
      updatedFiles,
    );
    expect((await readdir(join(directory, "subset/config/skills"))).sort()).toEqual([
      "bailian-protocol",
      "skill-lock.json",
    ]);
    await run("subset", ["add", "--name", "bailian-protocol,bailian-knowledge"]);
    for (const environment of ["init", "subset"]) {
      const installed = join(directory, environment, "config/skills/bailian-knowledge");
      expect(await skillFiles(installed)).toEqual(
        await skillFiles(join(root, "skills/bailian-knowledge")),
      );
      const lock = JSON.parse(
        await readFile(join(directory, environment, "config/skills/skill-lock.json"), "utf8"),
      );
      expect(Object.keys(lock.skills).sort()).toEqual(["bailian-knowledge", "bailian-protocol"]);
    }
    expect(requests).not.toContain("/unrelated-skill/skill.tar.br");
  } finally {
    server.closeAllConnections();
    if (server.listening)
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);

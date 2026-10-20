import { afterEach, expect, test } from "vite-plus/test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const fixtures = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

// Run real release entry scripts in an isolated repository, replacing only
// external build/publish operations. No test can publish npm or push git tags.
function setup() {
  const root = mkdtempSync(join(tmpdir(), "publish-test-"));
  fixtures.push(root);
  cpSync(new URL("./", import.meta.url), join(root, "tools/release"), { recursive: true });
  const write = (path, content) => writeFileSync(join(root, "tools/release", path), content);
  write(
    "lib/git.mjs",
    `
    export const headSha7 = () => 'abcdef0';
    export const utcDateStamp = () => '202610190900';
    export const currentBranch = () => 'main';
    export const isWorkingTreeClean = () => true;
    export const tagExists = () => false;
    export const createTag = (tag) => console.log('CREATE_TAG', tag);
    export const pushTag = (tag) => console.log('PUSH_TAG', tag);
  `,
  );
  write(
    "lib/npm.mjs",
    `
    import { readFileSync } from "node:fs";
    export const npmViewExists = () => process.env.TEST_PUBLISHED === 'yes';
    export const pnpmPublish = (pkg) => {
      const version = JSON.parse(readFileSync(new URL('../../../' + pkg.dir + '/package.json', import.meta.url))).version;
      console.log('NPM_PUBLISH', pkg.name, version);
    };
    export const pnpmPack = () => { throw new Error('unexpected pack'); };
  `,
  );
  write("lib/proc.mjs", `export const run = () => {};`);
  write(
    "check.mjs",
    `import { ALL_PACKAGES } from './lib/packages.mjs';
    import { loadAndValidatePackages } from './lib/validate.mjs';
    export async function runCheck() { return loadAndValidatePackages({ packages: ALL_PACKAGES }); }`,
  );
  write(
    "lib/binary-release.mjs",
    `export async function releaseBinaryArtifacts() {
    if (process.env.TEST_BINARY_FAIL) throw new Error('binary failed');
    console.log('BINARY');
  }`,
  );
  for (const directory of [
    "core",
    "runtime",
    "commands",
    "cli",
    "kscli",
    "bailian-kb-dsh",
    "bailian-memo-dsh",
  ]) {
    mkdirSync(join(root, "packages", directory), { recursive: true });
    writeFileSync(
      join(root, "packages", directory, "package.json"),
      JSON.stringify({
        name: directory.startsWith("bailian-")
          ? directory
          : directory === "kscli"
            ? "knowledge-studio-cli"
            : directory === "cli"
              ? "bailian-cli"
              : `bailian-cli-${directory}`,
        version: "1.2.0",
      }),
    );
  }
  const run = (script, args = [], env = {}) =>
    spawnSync(process.execPath, [join(root, "tools/release", script), ...args], {
      encoding: "utf8",
      env: { PATH: process.env.PATH, CI: "true", ...env },
      cwd: root,
    });
  return { root, run };
}

test.each(["stable", "channel"])(
  "%s includes all seven packages with one version and publishes binaries first",
  (mode) => {
    const fixture = setup();
    const result = fixture.run(
      `publish-${mode}.mjs`,
      mode === "channel" ? ["--channel", "mcp"] : [],
    );
    expect(result.status, result.stderr).toBe(0);
    const published = result.stdout.split("\n").filter((line) => line.startsWith("NPM_PUBLISH"));
    const version = mode === "channel" ? "0.0.0-beta-abcdef0-202610190900" : "1.2.0";
    expect(published).toEqual(
      [
        "NPM_PUBLISH bailian-cli-core",
        "NPM_PUBLISH bailian-cli-runtime",
        "NPM_PUBLISH bailian-cli-commands",
        "NPM_PUBLISH bailian-cli",
        "NPM_PUBLISH knowledge-studio-cli",
        "NPM_PUBLISH bailian-kb-dsh",
        "NPM_PUBLISH bailian-memo-dsh",
      ].map((line) => `${line} ${version}`),
    );
    expect(result.stdout.indexOf("BINARY")).toBeLessThan(result.stdout.indexOf("NPM_PUBLISH"));
    expect(
      JSON.parse(readFileSync(join(fixture.root, "packages/kscli/package.json"))).version,
    ).toBe("1.2.0");
  },
);

test("a plugin version mismatch fails before any release writes", () => {
  const fixture = setup();
  const path = join(fixture.root, "packages/bailian-memo-dsh/package.json");
  const json = JSON.parse(readFileSync(path));
  json.version = "0.1.0";
  writeFileSync(path, JSON.stringify(json));
  const result = fixture.run("publish-stable.mjs");
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("all package versions must match");
  expect(result.stdout).not.toMatch(/BINARY|NPM_PUBLISH|CREATE_TAG|PUSH_TAG/);
});

test("binary failure prevents npm publication and restores all seven channel versions", () => {
  const fixture = setup();
  const result = fixture.run("publish-channel.mjs", ["--channel", "mcp"], {
    TEST_BINARY_FAIL: "yes",
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("binary failed");
  expect(result.stdout).not.toContain("NPM_PUBLISH");
  for (const directory of [
    "core",
    "runtime",
    "commands",
    "cli",
    "kscli",
    "bailian-kb-dsh",
    "bailian-memo-dsh",
  ]) {
    expect(
      JSON.parse(readFileSync(join(fixture.root, "packages", directory, "package.json"))).version,
    ).toBe("1.2.0");
  }
});

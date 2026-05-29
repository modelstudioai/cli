import { mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, relative, resolve } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_REGISTRY = "https://registry.npmjs.org/";
const PACKAGES = [
  { key: "core", dir: "packages/core", name: "bailian-cli-core" },
  { key: "cli", dir: "packages/cli", name: "bailian-cli" },
];

function log(message = "") {
  process.stdout.write(`${message}\n`);
}

function step(message) {
  log(`\n==> ${message}`);
}

function fail(message) {
  throw new Error(message);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    stdio: options.stdio ?? "inherit",
    encoding: "utf-8",
  });

  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim();
    fail(`${command} ${args.join(" ")} failed${detail ? `\n${detail}` : ""}`);
  }

  return result.stdout ?? "";
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function packageJson(pkg) {
  return readJson(join(ROOT, pkg.dir, "package.json"));
}

function tarballName(name, version) {
  return `${name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`;
}

/**
 * Map semver version to npm dist-tag.
 *   1.0.0          → latest
 *   1.0.0-beta.0   → beta
 *   1.0.0-rc.1     → rc
 *   1.0.0-alpha.2  → alpha
 *   1.0.0-next.5   → next
 * Avoids accidentally tagging prereleases as latest.
 */
function deriveDistTag(version) {
  const m = /-([a-z]+)\b/i.exec(version);
  return m ? m[1].toLowerCase() : "latest";
}

function walkFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function assertPublishConfig(pkg, json) {
  const registry = json.publishConfig?.registry;
  if (registry !== PUBLIC_REGISTRY) {
    fail(`${pkg.name} publishConfig.registry must be ${PUBLIC_REGISTRY}, got ${registry}`);
  }
}

function packPackage(pkg, tempDir) {
  const json = packageJson(pkg);
  const name = json.name;
  const version = json.version;

  run("pnpm", ["--filter", name, "pack", "--pack-destination", tempDir]);

  const tarball = join(tempDir, tarballName(name, version));
  statSync(tarball);
  return { pkg, json, tarball };
}

function extractTarball(tarball, tempDir, label) {
  const extractDir = join(tempDir, `extract-${label}`);
  run("tar", ["-xzf", tarball, "-C", tempDir], { stdio: "pipe" });
  const packageDir = join(tempDir, "package");
  renameSync(packageDir, extractDir);
  return extractDir;
}

function looksText(buffer) {
  if (buffer.includes(0)) return false;
  const sample = buffer.subarray(0, 4096).toString("utf-8");
  return !sample.includes("\uFFFD");
}

function scanPackageContents(label, extractDir) {
  const denyPathPatterns = [
    /(^|\/)\.env($|\.)/,
    /(^|\/)\.npmrc$/,
    /(^|\/)\.yarnrc$/,
    /(^|\/)\.pnpmfile\.cjs$/,
    /(^|\/)\.DS_Store$/,
    /(^|\/)npm-debug\.log$/,
    /(^|\/)yarn-error\.log$/,
    /\.(map|pem|key|crt|p12|pfx|log)$/i,
    /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  ];
  const secretPatterns = [
    { name: "DashScope API key", re: /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{18,}\b/g },
    { name: "Alibaba Cloud access key id", re: /\bLTAI[A-Za-z0-9]{12,}\b/g },
    {
      name: "access key secret assignment",
      re: /\b(?:access[_-]?key[_-]?secret|aliyun[_-]?access[_-]?key[_-]?secret|alibaba[_-]?cloud[_-]?access[_-]?key[_-]?secret)\b\s*[:=]\s*["'][^"']{12,}["']/gi,
    },
  ];

  const files = walkFiles(extractDir);
  for (const file of files) {
    const rel = relative(extractDir, file).replaceAll("\\", "/");
    if (denyPathPatterns.some((pattern) => pattern.test(rel))) {
      fail(`${label} contains blocked file: ${rel}`);
    }

    const size = statSync(file).size;
    if (size > 2 * 1024 * 1024) continue;

    const buffer = readFileSync(file);
    if (!looksText(buffer)) continue;

    const text = buffer.toString("utf-8");
    for (const pattern of secretPatterns) {
      pattern.re.lastIndex = 0;
      if (pattern.re.test(text)) {
        fail(`${label} may contain ${pattern.name}: ${rel}`);
      }
    }
  }
}

function assertCliPackage(cliExtractDir, coreJson) {
  const json = readJson(join(cliExtractDir, "package.json"));
  const deps = json.dependencies ?? {};

  if (deps["bailian-cli-core"] !== coreJson.version) {
    fail(`CLI tarball must depend on bailian-cli-core@${coreJson.version}.`);
  }

  if (JSON.stringify(json).includes("workspace:")) {
    fail("CLI tarball package.json still contains workspace: dependency.");
  }

  const binPath = json.bin?.bl;
  if (binPath !== "dist/bailian.mjs") {
    fail(`CLI bin.bl must be dist/bailian.mjs, got ${binPath}`);
  }

  const bin = readFileSync(join(cliExtractDir, binPath), "utf-8");
  if (!bin.startsWith("#!/usr/bin/env node\n")) {
    fail("CLI bin is missing #!/usr/bin/env node shebang.");
  }

  if (!bin.includes('from"bailian-cli-core"') && !bin.includes('from "bailian-cli-core"')) {
    fail("CLI bundle does not appear to import bailian-cli-core as an external package.");
  }
}

function assertCorePackage(coreExtractDir) {
  for (const file of ["dist/index.mjs", "dist/index.d.mts"]) {
    statSync(join(coreExtractDir, file));
  }
}

function assertReadmeSync() {
  step("Checking README sync between root and packages/cli");
  for (const file of ["README.md", "README_CN.md"]) {
    const rootPath = join(ROOT, file);
    const cliPath = join(ROOT, "packages/cli", file);
    const rootBuf = readFileSync(rootPath);
    const cliBuf = readFileSync(cliPath);
    if (!rootBuf.equals(cliBuf)) {
      fail(
        `${file} differs between root and packages/cli. ` +
          `Sync them manually (e.g. \`cp ${file} packages/cli/${file}\`).`,
      );
    }
    log(`${file}: in sync`);
  }
}

function validatePackages() {
  const jsonByKey = new Map();

  assertReadmeSync();

  step("Checking package metadata");
  for (const pkg of PACKAGES) {
    const json = packageJson(pkg);
    if (json.name !== pkg.name) fail(`${pkg.dir} name must be ${pkg.name}`);
    assertPublishConfig(pkg, json);
    jsonByKey.set(pkg.key, json);
    log(`${json.name}@${json.version}`);
  }

  const coreJson = jsonByKey.get("core");
  const cliJson = jsonByKey.get("cli");
  if (cliJson.version !== coreJson.version) {
    fail(`CLI and core versions should match, got ${cliJson.version} and ${coreJson.version}.`);
  }

  const cliCoreDep = cliJson.dependencies?.["bailian-cli-core"];
  if (cliCoreDep !== "workspace:*") {
    fail(`CLI source dependency should be "bailian-cli-core": "workspace:*", got ${cliCoreDep}`);
  }

  return { coreJson, cliJson };
}

function packAndScan(coreJson) {
  const tempDir = mkdtempSync(join(tmpdir(), "bailian-release-"));
  try {
    step("Packing and scanning npm tarballs");

    const packed = PACKAGES.map((pkg) => packPackage(pkg, tempDir));
    const extracted = new Map();

    for (const item of packed) {
      const extractDir = extractTarball(item.tarball, tempDir, item.pkg.key);
      extracted.set(item.pkg.key, extractDir);
      scanPackageContents(item.json.name, extractDir);
      log(`${item.json.name}: ok`);
    }

    assertCorePackage(extracted.get("core"));
    assertCliPackage(extracted.get("cli"), coreJson);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function buildPackages() {
  run("pnpm", ["--filter", "bailian-cli-core", "run", "build"]);
  run("pnpm", ["--filter", "bailian-cli", "run", "build"]);
}

async function releaseCheck() {
  const { coreJson } = validatePackages();

  step("Installing dependencies with frozen lockfile");
  run("pnpm", ["install", "--frozen-lockfile"]);

  step("Building packages");
  buildPackages();

  step("Running format, lint, and type checks");
  run("pnpm", ["run", "check"]);

  packAndScan(coreJson);

  log("\nRelease check passed.");
}

function npmWhoami() {
  const result = spawnSync("npm", ["whoami", `--registry=${PUBLIC_REGISTRY}`], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
  });
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

function ensureNpmLogin() {
  step("Checking npm login");

  let user = npmWhoami();
  if (user) {
    log(`Logged in as ${user}`);
    return;
  }

  log(`Not logged in to ${PUBLIC_REGISTRY}. Launching npm login...`);
  const login = spawnSync("npm", ["login", `--registry=${PUBLIC_REGISTRY}`], {
    cwd: ROOT,
    stdio: "inherit",
  });
  if (login.status !== 0) fail("npm login failed.");

  user = npmWhoami();
  if (!user) fail("npm login required before publishing.");
  log(`Logged in as ${user}`);
}

async function confirmPublish(coreJson, cliJson) {
  log("");
  log(`About to publish ${coreJson.name}@${coreJson.version}`);
  log(`Then publish      ${cliJson.name}@${cliJson.version}`);
  log(`Registry:          ${PUBLIC_REGISTRY}`);

  const rl = createInterface({ input, output });
  const answer = await rl.question("\nType 'publish' to continue: ");
  rl.close();

  if (answer !== "publish") fail("Publish aborted.");
}

async function releasePublish() {
  const { coreJson, cliJson } = validatePackages();

  step("Building packages");
  buildPackages();

  packAndScan(coreJson);

  await confirmPublish(coreJson, cliJson);

  ensureNpmLogin();

  // Derive dist-tag from version: 1.0.0 → latest, 1.0.0-beta.0 → beta, 1.0.0-rc.1 → rc
  const distTag = deriveDistTag(coreJson.version);
  log(`Publishing under dist-tag: ${distTag}`);

  step(`Publishing ${coreJson.name}`);
  run("pnpm", [
    "--filter",
    coreJson.name,
    "publish",
    `--registry=${PUBLIC_REGISTRY}`,
    `--tag=${distTag}`,
    "--no-git-checks",
  ]);

  step(`Publishing ${cliJson.name}`);
  run("pnpm", [
    "--filter",
    cliJson.name,
    "publish",
    `--registry=${PUBLIC_REGISTRY}`,
    `--tag=${distTag}`,
    "--no-git-checks",
  ]);

  log("\nPublish complete.");
}

const command = process.argv[2];

try {
  if (command === "check") await releaseCheck();
  else if (command === "publish") await releasePublish();
  else fail("Usage: node tools/release.mjs <check|publish>");
} catch (error) {
  process.stderr.write(`\nRelease failed: ${error.message}\n`);
  process.exit(1);
}

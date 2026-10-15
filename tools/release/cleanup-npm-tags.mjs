import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const REGISTRY = "https://registry.npmjs.org";
const PACKAGE_INPUTS = [
  ["CLEANUP_CLI", "bailian-cli"],
  ["CLEANUP_CORE", "bailian-cli-core"],
  ["CLEANUP_RUNTIME", "bailian-cli-runtime"],
  ["CLEANUP_COMMANDS", "bailian-cli-commands"],
  ["CLEANUP_KSCLI", "knowledge-studio-cli"],
  ["CLEANUP_DSH", "bailian-kb-dsh"],
];

function booleanInput(environment, name) {
  const value = environment[name] ?? "true";
  if (value !== "true" && value !== "false") throw new Error(`${name} must be true or false`);
  return value === "true";
}

function validateSelection({ packages, tags, dryRun }) {
  const allowedPackages = new Set(PACKAGE_INPUTS.map(([, packageName]) => packageName));
  if (!packages.length || packages.some((packageName) => !allowedPackages.has(packageName)))
    throw new Error("Select at least one supported package");
  if (!tags.length) throw new Error("Enter at least one tag");
  for (const tag of tags) {
    if (tag === "latest") throw new Error("Deleting latest is forbidden");
    if (!/^[a-z][a-z0-9-]*$/.test(tag)) throw new Error(`Invalid tag: ${tag}`);
  }
  if (typeof dryRun !== "boolean") throw new Error("dryRun must be a boolean");
}

export function parseCleanupInputs(environment = process.env) {
  const selection = {
    packages: PACKAGE_INPUTS.filter(([input]) => booleanInput(environment, input)).map(
      ([, packageName]) => packageName,
    ),
    tags: [...new Set((environment.CLEANUP_TAGS ?? "").split(/[\s,]+/).filter(Boolean))],
    dryRun: booleanInput(environment, "CLEANUP_DRY_RUN"),
  };
  validateSelection(selection);
  return selection;
}

async function readRegistryTags(packageName) {
  const response = await fetch(`${REGISTRY}/-/package/${packageName}/dist-tags`, {
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Cannot read ${packageName} tags: HTTP ${response.status}`);
  const tags = await response.json();
  if (
    !tags ||
    typeof tags !== "object" ||
    Array.isArray(tags) ||
    Object.values(tags).some((version) => typeof version !== "string")
  )
    throw new Error(`Invalid registry tag response for ${packageName}`);
  return tags;
}

function removeRegistryTag(packageName, tag) {
  // npm >=11.21 exchanges the workflow's OIDC identity; no long-lived token is supplied.
  return new Promise((resolve, reject) => {
    const child = spawn("npm", ["dist-tag", "rm", packageName, tag, "--registry", REGISTRY], {
      stdio: "inherit",
      shell: false,
      timeout: 60_000,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`npm dist-tag rm ${packageName} ${tag} failed (${code ?? signal})`));
    });
  });
}

function reportEntry({ packageName, tag, version, status }) {
  const message = `${status}: ${packageName} / ${tag} / ${version ?? "not present"}`;
  console.log(message);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ${message}\n`);
}

export async function cleanupNpmTags(
  selection,
  { readTags = readRegistryTags, removeTag = removeRegistryTag, report = reportEntry } = {},
) {
  validateSelection(selection);
  const { packages, tags, dryRun } = selection;
  const plan = [];
  // Read every selected package before any deletion; request failures are not "tag absent".
  for (const packageName of packages) {
    const currentTags = await readTags(packageName);
    for (const tag of tags)
      plan.push({
        packageName,
        tag,
        version: Object.hasOwn(currentTags, tag) ? currentTags[tag] : null,
      });
  }

  const results = [];
  for (const entry of plan) {
    let status = entry.version === null ? "absent" : "preview";
    if (entry.version !== null && !dryRun) {
      const currentTags = await readTags(entry.packageName);
      if (!Object.hasOwn(currentTags, entry.tag)) {
        status = "absent";
      } else {
        if (currentTags[entry.tag] !== entry.version)
          throw new Error(`Tag changed since preflight: ${entry.packageName} / ${entry.tag}`);
        await removeTag(entry.packageName, entry.tag);
        const afterTags = await readTags(entry.packageName);
        if (Object.hasOwn(afterTags, entry.tag))
          throw new Error(`Tag still exists after deletion: ${entry.packageName} / ${entry.tag}`);
        status = "deleted";
      }
    }
    const result = { ...entry, status };
    results.push(result);
    report(result);
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const selection = parseCleanupInputs();
    console.log(
      selection.dryRun ? "Preview only; no tags will be deleted." : "Deleting selected tags.",
    );
    await cleanupNpmTags(selection);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

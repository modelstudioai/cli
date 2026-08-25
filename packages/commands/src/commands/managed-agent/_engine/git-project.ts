import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { promisify } from "node:util";
import { BailianError, ExitCode } from "bailian-cli-core";

const execFileAsync = promisify(execFile);

const REPOSITORY_GITIGNORE = `# Dependencies
node_modules/

# Bailian CLI local runs
.openagentpack/state/
.openagentpack/runs/

# Local credentials
.env
.env.*
!.env.example
`;

const REPOSITORY_GITIGNORE_PATTERNS = [
  "node_modules/",
  ".openagentpack/state/",
  ".openagentpack/runs/",
  ".env",
  ".env.*",
  "!.env.example",
] as const;

const PROJECT_SCRIPTS = {
  "agents:validate": "bl managed-agent validate --file agents.yaml",
  "agents:plan": "bl managed-agent plan --file agents.yaml",
  "agents:plan:ci": "bl managed-agent plan --file agents.yaml --output json",
  "agents:apply:ci": "bl managed-agent apply --file agents.yaml --ci",
  "agents:workbench": "bl managed-agent workbench --file agents.yaml",
} as const;

const INITIAL_STATE = `${JSON.stringify({ resources: [] }, null, 2)}\n`;

export interface GitProjectResult {
  targetDirectory: string;
  mode: "created" | "upgraded";
  initializedGit: boolean;
  createdFiles: string[];
  updatedFiles: string[];
  preservedFiles: string[];
}

interface CreateGitProjectOptions {
  config: string;
  cliVersion: string;
}

type ProjectTargetMode = "new" | "existing";

export async function inspectGitProjectTarget(targetDirectory: string): Promise<ProjectTargetMode> {
  if (!existsSync(targetDirectory)) return "new";
  const targetStat = await stat(targetDirectory);
  if (!targetStat.isDirectory()) {
    throw new BailianError(`Target '${targetDirectory}' is not a directory.`, ExitCode.USAGE);
  }
  const entries = await readdir(targetDirectory);
  if (entries.length === 0) return "new";
  if (existsSync(resolve(targetDirectory, "agents.yaml"))) return "existing";
  throw new BailianError(
    `Target directory '${targetDirectory}' is not empty and does not contain agents.yaml.`,
    ExitCode.USAGE,
  );
}

export async function createGitProject(
  directory: string,
  options: CreateGitProjectOptions,
): Promise<GitProjectResult> {
  const targetDirectory = resolve(directory);
  const targetMode = await inspectGitProjectTarget(targetDirectory);
  const shouldInitializeGit = !existsSync(resolve(targetDirectory, ".git"));
  if (shouldInitializeGit) await assertGitAvailable();

  const createdFiles: string[] = [];
  const updatedFiles: string[] = [];
  const preservedFiles: string[] = [];
  await mkdir(resolve(targetDirectory, ".aoneci"), { recursive: true });

  const config =
    targetMode === "new"
      ? options.config
      : await readFile(resolve(targetDirectory, "agents.yaml"), "utf8");
  if (targetMode === "new") {
    await writeFile(resolve(targetDirectory, "agents.yaml"), config, "utf8");
    createdFiles.push("agents.yaml");
  } else {
    preservedFiles.push("agents.yaml");
  }

  await mergeOrCreateTextFile(
    resolve(targetDirectory, ".gitignore"),
    REPOSITORY_GITIGNORE,
    mergeGitignore,
    ".gitignore",
    createdFiles,
    updatedFiles,
  );
  await mergeOrCreateTextFile(
    resolve(targetDirectory, ".env.example"),
    environmentExample(config),
    (current) => mergeEnvironmentExample(current, config),
    ".env.example",
    createdFiles,
    updatedFiles,
  );

  const packagePath = resolve(targetDirectory, "package.json");
  if (existsSync(packagePath)) {
    const current = await readFile(packagePath, "utf8");
    const merged = mergePackageJson(current, basename(targetDirectory), options.cliVersion);
    if (merged.content !== current) {
      await writeFile(packagePath, merged.content, "utf8");
      updatedFiles.push("package.json");
    }
    preservedFiles.push(...merged.preservedSettings);
  } else {
    await writeFile(
      packagePath,
      buildPackageJson(basename(targetDirectory), options.cliVersion),
      "utf8",
    );
    createdFiles.push("package.json");
  }

  await createIfMissing(
    resolve(targetDirectory, "agents.state.json"),
    INITIAL_STATE,
    "agents.state.json",
    createdFiles,
    preservedFiles,
  );
  await createIfMissing(
    resolve(targetDirectory, ".aoneci/bailian-cli.yml"),
    buildAoneWorkflow(config),
    ".aoneci/bailian-cli.yml",
    createdFiles,
    preservedFiles,
  );
  await createIfMissing(
    resolve(targetDirectory, ".aoneci/bailian-cli-check.yml"),
    buildAoneCheckWorkflow(config),
    ".aoneci/bailian-cli-check.yml",
    createdFiles,
    preservedFiles,
  );
  await createIfMissing(
    resolve(targetDirectory, "README.md"),
    buildReadme(basename(targetDirectory), config),
    "README.md",
    createdFiles,
    preservedFiles,
  );

  if (shouldInitializeGit) await initializeGitRepository(targetDirectory);
  return {
    targetDirectory,
    mode: targetMode === "new" ? "created" : "upgraded",
    initializedGit: shouldInitializeGit,
    createdFiles,
    updatedFiles,
    preservedFiles,
  };
}

async function assertGitAvailable(): Promise<void> {
  try {
    await execFileAsync("git", ["--version"]);
  } catch {
    throw new BailianError(
      "Git is required to initialize a repository.",
      ExitCode.USAGE,
      "Install Git and retry.",
    );
  }
}

async function initializeGitRepository(targetDirectory: string): Promise<void> {
  try {
    await execFileAsync("git", ["init", "--initial-branch", "main"], {
      cwd: targetDirectory,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new BailianError(
      `Could not initialize the local Git repository: ${message}`,
      ExitCode.GENERAL,
    );
  }
}

async function mergeOrCreateTextFile(
  path: string,
  initialContent: string,
  merge: (current: string) => string,
  label: string,
  createdFiles: string[],
  updatedFiles: string[],
): Promise<void> {
  if (!existsSync(path)) {
    await writeFile(path, initialContent, "utf8");
    createdFiles.push(label);
    return;
  }
  const current = await readFile(path, "utf8");
  const next = merge(current);
  if (next !== current) {
    await writeFile(path, next, "utf8");
    updatedFiles.push(label);
  }
}

async function createIfMissing(
  path: string,
  content: string,
  label: string,
  createdFiles: string[],
  preservedFiles: string[],
): Promise<void> {
  if (existsSync(path)) {
    preservedFiles.push(label);
    return;
  }
  await writeFile(path, content, "utf8");
  createdFiles.push(label);
}

function mergeGitignore(content: string): string {
  const repositoryContent = content
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "agents.state.json")
    .join("\n");
  const existingPatterns = new Set(
    repositoryContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  );
  const missingPatterns = REPOSITORY_GITIGNORE_PATTERNS.filter(
    (pattern) => !existingPatterns.has(pattern),
  );
  if (missingPatterns.length === 0) return repositoryContent;
  return appendBlock(
    repositoryContent,
    `# Bailian CLI local files\n${missingPatterns.join("\n")}\n`,
  );
}

function environmentExample(config: string): string {
  return `${extractEnvironmentVariables(config)
    .map((variable) => `${variable}=replace-me`)
    .join("\n")}\n`;
}

function mergeEnvironmentExample(content: string, config: string): string {
  const existingVariables = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match?.[1]) existingVariables.add(match[1]);
  }
  const missingVariables = extractEnvironmentVariables(config).filter(
    (variable) => !existingVariables.has(variable),
  );
  if (missingVariables.length === 0) return content;
  return appendBlock(
    content,
    `${missingVariables.map((variable) => `${variable}=replace-me`).join("\n")}\n`,
  );
}

function extractEnvironmentVariables(config: string): string[] {
  const variables = new Set<string>();
  for (const match of config.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-[^}]*)?\}/g)) {
    if (match[1]) variables.add(match[1]);
  }
  return [...variables];
}

function appendBlock(content: string, block: string): string {
  if (!content) return block;
  if (content.endsWith("\n\n")) return `${content}${block}`;
  if (content.endsWith("\n")) return `${content}\n${block}`;
  return `${content}\n\n${block}`;
}

function buildPackageJson(projectName: string, cliVersion: string): string {
  return `${JSON.stringify(
    {
      name: npmPackageName(projectName),
      private: true,
      version: "0.0.0",
      type: "module",
      scripts: PROJECT_SCRIPTS,
      devDependencies: { "bailian-cli": cliVersion },
    },
    null,
    2,
  )}\n`;
}

function mergePackageJson(
  content: string,
  projectName: string,
  cliVersion: string,
): { content: string; preservedSettings: string[] } {
  let manifest: unknown;
  try {
    manifest = JSON.parse(content);
  } catch {
    throw new BailianError(
      "Cannot upgrade package.json because it is not valid JSON.",
      ExitCode.USAGE,
    );
  }
  if (!isRecord(manifest)) {
    throw new BailianError(
      "Cannot upgrade package.json because its root is not an object.",
      ExitCode.USAGE,
    );
  }
  const preservedSettings: string[] = [];
  if (manifest.name === undefined) manifest.name = npmPackageName(projectName);
  if (manifest.private === undefined) manifest.private = true;

  const scripts = manifest.scripts === undefined ? {} : manifest.scripts;
  if (!isRecord(scripts)) {
    throw new BailianError(
      "Cannot upgrade package.json because 'scripts' is not an object.",
      ExitCode.USAGE,
    );
  }
  manifest.scripts = scripts;
  for (const [name, command] of Object.entries(PROJECT_SCRIPTS)) {
    if (scripts[name] === undefined) scripts[name] = command;
    else if (scripts[name] !== command) preservedSettings.push(`package.json scripts.${name}`);
  }

  const developmentDependencies =
    manifest.devDependencies === undefined ? {} : manifest.devDependencies;
  if (!isRecord(developmentDependencies)) {
    throw new BailianError(
      "Cannot upgrade package.json because 'devDependencies' is not an object.",
      ExitCode.USAGE,
    );
  }
  manifest.devDependencies = developmentDependencies;
  if (developmentDependencies["bailian-cli"] === undefined) {
    developmentDependencies["bailian-cli"] = cliVersion;
  } else if (developmentDependencies["bailian-cli"] !== cliVersion) {
    preservedSettings.push("package.json bailian-cli version");
  }
  return { content: `${JSON.stringify(manifest, null, 2)}\n`, preservedSettings };
}

function buildAoneEnvironmentBlock(config: string): string {
  const variables = extractEnvironmentVariables(config);
  if (variables.length === 0) {
    return "          # Add provider variables referenced by agents.yaml in Aone Flow.";
  }
  return variables.map((variable) => `          ${variable}: \${{secrets.${variable}}}`).join("\n");
}

function buildAoneWorkflow(config: string): string {
  const environmentBlock = buildAoneEnvironmentBlock(config);
  return `name: Bailian CLI Managed Agent

triggers:
  push:
    branches:
      - main

jobs:
  apply:
    name: Validate, plan, and apply Agent resources
    image: alios-8u
    timeout: 30m
    steps:
      - id: checkout
        uses: checkout
      - id: setup-env
        uses: setup-env
        inputs:
          node-version: 22
          tnpm-version: 10
          tnpm-cache: true
      - id: install
        run: npm install --ignore-scripts --no-audit --no-fund
      - id: validate-and-plan
        envs:
${environmentBlock}
        run: |
          npm run agents:validate
          npm run agents:plan:ci > bailian-cli-plan.json
      - id: upload-plan
        uses: upload-artifact
        inputs:
          name: bailian-cli-plan
          path: bailian-cli-plan.json
      - id: apply-and-persist-state
        envs:
${environmentBlock}
        run: |
          set +e
          npm run agents:apply:ci
          apply_status=$?
          set -e
          if ! git diff --quiet -- agents.state.json; then
            git config user.name "Bailian CLI CI"
            git config user.email "bailian-cli-ci@alibaba-inc.com"
            git add -- agents.state.json
            git commit -m "chore: update Bailian CLI Agent state [skip ci]"
            git push origin HEAD:main
          fi
          exit "$apply_status"
`;
}

function buildAoneCheckWorkflow(config: string): string {
  const environmentBlock = buildAoneEnvironmentBlock(config);
  return `name: Bailian CLI Managed Agent Check

# Bind this pipeline to Codeup merge-request new/update events in Aone Flow.
jobs:
  check:
    name: Validate and plan Agent resources
    image: alios-8u
    timeout: 20m
    steps:
      - id: checkout
        uses: checkout
      - id: setup-env
        uses: setup-env
        inputs:
          node-version: 22
          tnpm-version: 10
          tnpm-cache: true
      - id: install
        run: npm install --ignore-scripts --no-audit --no-fund
      - id: validate-and-plan
        envs:
${environmentBlock}
        run: |
          npm run agents:validate
          npm run agents:plan:ci > bailian-cli-plan.json
      - id: upload-plan
        uses: upload-artifact
        inputs:
          name: bailian-cli-plan
          path: bailian-cli-plan.json
`;
}

function buildReadme(projectName: string, config: string): string {
  const variableList = extractEnvironmentVariables(config)
    .map((variable) => `- \`${variable}\``)
    .join("\n");
  return `# ${projectName}

This repository declares cloud Agent resources with Bailian CLI.

## Local Workbench

1. Copy \`.env.example\` to \`.env\` and replace placeholder credentials.
2. Run \`npm install\`.
3. Run \`npm run agents:workbench\`.

## Aone CI

\`.aoneci/bailian-cli-check.yml\` validates and plans merge requests without applying. \`.aoneci/bailian-cli.yml\` applies non-destructive local changes after a push to \`main\` and commits the resulting \`agents.state.json\` back to \`main\`.

Configure these values as secret variables in Aone Flow:

${variableList || "- Add the provider variables referenced by agents.yaml."}

Set pipeline concurrency to 1, protect the main branch, and require approval where appropriate. Workbench and CI should use isolated credentials, resource namespaces, and State scopes.

Create the remote repository yourself, then push this local repository:

\`\`\`bash
git add .
git commit -m "Initialize Bailian CLI Agent project"
git remote add origin <your-codeup-repository-url>
git push -u origin main
\`\`\`
`;
}

function npmPackageName(projectName: string): string {
  const normalized = projectName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");
  return normalized || "bailian-agent-project";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

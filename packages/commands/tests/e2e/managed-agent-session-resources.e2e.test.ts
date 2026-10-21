import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { parseStdoutJson, runCommandE2e } from "./helpers.ts";
import type { E2eRouteExports } from "./topic-routes.ts";

const ROUTES: E2eRouteExports = {
  "managed-agent session create": "managedAgentSessionCreate",
  "managed-agent session run": "managedAgentSessionRun",
};
const directories: string[] = [];
const PRIVATE_TOKEN = "fake-session-resource-private-token";
const GITHUB_RESOURCE = {
  type: "github_repository",
  url: "https://github.com/example/synthetic-review",
  authorization_token: PRIVATE_TOKEN,
};
const INPUT_FORMS = ["inline", "file"] as const;

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function fixture(resource: Record<string, unknown>, inputForm: (typeof INPUT_FORMS)[number]) {
  const directory = mkdtempSync(join(tmpdir(), "bl-session-resources-e2e-"));
  directories.push(directory);
  const json = JSON.stringify(resource);
  const resourcePath = join(directory, "resource.json");
  if (inputForm === "file") writeFileSync(resourcePath, json);
  return {
    resourceArgument: inputForm === "file" ? `@${resourcePath}` : json,
    configPath: join(directory, "missing-project.yaml"),
  };
}

function runSession(action: string, resourceFixture: ReturnType<typeof fixture>, dryRun: boolean) {
  return runCommandE2e(
    ROUTES,
    [
      "managed-agent",
      "session",
      action,
      ...(action === "run" ? ["--prompt", "hello"] : []),
      "--resource",
      resourceFixture.resourceArgument,
      "--file",
      resourceFixture.configPath,
      ...(dryRun ? ["--dry-run"] : []),
      "--output",
      "json",
      "--quiet",
    ],
    {
      DASHSCOPE_API_KEY: undefined,
      BAILIAN_API_KEY: undefined,
      BAILIAN_E2E: "0",
      DO_NOT_TRACK: "1",
    },
  );
}

describe("e2e: managed-agent Session resource provider validation", () => {
  test.each(
    ["create", "run"].flatMap((action) =>
      INPUT_FORMS.flatMap((inputForm) =>
        [true, false].map((dryRun) => ({ action, inputForm, dryRun })),
      ),
    ),
  )(
    "Session $action rejects $inputForm GitHub resources before auth or preview (dry-run: $dryRun)",
    async ({ action, inputForm, dryRun }) => {
      const result = await runSession(action, fixture(GITHUB_RESOURCE, inputForm), dryRun);
      expect(result.exitCode, result.stderr).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("Bailian Session resources only support memory_store");
      expect(result.stderr).toContain("百炼 Session 资源仅支持 memory_store");
      expect(`${result.stdout}\n${result.stderr}`).not.toContain(PRIVATE_TOKEN);
      expect(`${result.stdout}\n${result.stderr}`).not.toContain(GITHUB_RESOURCE.type);
    },
  );

  test.each(INPUT_FORMS)(
    "does not echo an arbitrary resource type from %s input",
    async (inputForm) => {
      const privateType = "fake-private-resource-type";
      const result = await runSession(
        "create",
        fixture({ ...GITHUB_RESOURCE, type: privateType }, inputForm),
        true,
      );
      expect(result.exitCode, result.stderr).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("Bailian Session resources only support memory_store");
      expect(`${result.stdout}\n${result.stderr}`).not.toContain(privateType);
      expect(`${result.stdout}\n${result.stderr}`).not.toContain(PRIVATE_TOKEN);
    },
  );

  test.each([
    { action: "create", inputForm: "inline" },
    { action: "run", inputForm: "file" },
  ] as const)(
    "Session $action still previews $inputForm Memory Store resources",
    async ({ action, inputForm }) => {
      const resource = {
        type: "memory_store",
        memory_store: "notes",
        access: "read_only",
        instructions: "Use the project notes",
      };
      const result = await runSession(action, fixture(resource, inputForm), true);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(parseStdoutJson(result.stdout)).toMatchObject({
        [action === "create" ? "would_create_session" : "would_run"]: {
          provider: "bailian",
          resources: [resource],
        },
      });
    },
  );
});

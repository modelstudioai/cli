import { buildSettings, type AuthStore, type Identity, type LocalizedText } from "bailian-cli-core";
import { expect, test, vi } from "vite-plus/test";

const openInBrowser = vi.hoisted(() => vi.fn<(url: string) => Promise<void>>());

vi.mock("../src/commands/shared/local-server.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/commands/shared/local-server.ts")>();
  return {
    ...actual,
    openInBrowser: (url: string) => openInBrowser(url),
  };
});

import { openApiPasteCommand, runOpenApiGuide } from "../src/commands/auth/login-openapi-guide.ts";
import type { LoginDeps } from "../src/commands/auth/login-console.ts";

const identity = { binName: "bl" } as Identity;

function localize(text: LocalizedText): string {
  return typeof text === "string" ? text : text["en-US"];
}

function messageText(message: unknown): string {
  if (typeof message === "string") return message;
  if (message && typeof message === "object" && "en-US" in message) {
    return String((message as { "en-US": string })["en-US"]);
  }
  return String(message);
}

function makeDeps(options?: { infos?: string[]; warnings?: string[] }): LoginDeps {
  const infos = options?.infos;
  const warnings = options?.warnings;
  return {
    identity,
    settings: buildSettings({ flags: {}, file: {}, env: {} }),
    authStore: {} as AuthStore,
    localize,
    output: {
      info: (message) => {
        infos?.push(messageText(message));
      },
      warning: (message) => {
        warnings?.push(messageText(message));
      },
      debug: () => undefined,
    },
  };
}

test("openApiPasteCommand keeps non-domestic site and explicit config", () => {
  expect(openApiPasteCommand(identity)).toBe(
    "bl auth login --open-api --access-key-id <id> --access-key-secret <secret>",
  );
  expect(openApiPasteCommand(identity, { site: "domestic" })).toBe(
    "bl auth login --open-api --access-key-id <id> --access-key-secret <secret> --console-site domestic",
  );
  expect(openApiPasteCommand(identity, { site: "international", config: "release-review" })).toBe(
    "bl auth login --open-api --access-key-id <id> --access-key-secret <secret> --console-site international --config release-review",
  );
  // An explicit domestic has to survive paste-back: dropping the flag would let a
  // Profile default of `console_site: international` win on the save path.
  expect(openApiPasteCommand(identity, { site: "domestic", config: "p" })).toBe(
    "bl auth login --open-api --access-key-id <id> --access-key-secret <secret> --console-site domestic --config p",
  );
});

test("runOpenApiGuide awaits browser open and reports failure without claiming success", async () => {
  const warnings: string[] = [];
  const infos: string[] = [];
  openInBrowser.mockReset();
  openInBrowser.mockRejectedValue(new Error("spawn open ENOENT"));

  const result = await runOpenApiGuide(makeDeps({ infos, warnings }), {
    site: "international",
    config: "release-review",
  });

  expect(result.browserOpened).toBe(false);
  expect(result.url).toMatch(/modelstudio\.console\.alibabacloud\.com\/aksk-guide/);
  expect(openInBrowser).toHaveBeenCalledOnce();
  expect(warnings.join("\n")).toMatch(/Could not open a browser automatically/);
  expect(infos.join("\n")).toMatch(/--console-site international --config release-review/);
  expect(infos.join("\n")).not.toMatch(/Opened the setup page/);
});

test("runOpenApiGuide marks browserOpened when open succeeds", async () => {
  openInBrowser.mockReset();
  openInBrowser.mockResolvedValue(undefined);

  const result = await runOpenApiGuide(makeDeps(), { site: "domestic", noBrowser: false });

  expect(result.browserOpened).toBe(true);
  expect(openInBrowser).toHaveBeenCalledOnce();
});

test("runOpenApiGuide prints the paste command before the opener resolves", async () => {
  let releaseOpen: () => void = () => undefined;
  openInBrowser.mockReset();
  openInBrowser.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        releaseOpen = resolve;
      }),
  );

  const infos: string[] = [];
  const pendingGuide = runOpenApiGuide(makeDeps({ infos }), { site: "international" });

  // A hanging `open` / `xdg-open` must not withhold the actionable output.
  await new Promise((resolve) => setImmediate(resolve));
  expect(infos.join("\n")).toMatch(
    /--access-key-id <id> --access-key-secret <secret> --console-site international/,
  );

  releaseOpen();
  expect((await pendingGuide).browserOpened).toBe(true);
});

test("runOpenApiGuide with --no-browser skips openInBrowser", async () => {
  openInBrowser.mockReset();

  const result = await runOpenApiGuide(makeDeps(), { noBrowser: true });

  expect(result.browserOpened).toBe(false);
  expect(openInBrowser).not.toHaveBeenCalled();
});

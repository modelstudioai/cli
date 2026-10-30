import { expect, it, vi } from "vite-plus/test";
import type { Context } from "@deepseek-ai/cordis";
import { MemoCardController } from "../src/web/memo-card-controller.js";

// Host UI bundle imports browser-only peers; keep the ordinary form inert in this controller test.
vi.mock("@deepseek-ai/dsh-client-ui-primitives", () => ({
  settingsTextField: (field: string) => ({ field }),
  settingsNumberField: (field: string) => ({ field }),
  SettingsFormModel: class {
    field() {
      return { text: "true" };
    }
    shell() {
      return { available: true, writable: true };
    }
    actions() {
      return { save: () => undefined };
    }
    bind(project: () => unknown) {
      let snapshot = project();
      return {
        getSnapshot: () => snapshot,
        set: (next: unknown) => {
          snapshot = next;
        },
      };
    }
    dispose() {}
  },
}));

it("keeps connection secrets out of the native form and clears them after success and disposal", async () => {
  const mutate = vi.fn(async () => true);
  const requests: Array<{ path: unknown; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: unknown, init?: RequestInit) => {
      requests.push({ path, body: init?.body });
      return {
        ok: true,
        json: async () => ({
          plugin: { workspaceId: "bound" },
          apiKey: { configured: true, writable: true },
        }),
      };
    }),
  );
  const controller = new MemoCardController(
    {
      getSnapshot: () => ({
        status: "ready",
        value: { enabled: true },
        base: {},
        user: {},
        writable: true,
        revision: 1,
      }),
      subscribe: () => () => undefined,
      mutate,
    },
    { remote: { $on: () => () => undefined } } as unknown as Context,
  );
  try {
    await controller.refresh();
    const face = controller.inject();
    expect(face.hooks.memoCard.getSnapshot().workspaceDraft).toBe("bound");
    controller.setApiKeyDraft("new-secret");
    controller.setWorkspaceDraft("bound");
    face.save();
    expect(mutate).not.toHaveBeenCalled();
    await controller.saveConnection();
    expect(
      requests.find((request) => request.path === "/plugins/bailian-memo-dsh/credentials")?.body,
    ).toBe(JSON.stringify({ workspaceId: "bound", apiKey: "new-secret" }));
    expect(face.hooks.memoCard.getSnapshot().apiKeyDraft).toBe("");
    controller.setApiKeyDraft("another-secret");
    controller.dispose();
    expect(face.hooks.memoCard.getSnapshot().apiKeyDraft).toBe("");
  } finally {
    vi.unstubAllGlobals();
  }
});

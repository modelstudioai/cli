import { expect, it, vi } from "vite-plus/test";
import type { Context } from "@deepseek-ai/cordis";
import { BailianCardController } from "../src/web/bailian-card-controller.js";

vi.mock("@deepseek-ai/dsh-client-ui-primitives", () => ({
  settingsTextField: (field: string) => ({ field }),
  SettingsFormModel: class {
    field() {
      return { text: "" };
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

it("clears write-only drafts after manual save, automatic login, and disposal", async () => {
  vi.useFakeTimers();
  let workspace = "saved-workspace";
  const requests: Array<{ path: unknown; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: unknown, init?: RequestInit) => {
      requests.push({ path, body: init?.body });
      if (path === "/bailian-kb/credentials") return Response.json({ saved: true });
      if (path === "/bailian-kb/autofill")
        return {
          ok: true,
          json: async () =>
            init?.body === '{"action":"loginStatus"}' ? { phase: "done" } : { status: "started" },
        };
      return {
        ok: true,
        json: async () => ({
          workspaceId: workspace,
          apiKey: { configured: true, writable: true },
        }),
      };
    }),
  );
  const mutate = vi.fn(async () => true);
  const controller = new BailianCardController(
    {
      getSnapshot: () => ({
        status: "ready",
        value: {},
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
    controller.setApiKeyDraft("new-secret");
    controller.setWorkspaceDraft("saved-workspace");
    face.save();
    expect(mutate).not.toHaveBeenCalled();
    await controller.saveConnection();
    expect(requests.find((request) => request.path === "/bailian-kb/credentials")?.body).toBe(
      JSON.stringify({ apiKey: "new-secret", workspaceId: "saved-workspace" }),
    );
    expect(face.hooks.bailianCard.getSnapshot().apiKeyDraft).toBe("");
    controller.setApiKeyDraft("stale-secret");
    controller.setWorkspaceDraft("stale-workspace");
    await controller.beginConsoleLogin();
    workspace = "login-workspace";
    await vi.advanceTimersByTimeAsync(1500);
    expect(face.hooks.bailianCard.getSnapshot().apiKeyDraft).toBe("");
    expect(face.hooks.bailianCard.getSnapshot().workspaceDraft).toBe("login-workspace");
    controller.setApiKeyDraft("another-secret");
    controller.dispose();
    expect(face.hooks.bailianCard.getSnapshot().apiKeyDraft).toBe("");
  } finally {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});

it.each([
  [401, "", "HTTP 401"],
  [403, "", "HTTP 403"],
  [404, "", "HTTP 404"],
  [502, "<html>Bad gateway</html>", "HTTP 502"],
  [200, "", "HTTP 200"],
  [200, "{}", "confirmed"],
  [400, '{"error":"invalid workspace"}', "invalid workspace"],
] as const)(
  "keeps drafts and explains unsuccessful save (%s, %s)",
  async (status, body, expected) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) =>
        path === "/bailian-kb/credentials"
          ? new Response(body, { status })
          : Response.json({ workspaceId: "old-workspace", apiKey: { configured: true } }),
      ),
    );
    const controller = new BailianCardController(
      {
        getSnapshot: () => ({
          status: "ready",
          value: {},
          base: {},
          user: {},
          writable: true,
          revision: 1,
        }),
        subscribe: () => () => undefined,
        mutate: vi.fn(),
      },
      { remote: { $on: () => () => undefined } } as unknown as Context,
    );
    try {
      controller.setApiKeyDraft("new-secret");
      controller.setWorkspaceDraft("new-workspace");
      await controller.saveConnection();
      const state = controller.inject().hooks.bailianCard.getSnapshot();
      expect(state.message).toContain(expected);
      expect(state.message).not.toContain("JSON input");
      expect(state.apiKeyDraft).toBe("new-secret");
      expect(state.workspaceDraft).toBe("new-workspace");
      expect(state.connectionBusy).toBe(false);
    } finally {
      controller.dispose();
      vi.unstubAllGlobals();
    }
  },
);

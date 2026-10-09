import { afterEach, expect, it, vi } from "vite-plus/test";
import type { Context } from "@deepseek-ai/cordis";
import { MemoCardController } from "../src/web/memo-card-controller.js";

const state = vi.hoisted(() => ({ fields: {} as Record<string, string>, saved: vi.fn() }));
vi.mock("@deepseek-ai/dsh-client-ui-primitives", () => ({
  settingsTextField: (field: string) => ({ field }),
  settingsNumberField: (field: string) => ({ field }),
  SettingsFormModel: class {
    field(field: string) {
      return { text: state.fields[field] ?? "" };
    }
    shell() {
      return { available: true, writable: true };
    }
    actions() {
      return {
        edit: (field: string, value: string) => {
          state.fields[field] = value;
        },
        save: () => state.saved({ ...state.fields }),
      };
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
afterEach(() => {
  vi.unstubAllGlobals();
  state.saved.mockClear();
  state.fields = {};
});

it("saves the last rule by default, preserves explicit selection, and blocks unavailable rules", async () => {
  state.fields = { extractProfile: "true" };
  let schemas = [
    { id: "first", name: "First" },
    { id: "last", name: "Last" },
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) =>
      Response.json(
        path.endsWith("profile-schemas")
          ? { schemas }
          : { plugin: {}, apiKey: { configured: true, writable: true } },
      ),
    ),
  );
  const controller = new MemoCardController(
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
    await controller.refresh();
    const face = controller.inject();
    face.save();
    expect(state.saved).toHaveBeenLastCalledWith({
      extractProfile: "true",
      profileSchemaId: "last",
    });
    face.edit("profileSchemaId", "first");
    await controller.refreshProfileSchemas();
    face.save();
    expect(state.saved).toHaveBeenLastCalledWith({
      extractProfile: "true",
      profileSchemaId: "first",
    });
    schemas = [{ id: "last", name: "Last" }];
    await controller.refreshProfileSchemas();
    state.saved.mockClear();
    face.save();
    expect(state.saved).not.toHaveBeenCalled();
    expect(face.hooks.memoCard.getSnapshot().profileSchemasError).toContain("Choose an available");
    face.edit("extractProfile", "false");
    face.save();
    expect(state.saved).toHaveBeenCalledOnce();
  } finally {
    controller.dispose();
  }
});

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { mirrorReleaseAssetsToOss } from "./oss-direct-upload.mjs";

describe("OSS upload via FC", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("refreshes the GitHub OIDC token before release-finalize", async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), "bailian-oss-upload-"));
    const assetPath = join(tempDirectory, "asset.bin");
    await writeFile(assetPath, "asset");

    vi.stubEnv("FC_TRIGGER_URL", "https://fc.example");
    vi.stubEnv("FC_RELEASE_AUDIENCE", "release-test");
    vi.stubEnv("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "request-token");
    vi.stubEnv("ACTIONS_ID_TOKEN_REQUEST_URL", "https://oidc.example/token");

    let oidcRequestCount = 0;
    const fcAuthorizations = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input, init = {}) => {
        const url = String(input);
        if (url.startsWith("https://oidc.example/token")) {
          oidcRequestCount += 1;
          return Response.json({ value: `oidc-token-${oidcRequestCount}` });
        }
        if (url === "https://fc.example/release-prepare") {
          fcAuthorizations.push(init.headers.Authorization);
          return Response.json({
            success: true,
            uploads: [
              {
                key: "release/test/asset.bin",
                putUrl: "https://oss.example/asset.bin",
                contentType: "application/octet-stream",
              },
            ],
          });
        }
        if (url === "https://oss.example/asset.bin") {
          return new Response(null, { status: 200 });
        }
        if (url === "https://fc.example/release-finalize") {
          fcAuthorizations.push(init.headers.Authorization);
          if (init.headers.Authorization !== "Bearer oidc-token-2") {
            return Response.json(
              { success: false, error: "OIDC token 已过期", status: 403 },
              { status: 403 },
            );
          }
          return Response.json({ success: true });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    try {
      await expect(
        mirrorReleaseAssetsToOss({ plans: [{ tag: "test", paths: [assetPath] }] }),
      ).resolves.toEqual({ uploaded: 1, skipped: false });
      expect(oidcRequestCount).toBe(2);
      expect(fcAuthorizations).toEqual(["Bearer oidc-token-1", "Bearer oidc-token-2"]);
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });
});

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it, expect } from "vite-plus/test";
import { readBlCliConfig } from "../src/bl-cli.js";

it("reads the root named profile without inheriting root credentials", () => {
  const home = mkdtempSync(join(tmpdir(), "memo-bl-"));
  try {
    mkdirSync(join(home, ".bailian"));
    writeFileSync(
      join(home, ".bailian", "config.json"),
      JSON.stringify({
        active_config: "work",
        api_key: "root-key",
        workspace_id: "root-workspace",
        work: { workspace_id: "named-workspace" },
      }),
    );
    expect(readBlCliConfig(home)).toEqual({ workspaceId: "named-workspace" });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

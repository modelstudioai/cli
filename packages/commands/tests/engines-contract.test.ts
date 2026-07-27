import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";

/**
 * 发布契约：最低 Node 版本。
 * 1) bl 全部发布包的 engines.node 必须一致（版本 bump 一动多动的另一面）。
 * 2) 外部运行时依赖 @openagentpack/sdk 的 engines 下限不得高于 bl 的下限，
 *    否则 Node 18/20 用户安装 bailian-cli 会触发 EBADENGINE / engine-strict 失败。
 *    历史上出现过冲突版本，用版本号白名单做棘轮：一旦升级依赖版本，本检查自动强制生效。
 */

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const BL_PACKAGES = ["core", "runtime", "commands", "cli", "kscli"] as const;

/** 上游 engines 冲突版本白名单；当前依赖版本已对齐，请勿把新版本加进来。 */
const KNOWN_SDK_ENGINE_CONFLICT_VERSIONS = new Set<string>([]);

interface PackageManifest {
  name: string;
  version: string;
  engines?: { node?: string };
  dependencies?: Record<string, string>;
}

function readManifest(path: string): PackageManifest {
  return JSON.parse(readFileSync(path, "utf8")) as PackageManifest;
}

/** 解析 ">=X.Y.Z" / ">=X" 形式的 engines 下限为可比较的 [major, minor, patch]。 */
function parseEngineFloor(range: string): [number, number, number] {
  const matched = /^>=\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(range.trim());
  if (!matched) throw new Error(`Unsupported engines range: ${range}`);
  return [Number(matched[1]), Number(matched[2] ?? 0), Number(matched[3] ?? 0)];
}

function floorLessOrEqual(
  left: [number, number, number],
  right: [number, number, number],
): boolean {
  for (let index = 0; index < 3; index++) {
    if (left[index]! !== right[index]!) return left[index]! < right[index]!;
  }
  return true;
}

test("bl 全部发布包 engines.node 一致", () => {
  const floors = BL_PACKAGES.map((pkg) => {
    const manifest = readManifest(join(repoRoot, "packages", pkg, "package.json"));
    return { name: manifest.name, node: manifest.engines?.node };
  });
  const [first, ...rest] = floors;
  expect(first?.node).toMatch(/^>=\d+\.\d+\.\d+$/);
  for (const entry of rest) {
    expect(entry.node, `${entry.name} engines.node 与 ${first?.name} 不一致`).toBe(first?.node);
  }
});

test("@openagentpack/sdk engines 下限不高于 bl 的最低 Node 版本", () => {
  const commandsManifest = readManifest(join(repoRoot, "packages", "commands", "package.json"));
  const blFloor = parseEngineFloor(commandsManifest.engines?.node ?? "");

  const sdkManifest = readManifest(
    join(repoRoot, "packages", "commands", "node_modules", "@openagentpack", "sdk", "package.json"),
  );
  const sdkRange = sdkManifest.engines?.node;
  if (!sdkRange) return; // 无 engines 声明即不设限,兼容

  if (KNOWN_SDK_ENGINE_CONFLICT_VERSIONS.has(sdkManifest.version)) return;

  const sdkFloor = parseEngineFloor(sdkRange);
  expect(
    floorLessOrEqual(sdkFloor, blFloor),
    `@openagentpack/sdk@${sdkManifest.version} 要求 Node ${sdkRange}，高于 bl 承诺的 ${commandsManifest.engines?.node}；` +
      "这会让 Node 18/20 用户安装 bailian-cli 失败（EBADENGINE / engine-strict）。",
  ).toBe(true);
});

import { describe, expect, test } from "vite-plus/test";
import {
  isBailianE2EEnabled,
  isDashScopeE2EReady,
  parseStdoutJson,
  runCommandE2e,
} from "./helpers.ts";
import { MEMORY_ROUTES } from "./topic-routes.ts";

interface MemoryAddBody {
  memory_ids?: string[];
}

interface MemoryListBody {
  memory_nodes?: Array<{ memory_node_id: string; content: string }>;
}

interface MemorySearchBody {
  memory_nodes?: Array<{ memory_node_id: string; content: string }>;
}

const DEFAULT_E2E_MEMORY_USER_ID = "e2e-vp-test";
// bailian-cli-test
const DEFAULT_E2E_MEMORY_LIBRARY_ID = "92e8626561c4472e8805d2328030d642";

/**
 * 优先使用环境变量，若未设置则使用默认值。
 */
function memoryLibraryCliArgs(): string[] {
  const id = process.env.BAILIAN_E2E_MEMORY_LIBRARY_ID?.trim() || DEFAULT_E2E_MEMORY_LIBRARY_ID;
  return id ? ["--memory-library-id", id] : [];
}

/**
 * Memory：先做 help / 分组等常规检测（不依赖密钥、不调记忆 API）。
 * 需 E2E + DashScope 的缺参、dry-run 与 CRUD 放在 skip 块内。
 */

describe("e2e: memory", () => {
  test("memory add --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(MEMORY_ROUTES, ["memory", "add", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/add|--user-id|--content|messages/i);
  });

  test("memory list --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(MEMORY_ROUTES, ["memory", "list", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/list|--user-id|memory-library/i);
  });

  test("memory search --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(MEMORY_ROUTES, ["memory", "search", "--help"]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/search|--query|user-id/i);
  });

  test("memory profile create --help 正常退出", async () => {
    const { stderr, exitCode } = await runCommandE2e(MEMORY_ROUTES, [
      "memory",
      "profile",
      "create",
      "--help",
    ]);
    expect(exitCode, stderr).toBe(0);
    expect(stderr).toMatch(/profile|create|user-id/i);
  });
});

/**
 * 记忆库增 → 列 → 搜 → 改 → 删
 */
describe.skipIf(!isBailianE2EEnabled() || !isDashScopeE2EReady())(
  "e2e: memory CRUD + search",
  () => {
    test("memory add 缺少 --user-id 时报用法错误并退出 (2)", async () => {
      const { stderr, exitCode } = await runCommandE2e(MEMORY_ROUTES, [
        "memory",
        "add",
        ...memoryLibraryCliArgs(),
        "--content",
        "仅内容无用户",
      ]);
      expect(exitCode).toBe(2);
      expect(stderr).toMatch(/--user-id|Usage:/i);
    });

    test("memory add 缺少 --messages 与 --content 时报错正常退出", async () => {
      const userId = process.env.BAILIAN_E2E_MEMORY_USER_ID?.trim() || DEFAULT_E2E_MEMORY_USER_ID;
      const { stderr, exitCode } = await runCommandE2e(MEMORY_ROUTES, [
        "memory",
        "add",
        ...memoryLibraryCliArgs(),
        "--user-id",
        userId,
      ]);
      expect(exitCode).toBe(2);
      expect(stderr).toMatch(/messages|content|required/i);
    });

    test("memory add --dry-run 仅输出计划且不入网", async () => {
      const userId = process.env.BAILIAN_E2E_MEMORY_USER_ID?.trim() || DEFAULT_E2E_MEMORY_USER_ID;
      const { stdout, stderr, exitCode } = await runCommandE2e(MEMORY_ROUTES, [
        "memory",
        "add",
        "--dry-run",
        ...memoryLibraryCliArgs(),
        "--user-id",
        userId,
        "--content",
        "dry-run 不入网",
        "--output",
        "json",
      ]);
      expect(exitCode, stderr).toBe(0);
      const data = parseStdoutJson<{ request?: { user_id?: string; custom_content?: string } }>(
        stdout,
      );
      expect(data.request?.user_id).toBe(userId);
      expect(data.request?.custom_content).toContain("dry-run");
    });

    test("记忆库增删改查", async () => {
      const userId = process.env.BAILIAN_E2E_MEMORY_USER_ID?.trim() || DEFAULT_E2E_MEMORY_USER_ID;
      const contentA = "CLI vp test：记忆写入（可删）";
      const contentB = "CLI vp test：记忆已更新";

      const addRes = await runCommandE2e(MEMORY_ROUTES, [
        "memory",
        "add",
        ...memoryLibraryCliArgs(),
        "--user-id",
        userId,
        "--content",
        contentA,
        "--output",
        "json",
      ]);
      expect(addRes.exitCode, addRes.stderr).toBe(0);
      const added = parseStdoutJson<MemoryAddBody & { request_id?: string }>(addRes.stdout);
      expect(added.request_id?.length ?? 0, addRes.stdout + addRes.stderr).toBeGreaterThan(0);

      const listRes = await runCommandE2e(MEMORY_ROUTES, [
        "memory",
        "list",
        ...memoryLibraryCliArgs(),
        "--user-id",
        userId,
        "--output",
        "json",
      ]);
      expect(listRes.exitCode, listRes.stderr).toBe(0);
      const listed = parseStdoutJson<MemoryListBody>(listRes.stdout);
      if ((listed.memory_nodes?.length ?? 0) === 0) {
        throw new Error(
          "memory list 为空：add 已成功但列表无节点。请设置 BAILIAN_E2E_MEMORY_LIBRARY_ID 与阿里云百炼控制台当前「记忆库」ID 一致；" +
            "并设置 BAILIAN_E2E_MEMORY_USER_ID 与控制台筛选的「用户 ID」一致。stdout=" +
            listRes.stdout,
        );
      }
      const nodeId = listed.memory_nodes![0]!.memory_node_id.trim();
      expect(nodeId.length).toBeGreaterThan(0);

      const searchRes = await runCommandE2e(MEMORY_ROUTES, [
        "memory",
        "search",
        ...memoryLibraryCliArgs(),
        "--user-id",
        userId,
        "--query",
        "vp test",
        "--top-k",
        "5",
        "--output",
        "json",
      ]);
      expect(searchRes.exitCode, searchRes.stderr).toBe(0);
      const searched = parseStdoutJson<MemorySearchBody>(searchRes.stdout);
      expect(searched.memory_nodes?.length ?? 0).toBeGreaterThan(0);

      const updRes = await runCommandE2e(MEMORY_ROUTES, [
        "memory",
        "update",
        ...memoryLibraryCliArgs(),
        "--node-id",
        nodeId!,
        "--user-id",
        userId,
        "--content",
        contentB,
        "--output",
        "json",
      ]);
      expect(updRes.exitCode, updRes.stderr).toBe(0);

      const delRes = await runCommandE2e(MEMORY_ROUTES, [
        "memory",
        "delete",
        ...memoryLibraryCliArgs(),
        "--node-id",
        nodeId!,
        "--user-id",
        userId,
        "--output",
        "json",
      ]);
      expect(delRes.exitCode, delRes.stderr).toBe(0);
    }, 180_000);
  },
);

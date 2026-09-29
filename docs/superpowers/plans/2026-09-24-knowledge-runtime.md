# Knowledge Runtime and Billing Implementation Plan

> 验收索引：[最终验收记录](2026-09-29-knowledge-verification.md)。任务已实现并验证；下方早期进度段落保留为历史记录，最终证据和验证边界以验收记录为准。测试文件组织按实际代码调整，同一行为的路由断言收在 introspect 测试中。

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 建立只读计划与确认的公共接口，为知识库创建补齐计费提示，并交付双入口全局 `--introspect`。

**Architecture:** 保持现有静态风险命令的执行顺序。新增 prepare 命令在鉴权后只读规划，runtime 统一渲染预览和确认；元数据序列化只读 registry，不执行 prepare/validate/run。

**Tech Stack:** TypeScript、vite-plus/test、现有 Command/CommandContext、middleware、registry、resolve。

---

## Task A1：定义计划与风险契约

**Files — modify:** `packages/core/src/types/command.ts`、`packages/core/src/types/index.ts`、`packages/runtime/src/middleware.ts`、`packages/runtime/src/create-cli.ts`、`packages/runtime/src/confirm.ts`。core 根 index 已通过 types/index re-export，不重复登记。

**Files — create:** `packages/runtime/src/preparation.ts`、`packages/runtime/tests/preparation.test.ts`。

- [x] 在 command 类型旁加入以下数据契约；Command、CommandContext、defineCommand 增加第二个默认泛型 `Prepared = undefined`，保留旧命令的推断和必需 run 字段。AnyCommand 同时擦除两个泛型。

```ts
export interface CommandNotice {
  code: string;
  message: LocalizedText;
  url?: string;
}

export interface CommandPreparation<Prepared> {
  data: Prepared;
  preview: unknown;
  risk: CommandRisk | null;
  notices: readonly CommandNotice[];
}
```

Command 新增 `prepare?: (ctx: CommandContext<F>) => Promise<CommandPreparation<Prepared>>`；run 的 ctx 使用 `CommandContext<F, Prepared>`，该 context 新增 `prepared?: Prepared`。prepare 命令仍声明静态 risk 作为 help/introspect 的最大风险与 `--yes` 注入依据；preparation.risk 为本次实际风险，null 表示无破坏/新建计费资源。

- [x] 为 CommandRisk 增加可选 `reason: "destructive" | "billing"`，不修改 level、exit code、已有错误必需字段；遗漏 reason 的旧命令保持原行为。
- [x] 在 `preparation.test.ts` 写 fake-client 测试：prepare 返回高风险计划，无 yes 时 run 次数为 0；dry-run 时 preview 被输出但 run 不调用；null risk 可执行；yes 只在 runtime 内消费。
- [x] 运行 `vp test packages/runtime/tests/preparation.test.ts`，确认失败原因是新契约未实现，而非测试环境故障。
- [x] 实现顺序：旧静态 confirmationStage 仅对没有 prepare 的命令执行；鉴权后进入 prepare → notices → dry-run 返回或实际风险 gate → ctx.prepared 赋值 → run。prepare 每次只调用一次，不为输出再次取远端快照。
- [x] prepare 只读：不写 state、不创建锁、不申请上传租约、不发模型调用。只读 POST 允许，但须由具体操作语义和 fake-client 调用清单证明。
- [x] prepare 命令在 dry-run/确认前禁用自动升级、后台 skill 同步等本地写入副作用；专门断言这些 hooks 未调用。鉴权只使用已有凭证，不在预检中自动启动登录或落盘。保留旧命令管线行为，不借此全局改造 telemetry。
- [x] 需要远端计划却缺凭证时返回 AUTH，不沿用旧 dry-run 缺凭证容忍规则。静态命令 dry-run 仍无需凭证、零网络；两种模式在 help 明示。
- [x] 确认错误增加可选 `plan` 和 `notices`，旧 error 必需字段保持；结构化提醒即使 `--quiet` 也不能丢失，JSON stdout 不能混入人读文案。
- [x] 扩展 `confirm.test.ts`、`registry-guard.test.ts`，验证旧静态命令无 yes 仍在鉴权前拒绝。测试 `--yes` 不在业务 flags、不存入全局配置。
- [x] 执行 `vp test packages/runtime/tests/preparation.test.ts packages/runtime/tests/confirm.test.ts packages/runtime/tests/registry-guard.test.ts`，预期全部通过。

## Task A2：计费政策与直接建库确认

**Files — create:** `packages/commands/src/commands/knowledge/billing.ts`、`packages/commands/tests/knowledge/knowledge-billing.test.ts`。

**Files — modify:** `packages/commands/src/commands/knowledge/kb-create.ts`、`packages/runtime/src/urls.ts`、`packages/runtime/src/index.ts`、`packages/commands/tests/e2e/knowledge/knowledge-kb-create.e2e.test.ts`。

- [x] billing.ts 导出 `knowledgeBillingNotice` 与 `knowledgeCreationRisk`。计费文案属于知识库业务，URL 通过 runtime urls 统一导出；core 不硬编码产品 URL。

```ts
const message = {
  "en-US":
    "A knowledge base starts accruing running-time charges when created, even without queries. The one-time 720-hour allowance applies only to Standard Edition, is shared across knowledge bases, and expires 30 days after service activation for new users. Model calls are billed separately. Your remaining allowance has not been verified. Delete unused knowledge bases to stop their running-time charges.",
  "zh-CN":
    "知识库创建成功后，即使不检索也会持续按运行时长计费。一次性 720 小时额度仅适用于标准版，多个知识库共享，新用户开通服务后 30 天内有效；模型调用费用另计。当前账户剩余额度尚未核实。请删除不再需要的知识库以停止其规格计费。",
} as const;
```

- [x] 编写断言：文案不承诺本次免费；reason=billing；账单/官方说明地址来自公共常量；两种 locale 都包含有效期与独立模型费用。
- [x] `kb create` 声明静态 high/billing risk，无 yes 在任何上传或创建前 exit 7。将 notice 放入 dry-run 预览、JSON 成功结果；正常执行时 stderr 提醒，即使用户传 yes 也保留说明。
- [x] 建库已成功、等待失败时通过现有 BailianError details/hint 保留 pipelineId 和原服务端 message；新增字段表达 `created: true` 与清理参数。不得以提示替换服务端错误。
- [x] help/notes/示例提供双语；带 yes 的示例沿用“明确确认后执行”的标记，不默认自动补 yes。
- [x] 更新所有真正创建测试库的测试调用点，而非仅更新新用例：`rg -n 'kb.*create|"create"|knowledgeKbCreate' packages/commands/tests/e2e/knowledge packages/commands/tests/e2e/topic-routes.ts`，核对测试 own-resource 语义后添加 yes。
- [x] 运行 `vp test packages/commands/tests/knowledge/knowledge-billing.test.ts packages/commands/tests/knowledge/knowledge-kb-create.test.ts packages/commands/tests/e2e/knowledge/knowledge-kb-create.e2e.test.ts`。无 yes 的离线用例应为 7；dry-run 应为 0 且 requestJson 未调用。

## Task A3：全局机读发现

**Files — create:** `packages/runtime/src/introspect.ts`、`packages/runtime/tests/introspect.test.ts`。

**Files — modify:** `packages/core/src/types/command.ts`、`packages/runtime/src/args.ts`、`packages/runtime/src/resolve.ts`、`packages/runtime/src/registry.ts`、`packages/runtime/src/create-cli.ts`、`packages/runtime/src/index.ts`、`packages/runtime/tests/args.test.ts`、两个产品的 `tests/e2e/registry.smoke.e2e.test.ts`。

- [x] GLOBAL_FLAGS 新增 introspect switch 与双语 description，registry 的保留名校验覆盖它；业务 schema flag 不变。
- [x] parsePath 增加 hasIntrospectFlag。固定优先级 version > introspect > help > run；未知路径仍 error。保持命令路径必须在 flags 前，不新增前置 flag 寻址语法。
- [x] Resolution 增加 `{ kind: "introspect"; path: string[] }`；root/group/leaf 都能解析，不进入必填/validate/auth/confirmation/update/prepare/run。
- [x] 为 registry 提供只读 `entries(path: readonly string[]): readonly { path: readonly string[]; command: AnyCommand }[]`，返回指定 subtree 的真实注册命令；序列化器不读取 private root、不维护第二份产品命令 map。
- [x] 导出 `buildCommandSchema(registry, identity, path)` 与 `serializeCommandSchema(schema)`；顶层数据契约固定为：

```ts
interface CommandSchema {
  schema_version: 1;
  bin: string;
  version: string;
  scope: readonly string[];
  exitCodes: Record<string, number>;
  globalFlags: Record<string, unknown>;
  credentialFlags: Record<string, unknown>;
  commands: readonly {
    path: readonly string[];
    description: unknown;
    auth: string;
    usage: string;
    flags: Record<string, unknown>;
    notes: readonly unknown[];
    examples: readonly unknown[];
    risk?: unknown;
    preparation: "none" | "read-only";
    constraints: { crossFlagValidation: "not-exported" };
  }[];
}
```

上面 unknown 字段实施时直接复用 LocalizedText/FlagDef/CommandRisk 的序列化 DTO，不接受函数、settings 或任意运行状态。Flag 键为实际 `--kebab-case`；DTO 携带 type/required/valueHint/choices/description；不从 prose 推断 default。公共 flags 只出现一次，叶子 flags 包括命令自有及注入的 yes，凭证通过 auth 关联。

- [x] description/notes 保留 LocalizedText 的字符串或双语对象，输出不随用户 locale 变化。usage/examples 用 registry 中的完整 path 和 identity 补前缀；注释示例不补前缀。
- [x] 递归排序对象键、按完整路径排序命令，数组 choices/examples 保留声明顺序；UTF-8、两空格缩进、结尾换行，无时间戳。同版本同命令集字节一致；version 本身变化是合法差异。
- [x] 加入测试样例：含 apiKey 凭证域、带 yes 的风险命令、choices flag、双语 notes、必填 flag。断言缺必填也能 introspect，validate/prepare/run spies 全为零；输出不出现测试凭证字符串。

```ts
test("introspection bypasses required flags", () => {
  const command = defineCommand({
    description: "fixture",
    auth: "apiKey",
    flags: { id: { type: "string", required: true, valueHint: "<id>", description: "id" } },
    async run() {
      throw new Error("must not run");
    },
  });
  const registry = new CommandRegistry({ "doc inspect": command }, "fixture");
  expect(resolve(["doc", "inspect", "--introspect"], registry)).toEqual({
    kind: "introspect",
    path: ["doc", "inspect"],
  });
});
```

- [x] dispatch 直接输出 schema JSON，忽略 output/quiet 的渲染差异，不触发欢迎页。Command Pack 仅加载已安装的本地命令并反映实际 registry，不主动联网安装；输出稳定性限定为相同安装集合。
- [x] 执行 `vp test packages/runtime/tests/introspect.test.ts packages/runtime/tests/args.test.ts`，再跑两个产品 smoke，核对 `bl knowledge` 和 `kscli` scope/usage 正确。

## Task A4：同步维护契约

验证进度（2026-09-29）：全仓 `vp check` 无错误，3 条警告均位于未改动的 binary update/release 文件。直接 create 的创建后诊断已补真实产品删除路径：JSON `cleanup.command` 含 bin/path/args，text 对 ID 做 shell 引用；不自动带 yes，无唯一注册路径时不猜。新增失败等待双入口和文本引用测试，相关 33 项通过。扩大运行非 E2E 测试发现既有 Skill 测试的 HOME 隔离未屏蔽系统安装标记，测试层模拟 `/etc/codex` 和 `/Applications/ZCode.app` 后修复，并新增两项系统标记识别测试；产品识别逻辑不改。重跑 `vp test --exclude '**/*.e2e.test.ts'`：147 个文件、1784 个测试全部通过。此结果不替代真实云端 E2E 验收。

**Files — modify:** `docs/agents/command-add-remove.md`、`docs/agents/cli-e2e-tests.md`、`docs/agents/command-flag-change.md`。

- [x] 把 dry-run 分为静态命令的零网络预览、prepare 命令的有凭证只读计划；说明 prepare 中不得申请租约、模型推理和本地写入。
- [x] 收敛 command-add-remove 中遗留“命令自己声明 yes”的描述，统一为 runtime 注入，避免与现有 risk 规则冲突。
- [x] 写明计费确认和计划确认使用同一 code 7 契约；错误 JSON 扩展只允许 additive。
- [x] 本开发包完成后执行 `vp check`。建议提交边界：A1 运行时契约、A2 计费、A3/A4 introspect 与规范；只在进入实现阶段且验证通过后提交。

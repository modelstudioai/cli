# 模型上下架

## 触发条件

- 上线新的 Qwen / Wan / CosyVoice / 等模型
- 切换某命令的默认模型(如 `bl text chat` 默认从 qwen3.7-max 切到 qwen3.7-plus)
- 废弃旧模型

模型本身是阿里云后端在管,本仓库要做的是**让 CLI 能正确调用 + 文档/AI 入口准确反映可用模型清单**。

## 必查清单

### A. 命令实现

- [ ] `packages/commands/src/commands/<group>/<action>.ts`:
  - `--model` flag 的 description 里"default:"反映新默认值
  - 命令内部 `const model = flags.model || settings.defaultXxxModel || "<default>"` 的 fallback 字符串
  - 如果命令维护一个 supported-models 列表(如 `speech/synthesize.ts:MODEL_VOICES`),增删条目
  - 如果不同模型有不同 endpoint / 请求体形状,确保 `if (model.startsWith("xxx"))` 分支覆盖
- [ ] 模型如有特殊 endpoint,看 `packages/core/src/client/endpoints.ts`
- [ ] 如果新增的是某产品入口专属能力,确认 `packages/cli/src/commands.ts` 或其它入口 map 是否需要暴露/隐藏

### B. 类型层

- [ ] `packages/core/src/types/api.ts` 的 request/response 类型如果跟模型相关,同步字段

### C. 命令手册

- [ ] 若 `--model` 的 description 含 default,改命令后跑 `pnpm --filter bailian-cli run generate:reference` 更新 `skills/bailian-cli/reference/<group>.md` 并提交

### D. 用户面文档

- [ ] `README.md` / `README.zh.md`:
  - Quick Start 示例如使用了具体型号,确认仍可用
  - 顶部 introduction 段落如提到"Qwen-Omni"等品牌名,无需变(模型代号变化不算品牌变)

### E. 测试层

- [ ] 按 [cli-e2e-tests.md](cli-e2e-tests.md) 维护 e2e：断言不硬编码废弃模型 ID；新模型至少一条 happy-path 集成

## 完成后自查

```sh
# 默认模型走通
pnpm -F bailian-cli exec tsx src/main.ts <command> --message "test"
# 显式指定新模型
pnpm -F bailian-cli exec tsx src/main.ts <command> --model <new-model> --message "test"
```

## 常见漏点

- ✗ 改了命令默认模型,但 SKILL.md frontmatter 仍写老型号 → AI agent 调用时仍按老型号宣传
- ✗ 废弃模型时只删了代码,e2e 测试还在跑,CI 红
- ✗ 新模型 endpoint 不一致,但只改了 default,没加 endpoint 分支判断

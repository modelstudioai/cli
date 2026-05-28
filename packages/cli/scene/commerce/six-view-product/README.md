# six-view-product — 人物 + 产品多视角套图 Demo

> 该 Demo 由 `scene/commerce/template.yml`（百炼平台 Workflow，24 节点）按 **「有图主路径」** 转换而来。
> 以一张商品参考图 + 一段用户诉求为输入，依次串行生成 5 张多视角营销套图（侧视图 → 后视图 → 介绍图 → 细节特写 → 人物六视图），最后由 `script/js` 合成一段 Markdown 图集。

---

## 工作流结构

```
analyze-image (vision/describe)
       │
       ▼
prompt-side-view ──► image-side-view
                          │
                          ▼
                    prompt-back-view ──► image-back-view
                                              │
                                              ▼
                                        prompt-intro ──► image-intro
                                                              │
                                                              ▼
                                                        prompt-detail ──► image-detail
                                                                              │
                                                                              ▼
                                                                        prompt-six-view ──► image-six-view
                                                                                                  │
                                                                                                  ▼
                                                                                          compose-markdown (script/js)
```

> **为什么串行而不是并行？** 原 YAML 的边设计为 `MCP_I7HJ → LLM_gJu8 → MCP_Fd4l → …`，目的是降低同一时刻对图像生成 MCP 服务的并发压力。这里在每个 `prompt-*` 步骤上加 `dependsOn`，忠实保留这一限流行为。如果不在乎并发可以删掉这些 `dependsOn`，让 DAG 自动并行。

| 步骤 ID                                | adapter                    | 用途                            | 对应原节点                                |
| -------------------------------------- | -------------------------- | ------------------------------- | ----------------------------------------- |
| `analyze-image`                        | `vision/describe`          | 提取商品视觉特征                | LLM_5ViG                                  |
| `prompt-side-view` / `image-side-view` | `text/chat` / `image/edit` | 侧视图 prompt + 出图            | LLM_vEpw + VariableHandle_Psd3 + MCP_I7HJ |
| `prompt-back-view` / `image-back-view` | `text/chat` / `image/edit` | 后视图 prompt + 出图            | LLM_gJu8 + VariableHandle_dmfr + MCP_Fd4l |
| `prompt-intro` / `image-intro`         | `text/chat` / `image/edit` | 产品介绍图 prompt + 出图        | LLM_LB2s + VariableHandle_WAOM + MCP_2ZZp |
| `prompt-detail` / `image-detail`       | `text/chat` / `image/edit` | 产品细节特写 prompt + 出图      | LLM_duld + VariableHandle_34Jm + MCP_7ZYF |
| `prompt-six-view` / `image-six-view`   | `text/chat` / `image/edit` | 人物 + 产品六视图 prompt + 出图 | LLM_rOKf + VariableHandle_oSw8 + MCP_Nu91 |
| `compose-markdown`                     | `script/js`                | 拼接 5 张 URL 为 Markdown 图集  | Script_EzDU                               |

---

## 使用方法

> ⚠️ `--input` 跟的是 **JSON 字符串**；要从文件读取请用 `--input-file`。

```bash
cd /path/to/bailian-cli

# 用 inputs.json 中的默认输入运行
pnpm -F bailian-cli dev pipeline run scene/commerce/six-view-product/six-view-workflow.json \
  --input-file scene/commerce/six-view-product/inputs.json --verbose

# 或自定义图片与诉求
pnpm -F bailian-cli dev pipeline run scene/commerce/six-view-product/six-view-workflow.json \
  --input '{"sourceImage": "./your-product.png", "query": "户外品牌调性", "outDir": "./out"}'
```

---

## 输入参数

| 参数          | 类型   | 默认值           | 说明                                                 |
| ------------- | ------ | ---------------- | ---------------------------------------------------- |
| `sourceImage` | string | **必填**         | 商品参考图本地路径或 URL（对应 `sys.imageList[0]`）  |
| `query`       | string | `""`             | 用户自然语言补充（对应 `sys.query`）                 |
| `visionModel` | string | `qwen-vl-max`    | 视觉理解模型                                         |
| `promptModel` | string | `qwen-plus`      | 各视图 prompt 生成模型                               |
| `imageModel`  | string | `qwen-image-2.0` | 图像编辑模型（对应原 `modelstudio_qwen_image_edit`） |
| `size`        | string | `1:1`            | 输出图比例                                           |
| `outDir`      | string | `./outputs`      | 5 张套图本地保存目录                                 |

---

## 输出

```
outputs/
├── 01-side-view.png
├── 02-back-view.png
├── 03-intro.png
├── 04-detail.png
└── 05-six-view.png
```

最后一步 `compose-markdown` 的结构化输出形如：

```json
{
  "data": {
    "markdown": "![source](...)![](url1)![](url2)![](url3)![](url4)![](url5)",
    "urls": ["url1", "url2", "url3", "url4", "url5"]
  }
}
```

---

## Limitations — template.yml 中无法 / 有损转换的部分

下列原工作流能力在 bailian-cli `workflow/v1` DSL 中没有等价表达，已在转换中做了取舍：

1. **Judge 多分支节点**（`Judge_Og6K`）：DSL 没有 if/else 合流，已按用户选择丢弃 `空图 → 先文生图` 这条分支，即 `LLM_C1XO`（商品提示词生成）与 `MCP_XDjL`（Wan2.5 文生图）。当前 pipeline 强制要求传入 `sourceImage`。
2. **多轮上下文**（`shortMemory` / `contextParam` / `sys.historyList` / `contextSwitch` / `processCanOutput`）：`workflow/v1` 没有等价概念，全部丢弃。每个 `text/chat` 都是无记忆单轮请求。
3. **tryCatchConfig**（`strategy: noop` / `defaultValues`）：DSL 仅支持 `retry: { maxAttempts, backoff }`。原"出错时返回默认值并继续"语义无法保留。
4. **batchEnable / batchSize / concurrentSize**：批处理与并发度配置不存在等价，已删除。
5. **MCP `modelstudio_image_gen_wan25`（Wan2.5 文生图）**：随空图分支删除；`image/generate` 默认模型是 `qwen-image-2.0`，若未来需要 Wan2.5 需在 `model` 字段显式指定且确认 CLI 支持。
6. **MCP `serverCode` / `serverName` / `toolName`**：bailian-cli 不暴露底层 MCP 元数据，模型选择只通过 `model` 字段表达。`modelstudio_qwen_image_edit` 统一对应 `image/edit` + `model: qwen-image-2.0`。
7. **`Script_XkEv` 解析 MCP 返回 `content[0].text`**：bailian-cli 的 `image/edit` 直接输出 `/artifacts/0/url`，不再需要这段解析逻辑，原 Script 节点已移除。
8. **VariableHandle 的 `groups` / `groupStrategy` / `jsonParams` / `outputType`**：DSL 无变量节点，统一退化为 `$concat` 字符串拼接，模板分组语义丢失（同一段一致性英文约束在 5 个 image step 中重复出现以满足校验）。
9. **LLM `promptContent` 中对被丢弃节点的引用**（如 `${LLM_C1XO.result}`）：已删除，prompt 输入仅保留 `sys.query` + `LLM_5ViG.result` 两段。
10. **End 节点 `textTemplate` 与 `outputType: text`**：DSL 无 End 节点；以最后一步 `compose-markdown` 的 `data` 作为最终结果，调用方自行解析 `markdown` 或 `urls`。
11. **`sys.query` / `sys.imageList` / `sys.historyList`**：分别映射为 `$input./query` / `$input./sourceImage`；`historyList` 无映射，丢弃。
12. **`watermark` / `prompt_extend` / `n` / `size` / `negative_prompt`**：均有等价字段，已保留。

如需保留 Judge 空图分支，建议另起一个独立的 `six-view-text-only.json` 文件，以 `image/generate`（或新增 Wan2.5 adapter）替代 `MCP_XDjL`。

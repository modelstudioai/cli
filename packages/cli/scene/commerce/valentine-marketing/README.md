# Valentine Marketing Pipeline

将一张商品原图自动扩展为 4 张面向不同社交平台的情人节营销海报（小红书 / 抖音 / 朋友圈 / 时尚杂志）。

## 流程

```
analyze-product (vision/describe)
   │
   ├─► prepare-xhs-prompt (text/chat) ──► generate-xhs (image/edit, 3:4)
   ├─► prepare-douyin-prompt ─────────► generate-douyin (image/edit, 9:16)
   ├─► prepare-square-prompt ─────────► generate-square (image/edit, 1:1)
   └─► prepare-magazine-prompt ───────► generate-magazine (image/edit, 3:4)
```

- **analyze-product**：用 `qwen-vl-max` 识别商品品类、品牌、配色与卖点，作为 4 个分支的共享上下文。
- **prepare-\*-prompt**：用 `qwen3.7-max` 将商品分析重写为各平台风格的英文 image-edit prompt（粉金浪漫 / 深红奢华 / 清新梦幻 / 杂志极简）。
- **generate-\***：用 `qwen-image-2.0` 基于商品原图与对应 prompt 生成营销图，输出到 `outputs/`。

## 输入

`inputs.json` 字段：

| 字段           | 必填 | 默认             | 说明                       |
| -------------- | ---- | ---------------- | -------------------------- |
| `productImage` | 是   | —                | 商品原图（本地路径或 URL） |
| `visionModel`  | 否   | `qwen-vl-max`    | 视觉分析模型               |
| `promptModel`  | 否   | `qwen3.7-max`    | Prompt 改写模型            |
| `imageModel`   | 否   | `qwen-image-2.0` | 图像编辑模型               |
| `outDir`       | 否   | `./outputs`      | 营销图输出目录             |

## 校验

```sh
pnpm -F bailian-cli dev pipeline validate scene/commerce/valentine-marketing/valentine-marketing-workflow.json
```

## 运行

```sh
pnpm -F bailian-cli dev pipeline run \
  scene/commerce/valentine-marketing/valentine-marketing-workflow.json \
  --input-file scene/commerce/valentine-marketing/inputs.json \
  --concurrency 4 --verbose
```

运行结束后将在 `scene/commerce/valentine-marketing/outputs/` 得到 4 张图：

- `valentine_xhs.png` — 小红书 3:4 粉金浪漫风（**Happy Valentine's Day** / Glow with Love）
- `valentine_douyin.png` — 抖音 9:16 深红奢华风（**BUY FOR YOUR LOVE** / Valentine's Limited Edition）
- `valentine_square.png` — 朋友圈 1:1 清新少女风（**LOVE AT FIRST GLOW** / Be Mine - Valentine 2026）
- `valentine_magazine.png` — 杂志 3:4 极简红心风（**KISS ME, GLOW ME** / The Valentine Edit）

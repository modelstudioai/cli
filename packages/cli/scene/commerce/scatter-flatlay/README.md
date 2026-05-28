# Scatter Flat-lay · 主图居中 + 商品多角度分散平铺

> 输入一张**模特图**（模特身穿目标商品）和一张**版式参考图**（示意「原图居中 + 商品多角度分散平铺在四周」的版式样例），生成保留模特为中心主体、其身上核心服装商品以多角度分散平铺方式排布在模特周围的电商海报图。

## 工作流

```
styleReferenceImage ──► analyze-layout    (vision/describe)  ─┐
                                                              ├─► prepare-scatter-prompt (text/chat)
modelImage          ──► analyze-outfit    (vision/describe)  ─┘                │
                                                                               ▼
                                                              generate-scatter (image/edit, modelImage 为底图)
                                                                               │
                                                                               ▼
                                                                          outputs/scatter_*.png
```

- `analyze-layout`：仅分析参考图的**版式特征**（主图位置 / 周围排布规律 / 角度变化 / 留白等），不描述具体物品。
- `analyze-outfit`：仅分析模特图中**核心服装商品**的款式、颜色、印花、面料、设计细节与可平铺的多角度形态。
- `prepare-scatter-prompt`：把两份分析合成一段英文 `image/edit` prompt——「保留模特为中心主体不变 + 周围分散平铺该商品的多个角度形态」。
- `generate-scatter`：以 `modelImage` 为底图，按 prompt 生成 `n` 张分散平铺海报。

> 适配器 `image/edit` 只支持单张底图；版式参考图通过 vision 分析降维为文本特征注入 prompt，从而在不丢失版式语义的前提下兼容单图输入。

## 运行

```bash
# 校验
pnpm -F bailian-cli dev pipeline validate scene/commerce/scatter-flatlay/scatter-flatlay-workflow.json

# 执行
pnpm -F bailian-cli dev pipeline run scene/commerce/scatter-flatlay/scatter-flatlay-workflow.json \
  --input-file scene/commerce/scatter-flatlay/inputs.json --verbose
```

输出位于 `scene/commerce/scatter-flatlay/outputs/scatter_*.png`。

## 输入参数

| 字段                  | 必填 | 默认             | 说明                                             |
| --------------------- | ---- | ---------------- | ------------------------------------------------ |
| `modelImage`          | ✅   | —                | 模特图（含目标服装商品），作为画面中心主体与底图 |
| `styleReferenceImage` | ✅   | —                | 版式参考图，仅用于版面布局分析                   |
| `visionModel`         |      | `qwen-vl-max`    | 视觉分析模型                                     |
| `promptModel`         |      | `qwen3.7-max`    | 英文 prompt 合成模型                             |
| `imageModel`          |      | `qwen-image-2.0` | 图像编辑模型                                     |
| `size`                |      | `1:1`            | 输出尺寸（推荐 1:1）                             |
| `n`                   |      | `3`              | 生成数量（最多 6）                               |
| `outDir`              |      | `./outputs`      | 输出目录                                         |

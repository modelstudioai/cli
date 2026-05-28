# amazon-listing — 亚马逊电商套图生成 Demo

> 该 Demo 演示如何基于一张模特图，**一次性生成 6 张符合亚马逊电商规范的营销套图**。
> 全流程 prompt **完全由模型动态分析生成**，没有任何写死的图像描述，可适配任意品类（连衣裙、夹克、鞋、包、家居……）。
>
> 工作流：`vision/describe`（产品视觉分析）→ 6 路并行 `text/chat`（动态生成专用 prompt）→ 6 路并行 `image/edit`（生成 6 张套图）

---

## 套图清单

| 序号 | 步骤 ID             | 用途       | 说明                                            |
| ---- | ------------------- | ---------- | ----------------------------------------------- |
| 1    | `image-1-main`      | **主图**   | 白底产品展示，符合亚马逊主图规范（产品占 70%+） |
| 2    | `image-2-detail`    | **细节图** | 腰部褶皱与面料质感特写，体现工艺                |
| 3    | `image-3-lifestyle` | **场景图** | 都市咖啡厅街拍，营造生活方式氛围                |
| 4    | `image-4-slimming`  | **卖点图** | 突出修身显瘦，45° 轮廓光展现身材比例            |
| 5    | `image-5-size`      | **尺码图** | 正面标准姿势，留白可叠加尺码标注                |
| 6    | `image-6-styling`   | **搭配图** | 搭配鞋包配饰，促进交叉销售                      |

---

## 工作流结构

```
                    ┌─ prompt-1-main          ──→ image-1-main           (白底主图)
                    ├─ prompt-2-detail        ──→ image-2-detail         (面料细节)
analyze-model-image ┼─ prompt-3-lifestyle     ──→ image-3-lifestyle      (生活场景)
  (vision/describe) ├─ prompt-4-selling-point ──→ image-4-selling-point  (卖点展示)
                    ├─ prompt-5-size          ──→ image-5-size           (尺码参考)
                    └─ prompt-6-styling       ──→ image-6-styling        (搭配建议)
                       (text/chat ×6)              (image/edit ×6)
```

- **第 1 步 `analyze-model-image`**（`vision/describe`）：用 `qwen-vl-max` 分析模特图，输出结构化的视觉描述（模特特征、款式、颜色、剪裁、面料、姿势、背景、品牌等）。
- **第 2~7 步 `prompt-*`**（`text/chat` × 6，并行）：每一路接收第 1 步的视觉分析 + 自己用途的「目标说明」，由 `qwen3.7-max` **动态生成**面向当前商品的英文 prompt，并显式约束「保留模特身份与服装设计」。
- **第 8~13 步 `image-*`**（`image/edit` × 6，并行）：基于同一张模特图，引用上一步生成的 prompt，输出 6 张套图到 `out-dir`。

> 同层级的 6 路并行通过 `dependsOn` 自动调度，无需手动管理。整体耗时 ≈ 单张图生成时间 + 一次 vision + 一次 text-chat。

---

## 使用方法

> ⚠️ `--input` 后面跟的是 **JSON 字符串**；如果要从 **文件**读取请用 `--input-file`。

### 方式一：使用默认 inputs（从文件读取）

```bash
cd /path/to/bailian-cli

pnpm -F bailian-cli dev pipeline run scene/commerce/amazon-listing/amazon-listing-workflow.json \
  --input-file scene/commerce/amazon-listing/inputs.json  --verbose
```

默认会使用 `scene/commerce/amazon-listing/source.png` 作为模特图，输出到 `scene/commerce/amazon-listing/outputs/`。

### 方式二：自定义模特图（行内 JSON）

```bash
pnpm -F bailian-cli dev pipeline run scene/commerce/amazon-listing/amazon-listing-workflow.json \
  --input '{"modelImage": "./your-model.png", "outDir": "./my-listing"}'
```

### 方式三：调整尺寸

```bash
# 例如生成 3:4 适合手机端展示
pnpm -F bailian-cli dev pipeline run scene/commerce/amazon-listing/amazon-listing-workflow.json \
  --input '{"modelImage": "./model.png", "size": "3:4"}'
```

---

## 输入参数

| 参数          | 类型   | 默认值           | 说明                           |
| ------------- | ------ | ---------------- | ------------------------------ |
| `modelImage`  | string | **必填**         | 模特图本地路径或 URL           |
| `visionModel` | string | `qwen-vl-max`    | 视觉分析模型                   |
| `imageModel`  | string | `qwen-image-2.0` | 图像编辑模型                   |
| `size`        | string | `1:1`            | 输出尺寸（亚马逊主图推荐 1:1） |
| `outDir`      | string | `./outputs`      | 6 张套图输出目录               |

---

## 输出

执行完成后 `outDir` 目录下会得到：

```
outputs/
├── 01-main.png
├── 02-detail.png
├── 03-lifestyle.png
├── 04-selling-point.png
├── 05-size.png
└── 06-styling.png
```

每张图都基于模型动态分析的产品上下文生成，保留模特身份、服装设计与品牌调性，可直接上传亚马逊商品列表。

---

## 设计要点

1. **Prompt 完全动态** — 没有任何写死的「连衣裙 / 紫色 / 褶皱」字样。换一张鞋图、包图、家居图，整套 pipeline 也会自动生成对应品类的专业 prompt。
2. **职责分层** — `vision/describe` 只做视觉分析，`text/chat` 只做 prompt 工程，`image/edit` 只做出图，每一步都可独立替换或扩展。
3. **模特一致性** — 每路 `prompt-*` 的 system 都强制要求「在 prompt 末尾显式约束 keep the model's identity and outfit design exactly the same as in the reference」，避免身份漂移。
4. **DAG 并行优化** — 6 个 prompt 步骤同层并行，6 个 image 步骤同层并行，调度器自动调度。整体耗时 ≈ 1×vision + 1×chat + 1×image。

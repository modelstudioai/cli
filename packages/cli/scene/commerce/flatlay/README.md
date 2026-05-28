# flatlay — 电商商品平铺图生成 Demo

> 该 Demo 演示如何基于一张模特图，**自动提取模特身上所有服装服饰单品并生成电商商品平铺图（flat-lay / knolling）**。
> 全流程 prompt **完全由模型动态分析生成**，没有任何写死的服饰描述，可适配任意品类（连衣裙、套装、外套、配饰组合……）。
>
> 工作流：`vision/describe`（服饰单品分析）→ `text/chat`（动态生成英文 flat-lay prompt）→ `image/edit`（生成 N 张商品平铺图）

---

## 工作流结构

```
analyze-outfit          ──→ prepare-flatlay-prompt        ──→ generate-flatlay
(vision/describe)           (text/chat)                       (image/edit, n=3)
逐项识别服饰单品              生成英文 flat-lay prompt           白底俯视平铺图 ×N
```

- **第 1 步 `analyze-outfit`**（`vision/describe`）：用 `qwen-vl-max` 仔细识别模特身上的每一件服装、鞋履、包袋、配饰，并按单品输出结构化分析（类型、颜色、面料、设计细节）。
- **第 2 步 `prepare-flatlay-prompt`**（`text/chat`）：用 `qwen3.7-max` 基于上一步的视觉分析，动态生成一段面向当前服饰组合的英文 flat-lay prompt，并显式约束「保留每件单品的颜色、面料、印花、设计与参考图严格一致；只展示单品，不出现模特」。
- **第 3 步 `generate-flatlay`**（`image/edit`）：基于同一张模特图作为参考，使用上一步生成的 prompt，输出 N 张白底商品平铺图到 `outDir`。

---

## 使用方法

> ⚠️ `--input` 后面跟的是 **JSON 字符串**；如果要从 **文件**读取请用 `--input-file`。

### 方式一：使用默认 inputs（从文件读取）

```bash
cd /path/to/bailian-cli

pnpm -F bailian-cli dev pipeline run scene/commerce/flatlay/flatlay-workflow.json \
  --input-file scene/commerce/flatlay/inputs.json --verbose
```

默认会使用 `scene/commerce/flatlay/model.png` 作为模特图，输出到 `scene/commerce/flatlay/outputs/`。

### 方式二：自定义模特图（行内 JSON）

```bash
pnpm -F bailian-cli dev pipeline run scene/commerce/flatlay/flatlay-workflow.json \
  --input '{"modelImage": "./your-model.png", "n": 4, "outDir": "./my-flatlay"}'
```

### 方式三：调整尺寸

```bash
# 例如生成 3:4 适合手机端展示
pnpm -F bailian-cli dev pipeline run scene/commerce/flatlay/flatlay-workflow.json \
  --input '{"modelImage": "./model.png", "size": "3:4"}'
```

---

## 输入参数

| 参数          | 类型   | 默认值           | 说明                       |
| ------------- | ------ | ---------------- | -------------------------- |
| `modelImage`  | string | **必填**         | 模特图本地路径或 URL       |
| `visionModel` | string | `qwen-vl-max`    | 视觉分析模型               |
| `promptModel` | string | `qwen3.7-max`    | 文本（prompt 工程）模型    |
| `imageModel`  | string | `qwen-image-2.0` | 图像编辑模型               |
| `size`        | string | `1:1`            | 输出尺寸                   |
| `n`           | number | `3`              | 生成的平铺图数量（最大 6） |
| `outDir`      | string | `./outputs`      | 平铺图输出目录             |

---

## 输出

执行完成后 `outDir` 目录下会得到：

```
outputs/
├── flatlay_001.png
├── flatlay_002.png
└── flatlay_003.png
```

每张图都基于模型动态分析的服饰组合生成，保留所有单品的颜色、款式与设计细节，可直接用于电商商品详情页或上新主图。

---

## 设计要点

1. **Prompt 完全动态** — 没有任何写死的「连衣裙 / 紫色 / 褶皱」字样。换一张鞋图、配饰图、套装图，整套 pipeline 也会自动生成对应品类的 flat-lay prompt。
2. **职责分层** — `vision/describe` 只做单品识别，`text/chat` 只做 prompt 工程，`image/edit` 只做出图，每一步都可独立替换或扩展。
3. **单品一致性** — `text/chat` 的 system 强制要求在 prompt 末尾显式约束「保留每件单品的颜色、面料、设计与参考图一致；只展示单品，不出现模特」，避免产品漂移。
4. **简化版 vs amazon-listing** — 与同目录的 `amazon-listing` demo（6 路并行生成 6 张营销套图）相比，本 demo 是更轻量的单链路 flat-lay 生成，专注于「从模特穿搭还原出可平铺展示的商品组」这一典型电商素材生产场景。

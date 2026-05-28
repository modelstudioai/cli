# outfit-swap — 模特换装 Pipeline

> 该 Demo 演示如何基于一张已穿着的模特图，**自动将模特身上的服装替换为目标款式**（如「灰色T恤 → 红色丝质晚礼服」），同时保持模特的姿势、面部、发型、肤色、光照与背景完全不变。
>
> 工作流：`vision/describe`（模特与原穿搭分析）→ `text/chat`（动态生成英文换装 prompt）→ `image/edit`（生成 N 张换装效果图）

---

## 工作流结构

```
analyze-model          ──→ prepare-swap-prompt          ──→ generate-outfit-swap
(vision/describe)          (text/chat)                      (image/edit, n=2)
分析模特特征 / 原穿搭       结合目标服装生成英文 prompt      生成换装效果图 ×N
/ 姿势 / 光照 / 背景
```

- **第 1 步 `analyze-model`**（`vision/describe`）：用 `qwen-vl-max` 分析模特外貌（肤色、发型、面部）、当前穿着、姿势朝向、拍摄环境与光照，作为后续约束依据。
- **第 2 步 `prepare-swap-prompt`**（`text/chat`）：用 `qwen3.7-max` 基于模特分析 + 用户指定的目标服装文案，动态生成换装英文 prompt，显式约束「面部 / 发型 / 姿势 / 光照 / 背景与原图一致，只替换服装，且新服装质感高级」。
- **第 3 步 `generate-outfit-swap`**（`image/edit`）：以原模特图为底图、上一步 prompt 为指令，调用 `qwen-image-2.0` 输出 N 张换装效果图到 `outDir`。

---

## 使用方法

### 方式一：使用默认 inputs（从文件读取）

```bash
cd /path/to/bailian-cli

pnpm -F bailian-cli dev pipeline run scene/commerce/outfit-swap/outfit-swap-workflow.json \
  --input-file scene/commerce/outfit-swap/inputs.json --verbose
```

默认会使用 `scene/commerce/outfit-swap/sample-model.png` 作为模特原图，将灰色T恤替换为「深红色丝缎落地晚礼服」，输出到 `scene/commerce/outfit-swap/outputs/`。

### 方式二：自定义目标服装（行内 JSON）

```bash
pnpm -F bailian-cli dev pipeline run scene/commerce/outfit-swap/outfit-swap-workflow.json \
  --input '{"modelImage":"./sample-model.png","targetOutfit":"白色蕾丝婚纱，A字裙摆，长拖尾","n":3}'
```

### 方式三：换其他风格

```bash
# 替换为正装
pnpm -F bailian-cli dev pipeline run scene/commerce/outfit-swap/outfit-swap-workflow.json \
  --input '{"modelImage":"./sample-model.png","targetOutfit":"藏青色羊毛西装套装，搭配白衬衫与系带乐福鞋"}'

# 替换为休闲国潮
pnpm -F bailian-cli dev pipeline run scene/commerce/outfit-swap/outfit-swap-workflow.json \
  --input '{"modelImage":"./sample-model.png","targetOutfit":"米白色棉麻连衣裙，七分袖，腰带收腰，质地自然"}'
```

---

## 输入参数

| 参数           | 类型   | 默认值           | 说明                                               |
| -------------- | ------ | ---------------- | -------------------------------------------------- |
| `modelImage`   | string | **必填**         | 模特原图（本地路径或 URL），作为换装底图           |
| `targetOutfit` | string | **必填**         | 目标服装的文字描述（中文或英文，越具体效果越稳定） |
| `visionModel`  | string | `qwen-vl-max`    | 视觉分析模型                                       |
| `promptModel`  | string | `qwen3.7-max`    | 文本（prompt 工程）模型                            |
| `imageModel`   | string | `qwen-image-2.0` | 图像编辑模型                                       |
| `size`         | string | `1:1`            | 输出尺寸（推荐 `1:1` 或 `3:4`）                    |
| `n`            | number | `2`              | 生成的换装效果图数量（最大 6）                     |
| `outDir`       | string | `./outputs`      | 输出目录                                           |

---

## 输出

执行完成后 `outDir` 目录下会得到：

```
outputs/
├── outfit-swap_001.png
└── outfit-swap_002.png
```

每张图都基于动态分析后的换装 prompt 生成，保留模特的人物特征与拍摄环境，仅替换服装款式与面料。

---

## 设计要点

1. **Prompt 完全动态** — 没有任何写死的服装款式描述，仅通过 `targetOutfit` 文案传入意图，pipeline 会结合模特原图分析自动合成精确 prompt，可适配任意换装目标（礼服、西装、汉服、运动服、婚纱…）。
2. **强一致性约束** — `text/chat` 的 system 强制在 prompt 末尾追加 `Keep the model face, hairstyle, skin tone, pose, arm position, body angle, lighting direction and background EXACTLY the same as the input image. Only change the clothing.`，确保人物身份与画面氛围不漂移。
3. **职责分层** — `vision/describe` 只做模特解析，`text/chat` 只做 prompt 工程，`image/edit` 只做出图，三步可独立替换或扩展。
4. **与 `dress-on-model/` 的关系** —
   - `dress-on-model`：**单品图 → 模特上身图**（从衣服开始，生成穿着该衣服的模特）
   - `outfit-swap`：**模特上身图 → 换装后模特图**（从已穿着的模特开始，仅替换服装款式）

   两条 pipeline 互补，可组合形成完整的电商服饰素材生产链。

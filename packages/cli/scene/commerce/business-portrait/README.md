# business-portrait — 日常照片转专业商务形象照 Demo

> 输入一张**普通便装人像照**（如灰 T 恤、休闲装），自动转换为**专业商务形象照**：白衬衫 + 西装外套 + 灰色渐变背景 + 影棚级光线。
>
> 工作流：单步 `image/edit`，一次调用完成换装、换背景、补光全流程。

---

## 工作流结构

```
inputImage ──→ generate-business-portrait (image/edit) ──→ outputs/business-portrait.png
```

| 步骤           | step id                      | 功能                                                |
| -------------- | ---------------------------- | --------------------------------------------------- |
| 商务形象照转换 | `generate-business-portrait` | 换装（衬衫+西装）、换背景（灰色渐变）、专业棚拍光线 |

---

## 使用方法

> ⚠️ `--input` 后面跟的是 **JSON 字符串**；如果要从**文件**读取请用 `--input-file`。

### 方式一：使用默认 inputs（即本目录下的 input.png）

```bash
cd /path/to/bailian-cli

pnpm -F bailian-cli dev pipeline run scene/commerce/business-portrait/business-portrait-workflow.json \
  --input-file scene/commerce/business-portrait/inputs.json --verbose
```

默认输入是本目录下的 `input.png`（灰 T 恤女性原图），转换结果会保存到 `outputs/business-portrait.png`。

### 方式二：自定义图片（行内 JSON）

```bash
pnpm -F bailian-cli dev pipeline run scene/commerce/business-portrait/business-portrait-workflow.json \
  --input '{"inputImage": "./your-photo.png", "outDir": "./my-output"}'
```

### 方式三：一次生成多张（备选）

```bash
pnpm -F bailian-cli dev pipeline run scene/commerce/business-portrait/business-portrait-workflow.json \
  --input '{"inputImage": "./input.png", "n": 3}'
```

### 方式四：自定义风格描述

不满足于默认的「白衬衫 + 深色西装 + 灰渐变」商务风？传入 `prompt` 即可完全覆盖：

```bash
# 黑色西装 + 暖色背景
pnpm -F bailian-cli dev pipeline run scene/commerce/business-portrait/business-portrait-workflow.json \
  --input '{"inputImage": "./input.png", "prompt": "Transform into a professional business portrait with a black tailored suit and a crisp white shirt. Warm beige gradient background. Keep face, hairstyle, pose EXACTLY the same. Studio lighting, sharp focus, executive headshot photography."}'

# 浅色西装 + 蓝色背景
pnpm -F bailian-cli dev pipeline run scene/commerce/business-portrait/business-portrait-workflow.json \
  --input '{"inputImage": "./input.png", "prompt": "Light beige business suit with white shirt, soft blue gradient studio background, professional corporate headshot, keep face and pose unchanged."}'
```

### 方式五：竖版证件照尺寸

```bash
pnpm -F bailian-cli dev pipeline run scene/commerce/business-portrait/business-portrait-workflow.json \
  --input '{"inputImage": "./input.png", "size": "3:4"}'
```

---

## 输入参数

| 参数             | 类型   | 默认值           | 说明                                                                                                                            |
| ---------------- | ------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `inputImage`     | string | **必填**         | 待转换的人像照片本地路径或 URL                                                                                                  |
| `imageModel`     | string | `qwen-image-2.0` | 图像编辑模型                                                                                                                    |
| `size`           | string | `1:1`            | 输出尺寸比例（证件照推荐 1:1，半身竖版用 3:4）                                                                                  |
| `n`              | number | `1`              | 生成数量（最大 6）                                                                                                              |
| `outDir`         | string | `./outputs`      | 输出目录                                                                                                                        |
| `prompt`         | string | 内置商务 prompt  | **可选**。自定义换装/换背景描述。不传则使用内置「白衬衫+深色西装+灰渐变背景」组合；支持中英文，建议英文以获得更稳定的影棚级效果 |
| `negativePrompt` | string | 内置反面约束     | **可选**。负面提示词，不传则使用内置约束（排除卡通、变形、便装、杂乱背景等）                                                    |

> **Prompt 说明**：默认 prompt 强调 `Keep the face, hairstyle, skin tone, pose ... EXACTLY the same`，确保只换衣服和背景，**保持人物身份特征不变**，符合证件照/职业照的核心需求。

---

## 输出

执行完成后 `outDir` 目录下会得到 `n` 张商务形象照：

```
outputs/
├── business-portrait.png         # n=1 时
├── business-portrait_1.png       # n>1 时
├── business-portrait_2.png
└── ...
```

---

## 参考效果

- 输入示例：`input.png`（灰 T 恤休闲半身照）
- 期望效果示例：`sample-output.png`（白衬衫 + 深色西装 + 灰色渐变背景）

---

## 设计要点

1. **单步高效** — 一次 `image/edit` 调用同时完成换装、换背景、补光，无需多步串联，延迟低、可控性高。
2. **身份保护** — Prompt 显式强调 `Keep face, hairstyle, skin tone, pose, body angle, head orientation EXACTLY the same`，避免模型把人脸换成另一个人。
3. **英文 Prompt** — 使用英文描述「LinkedIn-style executive portrait / corporate photography / studio lighting」，比中文「商务照」更能触发模型的影棚级棚拍质感。
4. **反向约束** — negative-prompt 排除 `casual clothes, t-shirt, hoodie, jeans, busy background, outdoor scene` 等关键词，防止模型残留原 T 恤纹理或杂乱背景。
5. **可扩展** — 如果需要严格保持证件照规格（如蓝底/红底标准证件照），可复制本 pipeline 并调整 prompt 的背景颜色描述。

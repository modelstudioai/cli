# photo-enhance — 风景照片画质修复与超清增强 Demo

> 输入一张**模糊或低质量的风景照片**，自动进行画质修复、超清放大、色彩增强，输出清晰锐利、色彩鲜艳的高清风景图。
>
> 工作流：单步 `image/edit`，一次调用完成降噪、锐化、色彩增强全流程。

---

## 工作流结构

```
inputImage ──→ enhance-photo (image/edit) ──→ outputs/enhanced.png
```

| 步骤             | step id         | 功能                                    |
| ---------------- | --------------- | --------------------------------------- |
| 画质修复超清增强 | `enhance-photo` | 锐化细节、提升饱和度、消除模糊、4K 超清 |

---

## 使用方法

> ⚠️ `--input` 后面跟的是 **JSON 字符串**；如果要从**文件**读取请用 `--input-file`。

### 方式一：使用默认 inputs（即本目录下的 input.png）

```bash
cd /path/to/bailian-cli

pnpm -F bailian-cli dev pipeline run scene/commerce/photo-enhance/photo-enhance-workflow.json \
  --input-file scene/commerce/photo-enhance/inputs.json --verbose
```

默认输入是本目录下的 `input.png`，增强结果会保存到 `outputs/enhanced.png`。

### 方式二：自定义图片（行内 JSON）

```bash
pnpm -F bailian-cli dev pipeline run scene/commerce/photo-enhance/photo-enhance-workflow.json \
  --input '{"inputImage": "./your-landscape.png", "outDir": "./my-output"}'
```

### 方式三：换竖版尺寸

```bash
pnpm -F bailian-cli dev pipeline run scene/commerce/photo-enhance/photo-enhance-workflow.json \
  --input '{"inputImage": "./your-landscape.png", "size": "3:4"}'
```

### 方式四：自定义风格描述

不满足于默认的"自然修复"风格？传入 `prompt` 参数即可完全覆盖，用中英文均可：

```bash
# 日落暖色调
pnpm -F bailian-cli dev pipeline run scene/commerce/photo-enhance/photo-enhance-workflow.json \
  --input '{"inputImage": "./input.png", "prompt": "日落时分，暖橙色阳光洒在山顶和湖面，天空呈现渐变的橙红色，湖水倒映金色余晖，自然摄影风格"}'

# 蓝调晨雾风格
pnpm -F bailian-cli dev pipeline run scene/commerce/photo-enhance/photo-enhance-workflow.json \
  --input '{"inputImage": "./input.png", "prompt": "清晨薄雾弥漫，山谷间缭绕白雾，湖面平静如镜，清冷蓝调，电影级自然光摄影"}'

# 同时自定义 negativePrompt
pnpm -F bailian-cli dev pipeline run scene/commerce/photo-enhance/photo-enhance-workflow.json \
  --input '{"inputImage": "./input.png", "prompt": "Dramatic sunset over the mountains", "negativePrompt": "fog, mist, cold tones, overcast"}'
```

---

## 输入参数

| 参数             | 类型   | 默认值           | 说明                                                                                                                |
| ---------------- | ------ | ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| `inputImage`     | string | **必填**         | 待修复的风景照片本地路径或 URL                                                                                      |
| `imageModel`     | string | `qwen-image-2.0` | 图像编辑模型                                                                                                        |
| `size`           | string | `16:9`           | 输出尺寸（风景横版推荐 16:9，竖版使用 3:4）                                                                         |
| `outDir`         | string | `./outputs`      | 增强结果输出目录                                                                                                    |
| `prompt`         | string | 内置修复 prompt  | **可选**。自定义风格描述，不传则使用内置的自然风光修复 prompt；支持中英文，可描述任意期望风格（日落、晨雾、蓝调等） |
| `negativePrompt` | string | 内置反 HDR 约束  | **可选**。负面提示词，不传则使用内置的反 HDR / 反过饱和关键词；传入时完全替换默认值                                 |

> **Prompt 说明**：工作流使用**英文 prompt + negative-prompt** 组合策略，明确指定"自然 DSLR 照片风格、不要 HDR、不要过饱和"，通过 negative-prompt 屏蔽绘画感和纹理伪影，确保输出是自然摄影效果而非 AI 艺术风格。

---

## 输出

执行完成后 `outDir` 目录下会得到 1 张增强后的高清风景图：

```
outputs/
└── enhanced.png    # 画质修复 + 超清增强结果
```

---

## 设计要点

1. **单步高效** — 一次 `image/edit` 调用同时完成降噪、锐化、色彩还原，无需多步串联。
2. **英文 Prompt + Negative Prompt** — 使用英文 prompt 描述"自然 DSLR 照片风格"，配合 negative-prompt 明确排除 HDR、过饱和、水面纹理伪影等问题，是风景照修复的核心 prompt 工程策略，中文过度增强类 prompt 会导致模型生成 HDR 艺术风格而非真实摄影效果。
3. **反向约束** — negative-prompt 中需包含 `painting, HDR, oversaturated, vivid, dark border, water ripple artifacts` 等关键词，防止模型过度创作。
4. **尺寸灵活** — 默认 16:9 横版适配风景照，可按需切换 3:4 / 1:1 等电商常用比例。
5. **可扩展** — 如需多风格对比（自然光 / 蓝调晨雾 / 日落暖色），可复制 `enhance-photo` 步骤并分别调整 prompt，升级为多步并行 pipeline。

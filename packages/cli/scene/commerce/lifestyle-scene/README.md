# lifestyle-scene — 白底商品转生活美学场景图 Demo

> 输入一张**白底商品图**（如陶瓷杯、护肤品、家居用品等），生成 **1 张**高级感商品场景图，保持商品本体不变，仅替换背景与场景氛围。
>
> 支持传入自然语言 `description` 完全自定义场景描述；不传则使用内置的通用生活美学默认 prompt。

---

## 工作流结构

```
productImage ──→ generate-scene (image/edit) ──→ outputs/lifestyle_scene.png
```

单步骤 `image/edit`，根据是否传入 `description` 决定 prompt 来源：

| 情况                 | prompt 行为                       |
| -------------------- | --------------------------------- |
| 未传 `description`   | 使用内置默认生活美学场景 prompt   |
| 传入了 `description` | 直接使用传入的描述作为完整 prompt |

---

## 使用方法

> ⚠️ `--input` 后面跟的是 **JSON 字符串**；如果要从**文件**读取请用 `--input-file`。

### 方式一：使用默认 inputs（即本目录下的 cup.png）

```bash
cd /path/to/bailian-cli

pnpm -F bailian-cli dev pipeline run scene/commerce/lifestyle-scene/lifestyle-scene-workflow.json \
  --input-file scene/commerce/lifestyle-scene/inputs.json --verbose
```

默认输入是本目录下的 `cup.png`（一只白底陶瓷杯），输出会保存到 `scene/commerce/lifestyle-scene/outputs/`。

### 方式二：自定义商品图（行内 JSON）

```bash
pnpm -F bailian-cli dev pipeline run scene/commerce/lifestyle-scene/lifestyle-scene-workflow.json \
  --input '{"productImage": "./reference.png", "outDir": "./my-output"}'
```

### 方式三：传入自然语言描述，自定义场景

```bash
pnpm -F bailian-cli dev pipeline run scene/commerce/lifestyle-scene/lifestyle-scene-workflow.json \
  --input '{"productImage": "./reference.png", "description": "商品放在日式侘寂风的原木茶几上，背景是和纸窗透入的柔和光线，旁边摆着一只粗陶茶杯和几枝枯枝"}'
```

`description` 传入后会**完全替代**默认 prompt，你可以用自然语言随意描述想要的场景。

### 方式四：换横版尺寸用于网页 banner

```bash
pnpm -F bailian-cli dev pipeline run scene/commerce/lifestyle-scene/lifestyle-scene-workflow.json \
  --input '{"productImage": "./reference.png", "size": "16:9"}'
```

---

## 输入参数

| 参数           | 类型   | 默认值           | 说明                                                         |
| -------------- | ------ | ---------------- | ------------------------------------------------------------ |
| `productImage` | string | **必填**         | 白底商品原图的本地路径或 URL                                 |
| `imageModel`   | string | `qwen-image-2.0` | 图像编辑模型                                                 |
| `size`         | string | `3:4`            | 输出尺寸（电商生活场景推荐 3:4，banner 16:9）                |
| `outDir`       | string | `./outputs`      | 输出目录                                                     |
| `description`  | string | _(空)_           | 自然语言场景描述；传入后直接作为 prompt，不传则走默认 prompt |

---

## 输入 / 参考效果

- `cup.png` — 白底陶瓷杯原图（默认输入）
- `reference.png` — 期望产出效果参考图（生活美学场景图样例）

执行完成后 `outDir` 目录下会得到 1 张场景图：

```
outputs/
└── lifestyle_scene.png
```

---

## 设计要点

1. **单步直出** — 一个 `image/edit` 步骤，输入商品图 + prompt，输出 1 张场景图，简洁高效。
2. **prompt 可控** — 通过 `description` 参数可以用自然语言完全自定义场景描述，灵活度最大化。
3. **商品保真** — 默认 prompt 明确约束「保持原商品完全不变，仅替换背景与场景」，避免商品本体被改动。
4. **可扩展** — 如需批量多方向生成，可复制步骤或在外层脚本循环传入不同 description。

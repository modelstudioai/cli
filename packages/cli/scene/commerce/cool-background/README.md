# cool-background — 商品图清凉背景三方向 Demo

> 输入一张**商品原图**，并行生成 **3 张不同创意方向**的清凉感背景商业图，保持商品本体不变，仅替换背景氛围。
>
> 工作流：3 路并行的 `image/edit`，每路一个固定方向（冰爽特写 / 夏日海滩 / 山间清泉）。

---

## 工作流结构

```
                ┌──→ direction-ice     (image/edit) ──→ outputs/dir1_ice.png
productImage ───┼──→ direction-beach   (image/edit) ──→ outputs/dir2_beach.png
                └──→ direction-nature  (image/edit) ──→ outputs/dir3_nature.png
```

三路完全独立，运行时会被并发调度。

| 方向                  | step id            | 调性                 | 适用场景                |
| --------------------- | ------------------ | -------------------- | ----------------------- |
| 方向一·极致冰爽特写   | `direction-ice`    | 冷峻、戏剧化、产品级 | 电商主图、详情页 banner |
| 方向二·夏日海滩度假   | `direction-beach`  | 明亮、欢快、暖阳     | 夏季营销、社交媒体      |
| 方向三·山间清泉自然系 | `direction-nature` | 天然、清新、电影感   | 健康定位、品牌形象      |

---

## 使用方法

> ⚠️ `--input` 后面跟的是 **JSON 字符串**；如果要从**文件**读取请用 `--input-file`。

### 方式一：使用默认 inputs（即本目录下的 cola.png）

```bash
cd /path/to/bailian-cli

pnpm -F bailian-cli dev pipeline run scene/commerce/cool-background/cool-background-workflow.json \
  --input-file scene/commerce/cool-background/inputs.json --verbose
```

默认输入是本目录下的 `scene/commerce/cool-background/cola.png`，输出会保存到 `scene/commerce/cool-background/outputs/`。

### 方式二：自定义商品图（行内 JSON）

```bash
pnpm -F bailian-cli dev pipeline run scene/commerce/cool-background/cool-background-workflow.json \
  --input '{"productImage": "./your-product.png", "outDir": "./my-output"}'
```

### 方式三：换横版尺寸用于网页 banner

```bash
pnpm -F bailian-cli dev pipeline run scene/commerce/cool-background/cool-background-workflow.json \
  --input '{"productImage": "./your-product.png", "size": "16:9"}'
```

---

## 输入参数

| 参数           | 类型   | 默认值           | 说明                                           |
| -------------- | ------ | ---------------- | ---------------------------------------------- |
| `productImage` | string | **必填**         | 商品原图的本地路径或 URL                       |
| `imageModel`   | string | `qwen-image-2.0` | 图像编辑模型                                   |
| `size`         | string | `3:4`            | 输出尺寸（电商海报推荐 3:4，banner 推荐 16:9） |
| `outDir`       | string | `./outputs`      | 三个方向背景图共同的输出目录                   |

---

## 输出

执行完成后 `outDir` 目录下会得到 3 张不同方向的背景图：

```
outputs/
├── dir1_ice.png       # 冰爽特写
├── dir2_beach.png     # 夏日海滩
└── dir3_nature.png    # 山间清泉
```

---

## 设计要点

1. **三路并行** — 三个 `image/edit` 步骤都只依赖 `$input` 上的商品原图，没有任何 `$from`，因此被调度器自动并发执行，速度远快于串行。
2. **方向差异化** — 三条 prompt 分别覆盖「冷调棚拍 / 暖调实景 / 自然光实景」三种主流商业摄影路线，便于一次生成、多场景挑选。
3. **商品保真** — 每条 prompt 都明确约束「保持原商品（瓶身、标签、配色与品牌元素）完全不变，仅替换背景」，避免商品本体被改动。
4. **可扩展** — 想加方向（如黑金奢华、赛博朋克霓虹），只需复制一个 `direction-*` 步骤换 prompt 与 `out-prefix` 即可，无需调整其它步骤。

# Dress-on-Model Pipeline (裙装上身合成)

将一张裙装/服饰参考图，自动转成一位风格匹配的女模特穿着该裙装的高端时装写真图（含首饰、鞋履、场景背景），可用于电商详情页主图与品牌 lookbook。

## 流程概览

```
裙装参考图 ──▶ analyze-dress (vision/describe)
                       │  风格 / 版型 / 材质 / 配色 / 设计细节 / 适配气质 / 场景 / 推荐搭配
                       ▼
              prepare-model-prompt (text/chat)
                       │  生成英文模特上身合成 prompt
                       ▼
                generate-model (image/edit)
                       │  以参考图为底图 + 英文 prompt → 多张模特上身写真
                       ▼
                  ./outputs/model-dress_*.png
```

## 输入

| 字段          | 是否必填 | 默认值           | 说明                              |
| ------------- | -------- | ---------------- | --------------------------------- |
| `dressImage`  | ✅       | —                | 裙装/服饰参考图（本地路径或 URL） |
| `visionModel` | ❌       | `qwen-vl-max`    | 视觉分析模型                      |
| `promptModel` | ❌       | `qwen3.7-max`    | Prompt 生成文本模型               |
| `imageModel`  | ❌       | `qwen-image-2.0` | 图像编辑模型                      |
| `size`        | ❌       | `3:4`            | 模特写真推荐 3:4 竖版             |
| `n`           | ❌       | `3`              | 出图数量（最大 6）                |
| `outDir`      | ❌       | `./outputs`      | 输出目录                          |
| `outPrefix`   | ❌       | `model-dress`    | 输出文件名前缀                    |

## 运行

```bash
# 在仓库根目录
pnpm -F bailian-cli dev pipeline run \
  scene/commerce/dress-on-model/dress-on-model-workflow.json \
  --input-file scene/commerce/dress-on-model/inputs.json
```

或直接传 JSON 字符串：

```bash
pnpm -F bailian-cli dev pipeline run \
  scene/commerce/dress-on-model/dress-on-model-workflow.json \
  --input '{"dressImage":"./clothes.png","n":3}'
```

## 校验

```bash
pnpm -F bailian-cli dev pipeline validate \
  scene/commerce/dress-on-model/dress-on-model-workflow.json
```

## 与 `flatlay/` 的关系

`flatlay-workflow.json` 做的是**反向**任务：模特上身图 → 商品平铺图。

`dress-on-model-workflow.json` 做的是**正向**任务：商品参考图 → 模特上身图。

两条 pipeline 可组成完整的服饰电商素材闭环。

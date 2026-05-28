# Poster i18n Localization Pipeline

把任意一张英文海报本地化为 **简体中文 / 日文 / 韩文** 三个版本，并把价格按当前大致汇率转换为对应货币（CNY / JPY / KRW），保持原图人物、构图、配色、版式不变。

## 文件

| 文件                        | 用途                                                         |
| --------------------------- | ------------------------------------------------------------ |
| `poster-i18n-workflow.json` | Pipeline 定义（`workflow/v1`，7 个步骤）                     |
| `inputs.json`               | 默认运行参数（指向 `scene/commerce/poster-i18n/poster.png`） |
| `outputs/`                  | 三语本地化海报输出目录                                       |

## DAG

```
analyze-poster (vision/describe)
        │
        ├─→ prepare-zh-prompt (text/chat) ──→ generate-zh (image/edit)
        ├─→ prepare-ja-prompt (text/chat) ──→ generate-ja (image/edit)
        └─→ prepare-ko-prompt (text/chat) ──→ generate-ko (image/edit)
```

1. **analyze-poster** — `qwen-vl-max` 解析海报，按 `[TITLE]/[SUBTITLE]/[PRODUCT]/[PRICE_CURRENCY]/[PRICE_AMOUNT]/[PRICE_RAW]/[STYLE]/[OTHER_TEXT]` 结构化输出。
2. **prepare-{zh,ja,ko}-prompt** — `qwen3.7-max` 基于结构化分析生成对应语言的 image-edit prompt，要求：精确翻译所有文案、按汇率转换价格为 CNY / JPY / KRW、保留版式与字体风格、不残留英文。
3. **generate-{zh,ja,ko}** — `qwen-image-2.0` 在原图上执行文字替换，输出到 `out-dir`，文件前缀 `poster-zh / poster-ja / poster-ko`。

## 运行

```bash
# 校验
pnpm -F bailian-cli dev pipeline validate scene/commerce/poster-i18n/poster-i18n-workflow.json

# 用默认 inputs 运行
pnpm -F bailian-cli dev pipeline run scene/commerce/poster-i18n/poster-i18n-workflow.json \
  --input-file scene/commerce/poster-i18n/inputs.json --verbose

# 或者运行时覆盖参数（任意海报均可）
pnpm -F bailian-cli dev pipeline run scene/commerce/poster-i18n/poster-i18n-workflow.json \
  --input posterImage=path/to/another-poster.png \
  --input outDir=scene/commerce/poster-i18n/outputs
```

## 通用性

Pipeline 不硬编码任何海报内容。任何带价格的英文电商海报都可以复用：
`vision/describe` 自动抽取原文与货币 → `text/chat` 自动翻译 + 折算 → `image/edit` 输出本地化版本。

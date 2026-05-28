<div align="center">

<img src="https://img.alicdn.com/imgextra/i1/O1CN01RSQFUD1jN5IBzHORt_!!6000000004535-2-tps-2440-521.png" alt="Aliyun Model Studio CLI" width="420" />

# >\_ Aliyun Model Studio CLI

**阿里云百炼 (DashScope) AI 平台命令行工具**

[![npm version](https://img.shields.io/npm/v/bailian-cli?color=0969da&label=npm)](https://www.npmjs.com/package/bailian-cli)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.12-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)

[阿里云百炼 CLI 官方主页](https://bailian.console.aliyun.com/cli) · [English](https://unpkg.com/bailian-cli/README.md) · [API 文档](https://help.aliyun.com/zh/model-studio/) · [获取 API Key](https://bailian.console.aliyun.com/cn-beijing/?tab=app#/api-key)

---

_千问对话、图像生成与编辑、视频生成与编辑、图像理解、语音合成与识别、_
_应用调用、记忆管理、知识检索、联网搜索 — 一行命令，触达所有 AI 能力。_

_专为 AI Agent 打造，每个命令均可作为结构化工具调用。_

</div>

## 功能特性

让您的 AI Agent 开箱即具备以下能力，并可在复杂任务中自动组合调用：

- **文本对话** — Qwen3.7-max：Agentic coding、前端编程、Vibe coding 等能力显著增强
- **全模态对话** — 文本 + 图像 + 音频 + 视频全模态支持
- **图像生成与编辑** — Qwen-Image 2.0：专业文字渲染、真实质感、强语义遵循、多图合成
- **视频生成与编辑** — HappyHorse-1.0 系列，支持文生 / 图生 / 参考生（最多 9 张图参考）/ 自然语言视频编辑
- **语音合成与识别** — CosyVoice 实时流式合成，5-20s 样本即可克隆；FunAudio-ASR 覆盖 30 种语种，含汉语七大方言与 20+ 口音官话
- **图像与视频理解** — Qwen-VL：长视频解析、复杂图表与文档识别、视觉推理、多语种 OCR
- **知识库与记忆库** — 多模态 RAG 检索 + 跨会话记忆，提供个性化连贯对话体验
- **应用调用** — 调用已发布在阿里云百炼平台上的智能体与工作流应用
- **联网搜索** — 实时互联网信息检索，提升回答准确性及时效性
- **控制台能力** — 浏览百炼应用（`app list`），查询模型免费额度（`usage free`）
- **本地文件自动上传** — 所有 URL 参数同时支持本地路径，免费临时存储 48 小时

<p align="center">
  <img src="https://img.alicdn.com/imgextra/i1/O1CN01Df2LiL1IcCkXJROYz_!!6000000000913-2-tps-759-426.png" alt="bl --help" width="720" />
</p>

## 安装

```bash
npm install -g bailian-cli
npx skills add modelstudioai/skills --all -g
```

> 需要预先安装 Node.js >= 22.12。

## 快速开始

```bash
# 认证
bl auth login --api-key sk-xxxxx

# 和通义千问对话
bl text chat --message "你好，介绍一下阿里云百炼平台"

# 多模态对话（文本 + 图片 + 音频 + 视频）
bl omni --message "描述这张图片" --image ./photo.jpg

# 生成图片
bl image generate --prompt "一只穿太空服的猫在火星上" --out-dir ./images/

# 图生视频（本地文件自动上传）
bl video generate --image ./cat.png --prompt "让画面中的猫动起来" --download cat.mp4

# 浏览器登录（控制台能力相关命令需要）
bl auth login --console

# 浏览应用 / 免费额度
bl app list
bl usage free --model qwen3-max
```

> 更多案例与使用场景：[阿里云百炼 CLI 官方主页](https://bailian.console.aliyun.com/cli)

## 认证方式

### DashScope API Key

大部分命令均需要 API Key。前往 [DashScope 控制台](https://bailian.console.aliyun.com/cn-beijing/?tab=app#/api-key) 获取。

```bash
# 方式一：环境变量
export DASHSCOPE_API_KEY=sk-xxxxx

# 方式二：登录命令（持久化到 ~/.bailian/config.json）
bl auth login --api-key sk-xxxxx

# 方式三：命令行参数
bl text chat --api-key sk-xxxxx --message "你好"
```

### 控制台登录（OAuth）

控制台能力命令（`app list`、`usage free`）需要使用此登录方式。打开浏览器跳转百炼控制台完成登录。

```bash
bl auth login --console
```

### 阿里云 AK/SK（仅知识库检索）

`knowledge retrieve` 命令需要阿里云 AccessKey。前往 [RAM 控制台](https://ram.console.aliyun.com/manage/ak) 获取。

> 建议：创建 RAM 子账号并授予最小权限，避免使用主账号 AK/SK。

```bash
export ALIBABA_CLOUD_ACCESS_KEY_ID=LTAI5t...
export ALIBABA_CLOUD_ACCESS_KEY_SECRET=...
export BAILIAN_WORKSPACE_ID=ws-...
```

## 配置

```bash
# 查看当前配置
bl config show

# 设置默认值
bl config set --key region --value us
bl config set --key default_text_model --value qwen-turbo
bl config set --key timeout --value 600

# 自更新到最新版本
bl update
```

配置文件位置：`~/.bailian/config.json`

## 相关链接

| 资源                    | 地址                                                            |
| :---------------------- | :-------------------------------------------------------------- |
| 阿里云百炼 CLI 官方主页 | https://bailian.console.aliyun.com/cli                          |
| DashScope API 文档      | https://help.aliyun.com/zh/model-studio/                        |
| 通义千问模型列表        | https://help.aliyun.com/zh/model-studio/getting-started/models  |
| 阿里云百炼控制台        | https://bailian.console.aliyun.com/                             |
| 获取 API Key            | https://bailian.console.aliyun.com/cn-beijing/?tab=app#/api-key |
| 获取 AccessKey          | https://ram.console.aliyun.com/manage/ak                        |

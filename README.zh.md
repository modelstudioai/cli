<div align="center">

<img src="https://img.alicdn.com/imgextra/i1/O1CN01kGgO3z1N30OINgUoG_!!6000000001513-2-tps-1915-821.png" alt="Aliyun Model Studio CLI" />

**阿里云百炼 (DashScope) AI 平台命令行工具**

[![npm version](https://img.shields.io/npm/v/bailian-cli?color=0969da&label=npm)](https://www.npmjs.com/package/bailian-cli)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.17-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)

[阿里云百炼 CLI 官方主页](https://bailian.console.aliyun.com/cli?source_channel=cli_github&) · [English](https://github.com/modelstudioai/cli/blob/main/README.md) · [API 文档](https://help.aliyun.com/zh/model-studio/) · [获取 API Key](https://bailian.console.aliyun.com/cn-beijing/?source_channel=key_github&tab=app#/api-key)

---

_千问对话、图像生成与编辑、视频生成与编辑、图像理解、语音合成与识别、_
_应用调用、记忆管理、知识检索、联网搜索 — 一行命令，触达所有 AI 能力。_

_专为 AI Agent 打造，每个命令均可作为结构化工具调用。_

</div>

## 功能特性

- **模型生成** — 文本、图像、视频、语音全模态生成，支持编辑与参考生成
- **素材理解** — 图像、文档、音频、长视频的解析与问答
- **应用编排** — 调用百炼已发布的 Managed Agent、智能体和工作流，接入知识库、记忆库、联网搜索与 MCP 工具
- **模型训推** — 数据集校验上传、模型精调、专属模型部署上线
- **账号运维** — 授权登录、界面化配置、模型市场、用量与额度、限流提额、团队席位管理
- **套餐接入** — 支持 Token Plan 等订阅计划一键接到 CLI 和常见 Coding Agent

> **注意：** 应用编排、模型训推、账号运维和套餐接入目前仅支持中国站（aliyun.com）账号，暂不支持国际站 / 全球站账号。

## 示例 1：一句话生成一部电影短片

<p align="center">
  <a href="https://cloud.video.taobao.com/vod/dS2F4huqbw5Nfe5L3wwb3grz2q2DNYD3retq8dU-iHo.mp4">
    <img src="https://img.alicdn.com/imgextra/i1/O1CN01Q5052k232Hd36NodG_!!6000000007197-0-tps-2940-1656.jpg" alt="点击播放演示视频" width="720" />
  </a>
</p>

<p align="center"><i>👆 点击封面播放完整 2 分钟演示</i></p>

一部完整的 **2 分钟、16:9 电影感短片** —— 由一句自然语言端到端生成，**全程零手动剪辑**。这个示例展示了 AI Agent 如何把三个基础能力编排成一条多步创作流水线：

- **[Qwen Code](https://github.com/QwenLM/qwen-code)** —— Agentic coding 模型，解析用户意图、驱动整个工作流
- **[阿里云百炼 CLI](https://github.com/modelstudioai/cli/)** —— 调用 **HappyHorse 1.1**，百炼的文生/图生/参考生视频模型
- **[spark-video Skill](https://github.com/JohnKeating1997/spark-video)** —— 负责场景拆分、分镜设计、镜头连贯性和最终拼接

### 唯一的提示词

> _“帮我生成一段日系影视风格，高中女生的青涩初恋故事，剧情高甜，让人看了想谈恋爱，2 分钟左右的视频，尺寸是 16:9。”_

## 示例 2：一句话构建短片导演 Managed Agent

<p align="center">
  <a href="https://cloud.video.taobao.com/vod/2v0GYLbJSQb2saj4iopTJDW3iRIHsintYlK-wTKbhqE.mp4">
    <img src="https://img.alicdn.com/imgextra/i4/6000000001674/O1CN01xhzixhxltbH3LxWu_!!6000000001674-0-tbvideo.jpg" alt="点击播放演示视频" width="720" />
  </a>
</p>

<p align="center"><i>👆 点击封面播放完整演示</i></p>

一句话构建一个可复用的云端短片导演，用于分镜设计、分镜图生成和视频创作：

- **[Qwen Code](https://github.com/QwenLM/qwen-code)** —— 理解需求并生成 Agent 配置
- **[阿里云百炼 CLI](https://github.com/modelstudioai/cli/)** —— 校验配置、预览变更并完成部署
- **[Managed Agent](https://bailian.console.aliyun.com/cn-beijing/?tab=managed-agents#/managed-agents/quick-start)** —— 在云端运行导演角色及其 Skill 和工具

### 唯一的提示词

> _“帮我构建一个 managedagent 应用，能够实现短片拍摄，导演专家生成视频，然后也能进行设计对应的分镜图。”_

## 安装

**Agent 安装（推荐）**

把下面这句话发给你的 Agent，它会自行判断环境并完成安装与校验：

```text
请阅读：https://bailian.aliyun.com/cli/install.md 并按照说明为我安装阿里云百炼 CLI
```

**手动安装（npm）**

```bash
npm install -g bailian-cli
npx skills add modelstudioai/cli --all -g
```

> 需要预先安装 Node.js >= 18.17。

## 快速开始

安装完成后，直接在 AI Agent 中描述你的任务，无需手动拼接命令。

| 场景             | 可以这样对 Agent 说                                                     |
| ---------------- | ----------------------------------------------------------------------- |
| Managed Agent    | “帮我创建一个能够生成短片分镜和视频的 Managed Agent。”                  |
| 图片和视频生成   | “生成一张穿着太空服的猫站在火星上的图片，再把它制作成一段视频。”        |
| 用量与额度       | “查看最近的模型用量、免费额度和限流情况。”                              |
| 模型选型         | “推荐一个适合图片理解和智能客服的模型。”                                |
| 了解 Bailian CLI | “介绍一下 Bailian CLI 能帮我完成哪些任务，并根据我的需求推荐使用方式。” |

> 更多案例与使用场景：[阿里云百炼 CLI 官方主页](https://bailian.console.aliyun.com/cli?source_channel=cli_github&)

## 认证方式

### API Key

大部分命令均需要 API Key。前往 [DashScope 控制台](https://bailian.console.aliyun.com/cn-beijing/?source_channel=key_github&tab=app#/api-key) 获取。

```bash
bl auth login --api-key sk-xxxxx
```

Token Plan 的 API Key 前往 [Token Plan 订阅详情](https://bailian.console.aliyun.com/cn-beijing?tab=plan#/efm/subscription/overview) 获取或复制。

```bash
bl auth login --config token-plan --api-key sk-sp-xxxxx
```

### 控制台登录（OAuth）

控制台能力命令（模型列表、应用列表、MCP 列表、工作空间、用量查询、限流提额、资产中心、控制台直调）需要使用此登录方式。打开浏览器跳转百炼控制台完成登录。

```bash
bl auth login --console
```

### 阿里云 OpenAPI AK/SK

Token Plan 的席位与成员管理需要阿里云 AccessKey。前往 [RAM 控制台](https://ram.console.aliyun.com/manage/ak) 获取。

> 建议：创建 RAM 子账号并授予最小权限，避免使用主账号 AK/SK。

```bash
bl auth login --open-api --access-key-id LTAI5t... --access-key-secret ...
```

## 配置

```bash
# 查看当前配置
bl config show

# 查看全部配置档
bl config list

# 切换配置档
bl config use --name token-plan
```

配置文件位置：`~/.bailian/config.json`

## 更新

```bash
bl update
```

升级 CLI 至最新版本，并同步更新已安装的 Agent Skills。每个版本的变更详情记录在 [CHANGELOG.zh.md](https://github.com/modelstudioai/cli/blob/main/CHANGELOG.zh.md)。

## 参与贡献

欢迎提 Issue、Feature Request 和 PR。开发环境搭建、仓库结构、新增/修改命令的工作流请见 [CONTRIBUTING.zh.md](https://github.com/modelstudioai/cli/blob/main/CONTRIBUTING.zh.md)。

欢迎扫码加入阿里云百炼 CLI 钉钉用户交流群，获取使用答疑、问题排查、Bug 反馈和使用经验交流支持。

<img src="https://img.alicdn.com/imgextra/i3/O1CN015uuhYGb6j0L12xJZ_!!6000000006304-2-tps-516-485.png" alt="阿里云百炼 CLI 钉钉用户交流群" width="240" />

## 相关链接

| 资源                    | 地址                                                                                      |
| :---------------------- | :---------------------------------------------------------------------------------------- |
| 阿里云百炼 CLI 官方主页 | https://bailian.console.aliyun.com/cli?source_channel=cli_github&                         |
| DashScope API 文档      | https://help.aliyun.com/zh/model-studio/                                                  |
| 通义千问模型列表        | https://help.aliyun.com/zh/model-studio/getting-started/models                            |
| 阿里云百炼控制台        | https://bailian.console.aliyun.com/?source_channel=cli_github                             |
| 获取 API Key            | https://bailian.console.aliyun.com/cn-beijing/?source_channel=key_github&tab=app#/api-key |
| 获取 Token Plan API Key | https://bailian.console.aliyun.com/cn-beijing?tab=plan#/efm/subscription/overview         |
| 获取 AccessKey          | https://ram.console.aliyun.com/manage/ak                                                  |

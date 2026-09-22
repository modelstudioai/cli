# Memory CLI 文档

Memory CLI 用于写入和检索长期记忆、维护记忆节点、管理画像模板并读取用户画像，以及导出 Skill 记忆。

- [能力矩阵](cli-matrix.md)：13 个命令、适用对象、参数范围、API 映射及尚未开放的能力。
- [用户技术指南](user-guide.md)：从配置到写入、检索、画像、Skill 和脚本集成的完整流程。
- [完整参数参考](../../skills/bailian-cli/reference/memory.md)：根据命令元数据自动生成。

本文档按 **2026-09-22 当前工作区源码**整理，包版本字段为 `1.23.0`，包含尚未提交的 Memory 改动；不代表同版本 npm 包已包含全部能力。使用前以本机 `bl memory --help` 及子命令 `--help` 核对。

维护者可参阅 [后端接口对齐稿](2026-09-20-memory-backend-api.md) 和 [2026-09-21 后端实测记录](2026-09-21-memory-live-verify.md)。历史实测针对 HTTP API，不等同于本次 CLI 端到端验证；内部接口也不构成 CLI 对外承诺。

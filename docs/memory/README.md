# Memory CLI 文档

Memory CLI 用于写入和检索长期记忆、维护记忆节点、管理画像模板并读取用户画像，以及导出 Skill 记忆。

- [命令完整用法指南](memory-cli-guide.md)：核心概念、通用约定、典型工作流、13条命令速查和排障。
- 分领域手册：[写入与抽取](add.md) · [检索](search.md) · [节点管理](node.md) · [画像模板与用户画像](profile.md) · [Skill导出](skill.md)。
- [能力矩阵](cli-matrix.md)：13 个命令、适用对象、参数范围、API 映射及使用边界。
- [用户技术指南](user-guide.md)：从配置到写入、检索、画像、Skill 和脚本集成的完整流程。
- [个人长期记忆 Skill](../../skills/bailian-memory/SKILL.md)：在本地 Agent 中启用生活与工作记忆，含首次配置和基础画像。
- [完整参数参考](../../skills/bailian-memory/reference/memory.md)：根据命令元数据自动生成。

本文档按当前工作区源码整理，新增完整手册于2026-10-19核对。源码能力和测试结论不代表对应npm版本已经发布；使用前以本机 `bl memory --help` 及子命令 `--help` 核对。

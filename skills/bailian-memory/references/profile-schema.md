# 基础个人画像 v1

每个个人配置创建一个专用 Schema，保存 ID 后复用；不要复用业务系统的模板。名称为 `pm_` 加 user_id 去掉连字符后的前 24 位十六进制字符（共 27 字符），例如 `pm_0123456789abcdef01234567`；名称仅用于识别，实际绑定以返回的 Schema ID 为准，描述“个人长期记忆基础资料 v1”。创建采用 `--extract-scene efficient --plan-version pro`。此处 pro 决定画像抽取档位，不修改默认 observation 规则。

属性源为 [profile-attributes.json](../assets/profile-attributes.json)。读取该文件，将完整 JSON 数组作为 `--attributes` 的值传入 `memory profile create`；该参数不支持 `@file` 简写。安全构造命令，不对用户文本做 shell 代码插值。

| 字段                      | 用途                     |
| ------------------------- | ------------------------ |
| preferred_name            | 用户希望被如何称呼       |
| home_city                 | 常住城市，不含精确地址   |
| occupation                | 长期职业或角色           |
| response_language         | 长期回答语言偏好         |
| communication_preferences | 保留使用场景的表达偏好   |
| interests                 | 持续兴趣                 |
| dietary_preferences       | 饮食偏好，不推断敏感原因 |

没有 default_value，不知道就为空，不为填满字段追问。升级 Skill 不自动修改云端 Schema，已有版本不认识时停止画像写入并说明需要核对，不能覆盖既有字段。

资料变化时用 `memory add --messages ... --profile-schema <保存的ID>` 联合抽取，不加 profile_only，不传 content。事件完成后 `profile get --schema-id ... --user-id ...` 回读。

响应可能包含多个 value_items 及状态，不能假定都是单个字符串。按响应结构和有效状态理解资料；多个值冲突且无法判定时不简单取数组最后一项。当前用户指示优先。

Profile 是可变化的资料，不是永久事实。画像没有值也不表示该用户不存在。`profile show` 返回的是模板；查看个人资料必须用 `profile get`。

当前 CLI 不提供用户画像值项删除，启用前和遗忘请求时必须说明，按 [记忆策略](memory-policy.md#遗忘与纠正) 处理。

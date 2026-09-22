# memory-0921 接口复核报告

日期：2026-09-21。核对 `.local/memory-0921.md`（后端新版）、`.local/memory-0918.md` 的既有对齐结论和 `docs/memory/2026-09-20-memory-backend-api.md`。新版原文件未修改；综合文档已原位更新，并提供独立副本 `2026-09-20-memory-backend-api.md`。

## 结论

新版解决了多项历史错误，但不能直接作为无差异的最终契约。主要剩余问题是错误响应格式、异步状态/结果出现时机、PATCH 时间戳默认行为；综合文档自身也有必填 user_id、删除语义和示例残留需要纠正。

本轮共 **145 次真实 HTTP 请求：133 次 200、10 次预期参数错误 400、2 次重复清理 404**（含异步轮询）。所有请求均收到服务端响应。按新版出参表逐项验证 **1423 个实际字段值**（包括每个数组元素和轮询响应），未发现已声明且实际出现字段的基础 JSON 类型冲突；这不代表所有可选字段或业务分支均已覆盖。

## 一、新版文档需要修正的地方

| 等级 | 新版位置                       | 问题与本轮证据                                                                                                                                               | 建议                                                               |
| ---- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| P1   | 通用响应约定，L16              | 文档说错误在 request_id/status_name/status_message 响应头；公共及 workspace 生产网关均为 JSON `{request_id,code,message}`，头部是 x-request-id，未见那三个头 | 写明实际错误体与 HTTP 状态；若预发不同，分环境说明                 |
| P1   | Add async 状态，L132           | 枚举漏 RUNNING；4 组异步任务均可观测运行态                                                                                                                   | 加 RUNNING，并说明只有终态才结束轮询；FAILED/UNRECORDED 本轮未触发 |
| P1   | Add async 出参、GetEvent L220  | Add 出参漏 result；GetEvent 说“成功后出现”，实际提交和 RUNNING 都有 `result: []`                                                                             | 将 result 定义为空数组或结果数组，不能靠字段存在判定成功           |
| P1   | UpdateMemory.timestamp，L543   | 写“不填默认当前时间”；同一节点从 1747278460 开始，省略 PATCH 后仍为 1747278460，显式传 1747278500 后才改变                                                   | PATCH 改为“不传保持原值”；与 Add 默认当前时间分开                  |
| P2   | Add async 响应示例，L185       | 表格已写 user_profile，示例却仍是 profile；示例 user_id 也不对应请求                                                                                         | 修正 resource_type，并统一请求/响应示例中的用户标识                |
| P2   | GetSkillExport，L481/L493      | “字段同 GetMemoryNode”未说明 content 语义不同；Get 带 frontmatter，Export 仅正文并拆出三件套                                                                 | 明确 content 转换，不建议客户端把二者内容直接等同                  |
| P2   | Get/List/Delete 节点；实体删除 | 状态枚举和删除行为不完整；单节点 DELETE 后 Get 仍 200、status=delete；重复 DeleteEntity 是 404 EntityNotFound                                                | 补充软删除可见性及重复删除响应，不承诺物理删除                     |
| P2   | Search.min_score，L352         | 只写默认 0.3，缺值域；-0.1 与 1.1 均返回 400，错误明确范围 0..1                                                                                              | 恢复 `[0,1]` 范围                                                  |
| P2   | Search 新旧参数                | 单数 memory_type 能用；memory_types 与 memory_type 冲突并传仍返回 200。旧 enable_rerank=false 可令 plan_version=lite                                         | 写明别名冲突策略与旧参数兼容口径；不把 200 等同所有开关都生效      |
| P2   | GetUserProfile 与可选响应字段  | 空画像默认模式省略 value，详情为 value_items=[]；纯文本 media_desc、多模态字段、default_value、custom_instruction 等可缺省                                   | 出参应区分必返、条件返、空数组和缺省，避免生成过严 required schema |
| P2   | Schema 删除接口                | 新版整段缺失；本轮 4 个临时 Schema 均 DELETE 200                                                                                                             | 说明是否有意移出公开契约；不能据文档缺失认定接口不存在             |
| P2   | 项目创建约束                   | 新版未写 skill 只能 pro；本轮 skill+lite 返回 400。旧稿还有多模态组合限制                                                                                    | 补回明确组合约束；未重测的约束保留历史标签                         |
| P3   | 网关链接，L5                   | 预发链接显示 gateway，实际目标多了 /add                                                                                                                      | 去掉链接尾部 /add，避免照链接拼接路径                              |

另：Schema 空 PATCH 的错误文案仍只列 name/description/attributes_operations，但单独传 extract_scene 或 plan_version 均可成功；这是服务端错误文案滞后，新版对可更新字段的描述是正确的。

新版 22 个 JSON 示例均可解析。上述行号指本轮读取的原始 memory-0921.md。

## 二、综合文档已补充和修改

1. 添加 0921 来源、复核日期、证据边界和公共生产网关验证范围。
2. 删除 PATCH/DELETE 的 user_id 必填要求，并修正示例；两者本轮无 user_id 均成功。
3. 修正 PATCH timestamp 为省略保留；删除旧稿“永久删除不可恢复”的无依据断言。
4. 增补 extract_mode=profile_only、project_ids 最多 5 个、Search 单数 project_id/memory_type。
5. 增补 Schema/project 的 extract_scene、项目 description；Schema 描述长度改为系统配置决定，不再把旧 128 上限当新版保证。
6. 补入 DeleteEntity / DeleteEntityProfile 的入参、返回、删除范围和重复删除响应。
7. 保留并注明兼容 enable_rerank：显式 plan_version 优先；均省略为 pro；仅 enable_rerank=false 为 lite。enable_judge/rewrite 只验证入参被接受，未验证效果。
8. 清除画像示例里残留的 need_evidence 和未返回的 description，补充无值/多值形态。
9. 标记内部与暂未对客范围，未自动新增 CLI 命令或修改用户现有代码。
10. 保留 DeleteProfileSchema 实测能力，同时标注新版缺失及公开范围待确认。

## 三、真实调用覆盖

| 能力                                  | 本轮结果                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Add async observation + profile       | 成功，产生 observation/user_profile 任务，RUNNING → SUCCEEDED；画像结果有 name、无 memory_node_id |
| Add async custom observation / skill  | 成功，resource_type 为 custom_observation/custom_skill；project_id 单数直存                       |
| profile_only                          | 缺 schema 400；完整入参只产生 user_profile 任务，observation 数量不增加                           |
| Add 同步 custom_content               | 成功，返回 memory_nodes；含自定义 timestamp 的写入与 PATCH 闭环                                   |
| List / Search / Get / Update / Delete | 成功；默认 List 不会汇总自定义 observation 项目；Search 单/复数 skill 都召回同一节点              |
| Skill 导出与更新                      | Export 正文和三件套符合预期；PATCH 缺三件套 400，补齐成功                                         |
| Profile 默认/详情/值项操作            | snake_case；item_id 为 JSON 整数；ADD/UPDATE/DELETE 大写被接受；两值拼接为 `游泳; 阅读`           |
| Schema 创建/读取/列表/更新/删除       | 成功；单独 plan_version 更新后的 GET 为 lite；单独 extract_scene PATCH 200                        |
| 项目读取/列表/更新                    | 成功；复用 0920 专用测试项目做 extract_scene 同值 PATCH，配置值不变，updated_at 改变              |
| 项目创建                              | 本轮只跑 skill+lite 拒绝分支；成功创建为 0920 历史证据，未重复留下新项目                          |
| DeleteEntityProfile                   | 指定模板只清空该画像，另一模板仍有绘画、observation 仍 3 条；不指定模板全部画像清空、节点仍 3 条  |
| DeleteEntity                          | 清空 observation/skill；补测非空画像同样清空；重复调用 404 EntityNotFound                         |
| 公共生产网关                          | 列表 200、非法 search 400 的 JSON 错误体已验证；完整读写闭环在 workspace 生产网关执行             |

## 四、未覆盖与后端待确认

- 异步 FAILED/UNRECORDED、Event UPDATE.old_content、多模态资源结构、tool_calls 的本轮抽取、skill messages 模型抽取没有重跑；相应历史测试不冒充本轮结果。
- 未验证全部字符长度上限、限流、过期/自动刷新效果、内部 custom_instructions 行为及跨记忆库隔离。
- Search 类型别名冲突的优先级需后端明确；本轮冲突探针同时带 skill project，不能单凭该结果断言 memory_type 总是覆盖 memory_types。
- 同步仅直存成功；同步 profile_only / messages 抽取未验证。
- 项目 description 修改、所有 extract_scene 的组合校验未穷举；同值 PATCH 成功只证明字段被接受。
- 单节点删除后仍可 Get 到 delete 状态，底层保留时长、后续清理和可恢复性需后端定义。

## 五、证据与清理

- `2026-09-21-memory-live-verify.json`：145 次请求/响应（含筛选后的错误响应头）、字段类型检查与行为断言。
- `2026-09-21-memory-format-check.json`：字段类型检查、额外字段和未出现的字段；未出现不自动判失败。
- `2026-09-21-memory-consolidated.patch`：本轮对综合文档的完整变更。
- 2 个独立测试用户的记忆/画像已清空，4 个临时 Schema DELETE 成功；最终 observation、skill 和默认列表均为空。重复实体清理的 404 是已不存在，不是遗留失败。
- 未新建持久项目；复用了 0920 留下的专用测试项目，做同值更新后仅 updated_at 变化。单节点的服务端 delete 状态记录不等于底层物理擦除。
- 使用仓库 .env 中现有凭据直接调用 HTTP，没有运行 bl、升级 CLI 或输出密钥。

自动行为/格式断言：**24 项，24 项通过**。

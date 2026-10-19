# Memory CLI 发布前审计（2026-10-19）

## 发布判定

审计范围为 `bl memory` 的 13 条命令、公共 HTTP/Workspace 路由和 npm 安装产物。dsh/Skill 实际宿主不在范围内；Memory 中的 skill 类型节点及 `memory skill export` 仍在范围内。

**结论：GO，本次约定范围内的Memory CLI可进入正式发布流程。** 用户已明确服务契约：min_score默认0.3，仅plan_version=pro时生效；lite返回低于阈值的节点属于合法行为。此前NO-GO基于错误的测试预期，不能归因于服务端缺陷。已修正双语help、示例、用户指南与测试；lite/pro/default三条真实检索定向回归全部通过，更新后的安装包33项冒烟及live CRUD通过。本次审计没有剩余已知发布阻断项；此结论不代替正式发布CI。

本轮没有执行提交或发布。正式发布仍走仓库 CI，不复用现有 2.3.2 版本号覆盖 npm。

## 命令契约

共同约定：API Key 鉴权；Workspace 为 flag > 环境变量 > 配置，不能为空且只能包含字母/数字/连字符/下划线，不能改变服务端域名。除 `node show` / `skill export` 外支持 `--library-id`，省略时使用服务默认库。`--dry-run` 只验证和输出请求，不发业务请求。JSON 输出服务响应，错误走 stderr；`--quiet` 优先输出简短文本，因此机器调用应使用 `--output json` 且不要叠加 `--quiet`。

| 命令             | 输入、默认值与作用范围                                                                                              | 成功语义与限制                                                                                                                                                   | 直接测试                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `add`            | `--user-id`；content/messages 至少一项；content 优先，≤512字符；messages≤50；content一个project/messages最多5个     | POST一次；默认wait=120秒，预算从提交后算；wait=0只承诺收到提交回执；正预算须有event_id和非空全终态列表；部分失败exit1，预算耗尽exit5；UNRECORDED不代表保存了事实 | add E2E、add-async、poll-event、transport-contract        |
| `search`         | user-id + query/messages，messages优先；top-k默认10/范围1–100；score默认0.3/范围0–1，仅pro生效；默认pro/observation | 仅查询；JSON含ID/score；空结果不是错误；别名不可与对应规范flag混传                                                                                               | search E2E、parameter-contract、live-coverage             |
| `list`           | user-id；page默认1、size默认10；单页；默认仅默认project规则                                                         | 列表/total；空用户返回空列表；不能拿默认规则列表代表所有项目                                                                                                     | list E2E、boundaries、live-coverage                       |
| `node show`      | node-id；仅Workspace，无library参数                                                                                 | 返回节点详情；已删节点可能仍返回status=delete                                                                                                                    | node-show E2E、delete live                                |
| `update`         | node-id + content；content≤512；可带meta-data及完整skill三件套                                                      | PATCH整体替换内容、增量合并metadata；不更新画像；无额外确认                                                                                                      | update E2E、delete live、安装包CRUD                       |
| `delete`         | node-id，可选library；实际执行需yes                                                                                 | 只删该节点，不删已提取画像值/模板；无yes exit7；dry-run免确认；删除后结合状态/列表/检索验证                                                                      | delete E2E、J4、安装包CRUD                                |
| `skill export`   | node-id；仅Workspace                                                                                                | GET skill正文；text不含frontmatter，JSON含元数据；不写本地文件                                                                                                   | skill-export E2E、add中的skill live闭环                   |
| `profile create` | name≤32；非空attributes，每项对象且name必填；description/default_value可选且类型正确；默认efficient                 | 创建共享模板；不等于已抽取画像；pro/lite与scene兼容性由服务权威校验                                                                                              | profile-create E2E、release-contract、alignment live      |
| `profile list`   | 可选library/page/size，分页默认同list                                                                               | 返回单页共享模板及total                                                                                                                                          | profile-list E2E、live-coverage                           |
| `profile show`   | schema-id，可选library                                                                                              | 返回模板定义及属性ID，不是用户画像值                                                                                                                             | profile-show E2E、profile-delete live                     |
| `profile update` | schema-id+至少一项更新；add需name，update/delete需attribute_id；description可清空                                   | 修改共享模板/计费档位/抽取场景；显式JSON delete移除属性定义，不是遗忘某一用户的值；保持既有无yes契约，用dry-run审阅                                              | profile-update E2E、release-contract、profile-delete live |
| `profile delete` | schema-id，可选library；需yes                                                                                       | 永久删除模板并使其画像不可达；不是删除某个用户画像的替代方案                                                                                                     | profile-delete E2E、安装包确认门                          |
| `profile get`    | schema-id + user-id，可选library                                                                                    | 读取对应模板已抽取的画像；未抽取时属性为空；JSON保留服务端值项/status                                                                                            | profile-get E2E、alignment live、J5                       |

默认检索/分页值主要由服务端提供，CLI省略时不写入请求；不把它们误报为本地固定默认。`intelligent + lite` 的服务拒绝已作为真实兼容性断言，不在CLI猜测/翻译服务端错误。

## 风险—测试覆盖矩阵

测试路径基准：命令 E2E 在 `packages/commands/tests/e2e/memory/`；命令单测在 `packages/commands/tests/`；公共传输/端点测试在 `packages/core/tests/`。

| 风险                                    | 等级           | 期望/断言                                                                | 证据与状态                                                                                     |
| --------------------------------------- | -------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Workspace输入改变请求主机，凭证发错地址 | 发布阻断       | 所有来源均拒绝URL语法；合法workspace始终落在服务域                       | 新增workspace-endpoint-validation；安装包flag/env/config三来源，已修复                         |
| 空events或缺event_id假报保存完成        | 高             | 空events继续等待；缺ID正预算输出回执后报不能确认，不能重发               | 新增poll-event/add-async回归，已修复                                                           |
| --wait不约束挂起请求/轮询睡眠           | 高             | 剩余预算约束请求与sleep，取消传输、清理计时器，不再发额外GET             | poll-event挂起/取消/长timer测试，已修复；不宣称完整CLI SIGINT验收                              |
| 失败/断连后自动重发导致重复记忆         | 高             | POST仅一次；原服务错误和诊断完整保留                                     | 新增transport-contract：真实Command+Client+HTTP，模拟401/429/500/ECONNRESET；全部通过          |
| 异步部分失败被成功输出掩盖              | 高             | 已完成结果可见，同时exit1且保留失败详情                                  | add-async partial failure及JSON断言                                                            |
| 非法JSON元素崩溃或错误类型到达服务      | 中/高          | null/scalar/array元素、本地可权威校验的属性字符串类型均exit2，零业务请求 | 新增release-contract，先观察失败再修复；共享解析器覆盖add/search/schema                        |
| 误删节点/整个模板                       | 高             | --yes确认，dry-run不要求确认且不发请求                                   | delete/profile-delete E2E、runtime确认门、安装产物exit7与dry-run                               |
| 删除节点误以为删除画像值                | 高（产品语义） | 明确资源边界，不承诺完整个人数据遗忘                                     | 已补delete help及生成reference；单项画像值删除当前CLI不提供                                    |
| schema属性删除误当单用户修改            | 中（产品语义） | 明确共享模板作用范围，显式op才能删属性                                   | 已补profile update help；不临时改变整个update确认契约                                          |
| 写入/更正/删除仅信HTTP成功              | 高             | 列表/详情/搜索读回、对照事实及重新记忆                                   | J1–J5此前已通过；本轮节点/模板/skill live闭环和安装包CRUD                                      |
| user/project/library混用                | 高             | 请求正确映射，user/project/library隔离不串数据                           | parameter-contract；J2；live-coverage的多project/跨library用例按fixture判定，缺fixture不计通过 |
| 参数遗漏/枚举/互斥/边界                 | 中             | 使用错误exit2，帮助和请求映射一致                                        | parameter-contract 108条、boundaries及逐命令E2E；所有已声明flag均有正例                        |
| 检索阈值适用策略误解                    | 中（产品语义） | pro/default按min_score过滤；lite不按阈值过滤                             | 已据用户澄清修正双语help、示例和live断言；定向回归见下文                                       |
| 输出不适合脚本调用                      | 中             | JSON可解析、终态/错误有明确退出码，保留request_id                        | add-async、transport-contract、安装包JSON CRUD；没有宣称全text/quiet/locale笛卡尔积覆盖        |
| npm包漏产物/依赖仍指向workspace源码     | 高             | 四个本地tarball独立安装，真实bin可运行，无仓库符号链接依赖               | smoke-memory-package脚本、tarball SHA256、安装路径及版本核验                                   |

## 本轮修复

1. 在core统一Workspace endpoint入口拒绝会改变URL结构的字符，Memory及共享Workspace接口共同受保护。
2. 异步轮询不再把空事件当作终态；预算覆盖挂起GET和sleep，避免超时后继续查询。
3. 缺event_id的正预算写入不再exit0假报可确认；wait=0仍为回执语义；非有限wait拒绝。
4. JSON数组元素及属性字段类型在发送请求前校验，统一USAGE，新增文案同时包含中英文。
5. 明确节点删除、共享模板属性操作与单用户画像值的区别；同步生成命令reference。

## 打包安装冒烟

可复现命令（在仓库支持的Node版本执行）：

```sh
pnpm --filter bailian-cli... build
mkdir -p test/output/memory-release-pack
pnpm --filter bailian-cli-core --filter bailian-cli-runtime --filter bailian-cli-commands --filter bailian-cli -r exec pnpm pack --pack-destination "$PWD/test/output/memory-release-pack"
node --import tsx tools/smoke-memory-package.mjs test/output/memory-release-pack --live
```

脚本将四个tarball安装到临时目录，复用仓库隔离HOME/config基础设施。npm安装保留生命周期脚本；实际命令通过安装目录的bin执行，不调用源码harness。验证13条help、版本、缺参/缺鉴权、删除确认与dry-run、Workspace三个来源、中文确认、真实写入→详情→搜索→更新→回读→删除→列表为空。测试使用随机合成身份；若回执未知或清理不完整，脚本返回FAIL并保留资源记录。

首次工具运行因macOS `/var` 与 `/private/var`路径别名造成测试断言失败，尚未执行CLI或云端写入；修正真实路径比较后重跑。该失败不隐藏，报告保留。

## 证据及剩余边界

- 本轮源码混合测试报告：`test/output/memory-release-offline.json`（历史文件名；实际加载当前.env，包含已开启的live组，不能称为纯离线），337 passed / 1 failed / 5 skipped。唯一失败为lite分数阈值的错误断言（后经用户澄清纠正，原始报告保留）；5项为未开启的J1–J5 journey，本轮不计通过。该轮运行中包含修复过程，最终源码另由下述离线回归与安装产物验证，不将它宣称为最终源码的全量live认证。
- 安装产物live报告：`test/output/memory-package-smoke-1792392797034/report.json`，含包哈希、命令、返回值、清理状态。
- Node兼容性：`test/output/memory-package-node-compatibility.json`。
- 最终纯离线报告：`test/output/memory-release-final-offline.json`，370 passed / 45 skipped / 0 failed；45项是显式关闭的live组，不能计为通过。该轮通过测试专用setup在.env加载后关闭live，未修改个人.env。
- 定向故障/输入/HTTP回归：73 passed（已包含在上述最终离线集合，不重复累加）。
- Runtime确认门和错误输出：9 passed。
- npm安装产物：33项PASS，写入终态/更新读回/删除读回成功，cleanupComplete=true，uncertainWrite=false。
- Node 18.20.8 / 22.12.0：安装产物13条Memory帮助各自通过，共26项；完整live安装冒烟使用Node 24.19.0，不宣称所有旧版本的全量live覆盖。
- `vp check`：0 errors / 3条既有warnings。core/runtime/commands/cli构建及本地pack成功。

### 已撤销的误判：lite分数阈值

现有测试 `packages/commands/tests/e2e/memory/memory-live-coverage.e2e.test.ts` 的 `messages search with lite strategy enforces top-k and score` 首次收到0.678，低于请求阈值0.8。用户随后明确阈值只适用于pro，因此该测试当时错误地将pro契约套用于lite；现已纠正。

独立复现实验通过安装后的bin创建随机合成用户记忆，以同一请求分别调用CLI和直接HTTP。关键请求字段为 `messages: [{role: "user", content: "<合成用户ID> 的游泳习惯是什么？"}]`、`top_k: 3`、`min_score: 0.8`、`plan_version: "lite"`，并传入同一user_id/library。两者均返回HTTP成功且含score=0.508的节点；阈值0时也返回0.508。CLI的dry-run与直接请求一致，排除了CLI漏传/改写参数。

- 安装版阈值0.8响应request_id：`7bdec302-d071-963d-87bd-da76f35e1b9d`。
- 直接HTTP阈值0.8响应request_id：`83824740-9951-9353-b8b1-1e00f9653599`。
- pro对照返回0.891（阈值0及0.8）；本对照只证明请求/响应一致，单独不能证明pro对低分项的过滤能力。
- 不含鉴权凭证的完整证据：`test/output/memory-lite-reproduction.json`；合成节点删除后list为空，cleanup=true。证据目录被git忽略，因此关键结果及request_id同时固化在本报告中。

用户确认：min_score仅对pro生效，默认策略为pro；lite不受该阈值过滤。上述直接HTTP及安装版结果与真实契约一致，无需服务端修复，也不应增加客户端过滤。修正后的测试保留全部策略的top-k/节点归属断言，pro/default保留分数下限与低分节点排除断言，lite比较阈值0/0.8的节点集合保持一致。双语help、示例和用户指南同步说明适用范围。定向复验：3 passed / 11 skipped（只选择三个检索策略用例，其余11项未在这次定向运行重跑），耗时324秒；报告：`test/output/memory-score-contract-corrected.json`。不把历史失败报告改写成全绿，也不重复累加两轮用例数。

契约修正后的离线检索/参数回归：132 passed / 2 skipped（live关闭）。更新后的四个包已重新构建、打包并安装，33项冒烟及live CRUD全部通过；新报告：`test/output/memory-package-smoke-1792394167660/report.json`，cleanupComplete=true、uncertainWrite=false。原始安装报告保留用于追溯；新tarball位于`test/output/memory-score-corrected-pack/`。

本轮所需API凭证、library及project fixtures均可用，没有因缺少环境/权限阻塞的CLI验证项。dsh/Skill实际宿主明确排除，不列为发布阻断或待补权限。

残余非阻断边界：未穷举全部输出格式/语言组合，部分既有文本输出仍为英文；未验证跨账号服务端权限（user_id范围不是鉴权边界）；不提供单项画像值删除；本轮npm产物安装验证不代替CI的全平台二进制发布流水线。新加/修改的诊断、帮助文案符合双语约定。

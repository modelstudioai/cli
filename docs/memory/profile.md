# 画像模板与用户画像命令手册

覆盖profile的6条命令。模板定义“抽取什么”，用户画像保存“某个用户的属性值”；两者不能混用。

> 鉴权、Workspace、输出格式、确认机制和退出码见[总览指南的通用约定](memory-cli-guide.md#通用约定)。示例沿用已配置的 API Key 和 Workspace；请替换尖括号中的 ID。命令参数表不重复全局参数，array 类型通过重复 flag 传入。

## `bl memory profile create`

创建用于记忆画像的用户 Profile Schema。接口：`POST /profile_schemas`（路径省略 `/api/v2/apps/memory`）。

**用法**

```bash
bl memory profile create --name <name> --attributes <json> [flags]
```

**参数**

| 参数                                       | 类型   | 必填 | 说明                                                                       |
| ------------------------------------------ | ------ | ---- | -------------------------------------------------------------------------- |
| `--name <name>`                            | string | 是   | Schema 名称（必填）                                                        |
| `--description <text>`                     | string | 否   | Schema 描述                                                                |
| `--attributes <json>`                      | string | 是   | 属性 JSON 数组：[{"name":"age","description":"年龄","default_value":"18"}] |
| `--plan-version <pro\|lite>`               | string | 否   | 策略版本：pro（开启 Rerank）或 lite（关闭 Rerank），计费单价不同           |
| `--extract-scene <efficient\|intelligent>` | string | 否   | 抽取场景：efficient 或 intelligent（创建时默认 efficient）                 |
| `--library-id <id>`                        | string | 否   | 记忆库 ID（默认：账号的默认记忆库）                                        |

**参数约束**

- name最长32；attributes是非空JSON对象数组，每项name必填且最长32。
- 属性description/default_value最长128；description须为字符串，default_value可为字符串或null。模板description不套用属性的128限制。
- extract-scene默认efficient；efficient支持pro/lite，intelligent需要pro，组合兼容性由服务端校验。

**输出**

json保留 `profile_schema_id` 等响应字段；text输出模板创建确认和ID。

**注意事项**

创建后用add --profile-schema传入此ID，才会抽取该模板的用户画像。模板可被多个用户共享；library-id应与后续写入和读取保持一致。

**示例**

```bash
bl memory profile create --name travel_profile --attributes '[{"name":"city","description":"常住城市"},{"name":"hobby","description":"兴趣爱好"}]' --plan-version lite --extract-scene efficient --output json
```

---

## `bl memory profile list`

列出画像模板。接口：`GET /profile_schemas`（路径省略 `/api/v2/apps/memory`）。

**用法**

```bash
bl memory profile list [flags]
```

**参数**

| 参数                | 类型   | 必填 | 说明                                |
| ------------------- | ------ | ---- | ----------------------------------- |
| `--page-size <n>`   | number | 否   | 每页结果数（默认：10）              |
| `--page <n>`        | number | 否   | 页码（默认：1）                     |
| `--library-id <id>` | string | 否   | 记忆库 ID（默认：账号的默认记忆库） |

**参数约束**

- page/page-size至少1；默认第1页、每页10条。library-id最长32。

**输出**

json返回 `profile_schemas` / `total`；text显示模板ID、名称、档位、描述及总数（如有）。

**注意事项**

返回单页模板定义列表，不返回各个用户的画像值。

**示例**

```bash
bl memory profile list --page 1 --page-size 20 --output json
```

---

## `bl memory profile show`

查看画像模板定义及属性 ID。接口：`GET /profile_schemas/{schema_id}`（路径省略 `/api/v2/apps/memory`）。

**用法**

```bash
bl memory profile show --schema-id <id> [flags]
```

**参数**

| 参数                | 类型   | 必填 | 说明                                |
| ------------------- | ------ | ---- | ----------------------------------- |
| `--schema-id <id>`  | string | 是   | Profile Schema ID（必填）           |
| `--library-id <id>` | string | 否   | 记忆库 ID（默认：账号的默认记忆库） |

**参数约束**

- schema-id必填；library-id最长32。

**输出**

json保留模板详情；text显示模板名称、描述和属性定义（包括attribute_id、描述、默认值等）。

**注意事项**

这里获取的attribute_id用于更新模板属性。读取某用户已抽取的属性值请用profile get。

**示例**

```bash
bl memory profile show --schema-id '<schema-id>' --output json
```

---

## `bl memory profile update`

更新画像模板、抽取场景或计费档位。接口：`PATCH /profile_schemas/{schema_id}`（路径省略 `/api/v2/apps/memory`）。

**用法**

```bash
bl memory profile update --schema-id <id> [flags]
```

**参数**

| 参数                                       | 类型   | 必填 | 说明                                                             |
| ------------------------------------------ | ------ | ---- | ---------------------------------------------------------------- |
| `--schema-id <id>`                         | string | 是   | Profile Schema ID（必填）                                        |
| `--name <name>`                            | string | 否   | 新的 Schema 名称                                                 |
| `--description <text>`                     | string | 否   | 新的 Schema 描述                                                 |
| `--attributes-operations <json>`           | string | 否   | 属性操作 JSON 数组：[{"op":"add","name":"plan"}]                 |
| `--plan-version <pro\|lite>`               | string | 否   | 策略版本：pro（开启 Rerank）或 lite（关闭 Rerank），计费单价不同 |
| `--extract-scene <efficient\|intelligent>` | string | 否   | 抽取场景：efficient 或 intelligent（创建时默认 efficient）       |
| `--library-id <id>`                        | string | 否   | 记忆库 ID（默认：账号的默认记忆库）                              |

**参数约束**

- schema-id必填，还需至少一个更新字段：name、description、attributes-operations、plan-version或extract-scene。
- attributes-operations是对象数组，op用小写add/update/delete；add需name，update/delete需attribute_id。
- 属性名称最长32，属性description/default_value最长128；清空default_value传空字符串，不能只依赖null。

**输出**

json保留服务响应；text输出模板更新确认。

**注意事项**

修改的是共享模板，不是某个用户的画像值。显式op=delete删除模板属性定义；该命令没有额外--yes确认门，操作前用show及dry-run核对影响范围。修改模板不保证历史数据自动重抽取。

**示例**

```bash
bl memory profile update --schema-id '<schema-id>' --attributes-operations '[{"op":"add","name":"travel_style","description":"旅行偏好"}]' --output json
bl memory profile update --schema-id '<schema-id>' --attributes-operations '[{"op":"update","attribute_id":"<attribute-id>","description":"长期稳定的兴趣"}]' --output json
# 先审阅删除模板属性的请求；这不是删除某个用户的值
bl memory profile update --schema-id '<schema-id>' --attributes-operations '[{"op":"delete","attribute_id":"<attribute-id>"}]' --dry-run --output json
```

---

## `bl memory profile delete`

删除画像模板。接口：`DELETE /profile_schemas/{schema_id}`（路径省略 `/api/v2/apps/memory`）。

**用法**

```bash
bl memory profile delete --schema-id <id> [flags]
```

**参数**

| 参数                | 类型   | 必填         | 说明                                |
| ------------------- | ------ | ------------ | ----------------------------------- |
| `--schema-id <id>`  | string | 是           | Profile Schema ID（必填）           |
| `--library-id <id>` | string | 否           | 记忆库 ID（默认：账号的默认记忆库） |
| `--yes`             | switch | 实际执行时是 | 确认删除；dry-run 不要求            |

**参数约束**

- schema-id必填；实际执行需--yes，dry-run无需确认；library-id最长32。

**输出**

json保留服务响应；text输出模板删除确认。

**注意事项**

删除整个模板及其属性定义，已抽取的关联画像变得不可访问。会影响所有依赖此模板的用户，不是清空单个用户画像的替代方式。

**示例**

```bash
bl memory profile delete --schema-id '<schema-id>' --dry-run --output json
# 确认共享模板影响范围后执行
bl memory profile delete --schema-id '<schema-id>' --yes --output json
```

---

## `bl memory profile get`

获取某个 Schema 下已提取的用户画像。接口：`GET /profile_schemas/{schema_id}/user_profile`（路径省略 `/api/v2/apps/memory`）。

**用法**

```bash
bl memory profile get --schema-id <id> --user-id <id> [flags]
```

**参数**

| 参数                | 类型   | 必填 | 说明                                  |
| ------------------- | ------ | ---- | ------------------------------------- |
| `--schema-id <id>`  | string | 是   | Profile Schema ID（必填）             |
| `--user-id <id>`    | string | 是   | 记忆实体 ID，标识画像归属对象（必填） |
| `--library-id <id>` | string | 否   | 记忆库 ID（默认：账号的默认记忆库）   |

**参数约束**

- schema-id和user-id均必填；user-id最长64，library-id最长32。

**输出**

json中的 `profile.attributes` 包含用户属性，服务返回的value/status等字段保留；text显示属性及值，无画像数据时显示提示。字段可能缺省，不能假定每个属性都有value。

**注意事项**

必须先通过add将消息与同一个profile-schema关联并等待抽取。没有单用户画像直接编辑、单值项删除或清空命令。

**示例**

```bash
bl memory add --user-id demo_user --profile-schema '<schema-id>' --extract-mode profile_only --messages '[{"role":"user","content":"我常住杭州，喜欢骑行。"}]' --output json
bl memory profile get --schema-id '<schema-id>' --user-id demo_user --output json
```

`--quiet` 仅隐藏过程提示，不改变最终结果；与 `--output json` 组合时仍返回完整 JSON，与 text 组合时保留完整文本结果。

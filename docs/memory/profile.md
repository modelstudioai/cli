# 画像命令手册

画像模板（profile schema）定义要抽取的属性。用户画像是某个 `--user-id` 在该模板下已经抽出的属性值。创建或更新模板不会自动重算已有用户的画像。

> **通用约定**（鉴权、Workspace ID、全局参数、输出格式、危险操作确认、Dry-run 模式）请参阅 [总览文档](./memory-cli-guide.md#通用约定)。

---

#### `bl memory profile create`

创建画像模板。

**用法**

```bash
bl memory profile create --name <name> --attributes <json> [flags]
```

**参数**

| 参数                                       | 类型   | 必填 | 说明                                                |
| ------------------------------------------ | ------ | ---- | --------------------------------------------------- |
| `--name <name>`                            | string | 是   | 模板名称，最长 32                                   |
| `--description <text>`                     | string | 否   | 模板描述。长度由服务端决定                          |
| `--attributes <json>`                      | string | 是   | 属性定义 JSON 数组                                  |
| `--plan-version <pro\|lite>`               | string | 否   | `pro` 开启 rerank，`lite` 关闭 rerank。两者计费不同 |
| `--extract-scene <efficient\|intelligent>` | string | 否   | 抽取场景。创建时默认 `efficient`                    |
| `--library-id <id>`                        | string | 否   | 记忆库 ID，最长 32。省略时使用账号默认库            |

**参数约束**

- `--attributes` 是 JSON 数组。每项必须有 `name`（最长 32）；`description` 和 `default_value` 可选，各最长 128。
- 清空 `default_value` 时传空字符串。
- `efficient` 可搭配 `lite` 或 `pro`。`intelligent` 搭配 `pro`。`intelligent` 与 `lite` 会被服务端拒绝。
- 创建模板不生成任何用户的画像值。

**输出**

text / quiet：

```
Profile schema created: schema-xxx
```

json 模式：返回含 `profile_schema_id` 的响应。后续命令使用这个 ID。

**示例**

```bash
bl memory profile create --name user_basic \
  --attributes '[{"name":"age","description":"age"},{"name":"hobby","description":"hobby"}]' \
  --workspace-id ws-xxx

bl memory profile create --name user_basic \
  --attributes '[{"name":"age"}]' \
  --plan-version lite --extract-scene efficient --library-id lib-xxx
```

---

#### `bl memory profile list`

分页列出画像模板。

**用法**

```bash
bl memory profile list [flags]
```

**参数**

| 参数                | 类型   | 必填 | 说明                                     |
| ------------------- | ------ | ---- | ---------------------------------------- |
| `--page <n>`        | number | 否   | 页码，至少 1，默认 1。不自动翻页         |
| `--page-size <n>`   | number | 否   | 每页条数，至少 1，默认 10                |
| `--library-id <id>` | string | 否   | 记忆库 ID，最长 32。省略时使用账号默认库 |

**输出**

text / quiet：

```
[schema-xxx] user_basic (lite)
  用户基础资料

Total: 1
```

无模板时输出 `No profile schemas found.`

json 模式：返回 `profile_schemas` 和 `total`。

**示例**

```bash
bl memory profile list --workspace-id ws-xxx

bl memory profile list --page-size 20 --page 2 --output json
```

---

#### `bl memory profile show`

查看模板定义，包括后续更新要用的 `attribute_id`。

**用法**

```bash
bl memory profile show --schema-id <id> [flags]
```

**参数**

| 参数                | 类型   | 必填 | 说明                                     |
| ------------------- | ------ | ---- | ---------------------------------------- |
| `--schema-id <id>`  | string | 是   | 画像模板 ID                              |
| `--library-id <id>` | string | 否   | 记忆库 ID，最长 32。省略时使用账号默认库 |

**输出**

text / quiet：

```
Name: user_basic
Description: 用户基础资料
Attributes:
  [attr-xxx] city
    desc: 用户常住城市
    default:
```

无属性时输出 `No attributes.`

json 模式：返回完整模板，包括服务端给出的 `plan_version` 和 `extract_scene`。

**注意事项**

- 这里的 `attribute_id` 是模板字段句柄。`profile update` 的 update / delete 操作用它定位，不用属性名。
- 用户的具体取值用 `profile get` 读取。

**示例**

```bash
bl memory profile show --schema-id schema-xxx --workspace-id ws-xxx

bl memory profile show --schema-id schema-xxx --output json
```

---

#### `bl memory profile update`

更新模板名称、描述、属性、策略档位或抽取场景。

**用法**

```bash
bl memory profile update --schema-id <id> [flags]
```

**参数**

| 参数                                       | 类型   | 必填 | 说明                                     |
| ------------------------------------------ | ------ | ---- | ---------------------------------------- |
| `--schema-id <id>`                         | string | 是   | 画像模板 ID                              |
| `--name <name>`                            | string | 否¹  | 新名称，最长 32                          |
| `--description <text>`                     | string | 否¹  | 新描述                                   |
| `--attributes-operations <json>`           | string | 否¹  | 属性操作 JSON 数组                       |
| `--plan-version <pro\|lite>`               | string | 否¹  | 策略档位                                 |
| `--extract-scene <efficient\|intelligent>` | string | 否¹  | 抽取场景                                 |
| `--library-id <id>`                        | string | 否   | 记忆库 ID，最长 32。省略时使用账号默认库 |

> ¹ 至少提供 `--name`、`--description`、`--attributes-operations`、`--plan-version`、`--extract-scene` 之一。

**参数约束**

- 属性操作的 `op` 使用小写 `add`、`update`、`delete`。
- `add` 必须有 `name`。`update` 和 `delete` 必须有 `profile show` 返回的 `attribute_id`。
- 属性 name 最长 32，description 与 default_value 最长 128。
- 本命令修改模板定义。它不直接改某个用户已经抽出的画像值，也不保证历史数据会自动重抽。

**输出**

text / quiet：

```
Profile schema schema-xxx updated.
```

**示例**

```bash
bl memory profile update --schema-id schema-xxx --name "user_basic_v2" --workspace-id ws-xxx

bl memory profile update --schema-id schema-xxx \
  --attributes-operations '[{"op":"add","name":"travel_style","description":"旅行方式偏好"}]'

bl memory profile update --schema-id schema-xxx \
  --attributes-operations '[{"op":"update","attribute_id":"attr-xxx","description":"长期稳定的兴趣"}]'

bl memory profile update --schema-id schema-xxx \
  --plan-version pro --extract-scene intelligent
```

---

#### `bl memory profile delete`

删除画像模板及其属性定义。

**用法**

```bash
bl memory profile delete --schema-id <id> [flags]
```

**参数**

| 参数                | 类型   | 必填 | 说明                                     |
| ------------------- | ------ | ---- | ---------------------------------------- |
| `--schema-id <id>`  | string | 是   | 画像模板 ID                              |
| `--library-id <id>` | string | 否   | 记忆库 ID，最长 32。省略时使用账号默认库 |
| `--yes`             | switch | 否   | 确认这次高风险操作                       |

**输出**

text / quiet：

```
Profile schema schema-xxx deleted.
```

未带 `--yes` 时返回 exit code 7，类型为 `requires_confirmation`，不删除模板。

**注意事项**

- 删除的是整份模板。依赖该模板的用户画像随后无法再按这个 schema 读取。
- 它不会只清空某一个用户的画像，记忆节点也不受影响。
- 先 `--dry-run` 核对 schema ID，确认影响范围后再加 `--yes`。

**示例**

```bash
bl memory profile delete --schema-id schema-xxx --dry-run --workspace-id ws-xxx

# 确认影响范围后执行
bl memory profile delete --schema-id schema-xxx --yes
```

---

#### `bl memory profile get`

读取某个用户在指定模板下已经抽出的画像。

**用法**

```bash
bl memory profile get --schema-id <id> --user-id <id> [flags]
```

**参数**

| 参数                | 类型   | 必填 | 说明                                     |
| ------------------- | ------ | ---- | ---------------------------------------- |
| `--schema-id <id>`  | string | 是   | 画像模板 ID                              |
| `--user-id <id>`    | string | 是   | 画像所属的记忆实体 ID，最长 64           |
| `--library-id <id>` | string | 否   | 记忆库 ID，最长 32。省略时使用账号默认库 |

**输出**

text / quiet：有 `value_items` 时每个值项一行，否则打印属性的 `value`。

```
city: 杭州
hobby: 骑行 (item item-xxx, active)
```

没有画像数据时输出 `No profile data found.` 空属性可能没有 value，显示为 `(empty)`。

json 模式：画像在 `profile.attributes`。多值可能合并进 `value` 字符串。

**注意事项**

- 值只在某次 `memory add --profile-schema` 使用了同一个模板 ID 并成功抽取后出现。
- CLI 不提供画像值项的单独编辑或删除。值的变化通过后续消息抽取产生。
- 模板字段定义用 `profile show` 查看。

**示例**

```bash
bl memory profile get --schema-id schema-xxx --user-id user1 --workspace-id ws-xxx

bl memory profile get --schema-id schema-xxx --user-id user1 --output json
```

画像抽取示例见 [记忆节点 / add](node.md#bl-memory-add)。

---

← [返回总览](./memory-cli-guide.md)

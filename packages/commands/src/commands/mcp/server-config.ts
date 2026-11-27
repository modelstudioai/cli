import { readFile } from "node:fs/promises";
import { UsageError, type CommandContext } from "bailian-cli-core";

export const MCP_TYPES = ["STDIO", "HTTP", "SSE", "OPENAPI"] as const;
type JsonObject = Record<string, unknown>;
type InvalidField = (field: string, english: string, chinese: string) => never;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function objectFields(
  value: unknown,
  path: string,
  allowed: string[],
  invalid: InvalidField,
): JsonObject {
  if (!isObject(value)) return invalid(path, "expected a JSON object", "需要 JSON 对象");
  for (const [key, entry] of Object.entries(value)) {
    if (!allowed.includes(key) || entry === null) {
      invalid(`${path}.${key}`, "unsupported field or null value", "不支持该字段或 null 值");
    }
  }
  return value;
}

function checkMap(
  value: unknown,
  kind: "env" | "headers",
  nonblank: boolean,
  invalid: InvalidField,
) {
  if (value === undefined) return;
  const keyPattern = kind === "env" ? /^[A-Za-z_][A-Za-z0-9_]*$/ : /^[!#$%&'*+.^_`|~0-9a-zA-Z-]+$/;
  if (
    !isObject(value) ||
    Object.entries(value).some(
      ([key, entry]) =>
        !keyPattern.test(key) ||
        typeof entry !== "string" ||
        (kind === "headers" && /[\r\n]/.test(entry)) ||
        (nonblank && !entry.trim()),
    )
  ) {
    invalid(kind, "invalid name or string value", "名称或字符串值无效");
  }
}

function checkUrl(value: unknown, field: "url" | "api_host", invalid: InvalidField) {
  if (!isText(value) || !/^https?:\/\//i.test(value) || !URL.canParse(value)) {
    invalid(field, "expected a public HTTP(S) URL", "需要公网 HTTP(S) 地址");
  }
  const url = new URL(value);
  if (
    /[#\\]/.test(value) ||
    url.username ||
    url.password ||
    url.port === "0" ||
    (field === "api_host" && value.includes("?"))
  ) {
    invalid(field, "invalid MCP endpoint URL", "MCP 服务地址格式无效");
  }
}

const PARAMETER_TYPES = ["String", "Number", "Integer", "Boolean", "Object"];
const LOCATIONS = ["Query", "Path", "Header", "Body"];

function checkParameters(
  value: unknown,
  path: string,
  method: unknown,
  depth: number,
  invalid: InvalidField,
) {
  if (!Array.isArray(value) || depth > 32)
    invalid(path, "expected a parameter array within 32 levels", "需要深度不超过 32 层的参数数组");
  const names = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const item = `${path}[${index}]`;
    const param = objectFields(
      entry,
      item,
      ["name", "description", "location", "type", "required", "properties"],
      invalid,
    );
    if (!isText(param.name) || names.has(param.name) || !isText(param.description)) {
      invalid(item, "expected a unique name and a nonblank description", "需要唯一名称和非空描述");
    }
    names.add(param.name);
    if (!PARAMETER_TYPES.some((type) => param.type === type || param.type === `Array<${type}>`)) {
      invalid(`${item}.type`, "unsupported parameter type", "不支持的参数类型");
    }
    if (
      (depth === 1 || param.location !== undefined) &&
      !LOCATIONS.some((location) => location === param.location)
    ) {
      invalid(
        `${item}.location`,
        "expected Query, Path, Header or Body",
        "须为 Query、Path、Header 或 Body",
      );
    }
    const complex = param.type === "Object" || String(param.type).startsWith("Array<");
    if (
      depth === 1 &&
      ((complex && param.location !== "Body") || (method === "GET" && param.location === "Body"))
    ) {
      invalid(
        `${item}.location`,
        "objects and arrays require Body, and GET cannot use Body",
        "对象及数组须放在 Body，GET 不支持 Body",
      );
    }
    if (param.required !== undefined && typeof param.required !== "boolean")
      invalid(`${item}.required`, "expected a boolean", "需要布尔值");
    const hasChildren = param.type === "Object" || param.type === "Array<Object>";
    if (hasChildren) {
      if (!Array.isArray(param.properties) || !param.properties.length)
        invalid(`${item}.properties`, "expected nonempty properties", "需要非空子属性");
      checkParameters(param.properties, `${item}.properties`, method, depth + 1, invalid);
    } else if (
      param.properties !== undefined &&
      !(Array.isArray(param.properties) && param.properties.length === 0)
    ) {
      invalid(
        `${item}.properties`,
        "only object types can define properties",
        "只有对象类型能定义子属性",
      );
    }
  }
}

function checkApis(value: unknown, invalid: InvalidField) {
  if (!Array.isArray(value) || !value.length)
    invalid("api_list", "expected a nonempty API array", "需要非空 API 数组");
  const names = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const path = `api_list[${index}]`;
    const api = objectFields(
      entry,
      path,
      ["name", "description", "path", "method", "content_type", "input_params"],
      invalid,
    );
    if (!isText(api.name) || names.has(api.name) || !isText(api.description))
      invalid(path, "expected a unique name and a nonblank description", "需要唯一名称和非空描述");
    names.add(api.name);
    if (
      !isText(api.path) ||
      !api.path.startsWith("/") ||
      api.path.startsWith("//") ||
      /[#\\]/.test(api.path)
    )
      invalid(
        `${path}.path`,
        "expected a relative path starting with /",
        "需要以 / 开头的相对路径",
      );
    if (api.method !== "GET" && api.method !== "POST")
      invalid(`${path}.method`, "expected GET or POST", "须为 GET 或 POST");
    if (
      api.content_type !== undefined &&
      api.content_type !== "application/json" &&
      api.content_type !== "application/x-www-form-urlencoded"
    )
      invalid(`${path}.content_type`, "unsupported content type", "不支持的内容类型");
    if (api.input_params !== undefined)
      checkParameters(api.input_params, `${path}.input_params`, api.method, 1, invalid);
  }
}

export async function readMcpConfig(
  argument: string,
  type: string,
  localize: CommandContext["localize"],
) {
  const invalid: InvalidField = (field, english, chinese) => {
    throw new UsageError(
      localize({
        "en-US": `--mcp-config ${field}: ${english}.`,
        "zh-CN": `--mcp-config ${field}：${chinese}。`,
      }),
    );
  };
  const input = argument.trim();
  let value: unknown;
  // An object, array or literal is inline JSON. All other inputs are file paths.
  const inline =
    /^[{["]/.test(input) || /^(?:null|true|false|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)$/.test(input);
  const source = inline ? input : await readFile(argument, "utf8");
  try {
    value = JSON.parse(source.trimStart());
  } catch {
    invalid("", "invalid JSON", "JSON 格式错误");
  }
  if (type === "STDIO") {
    const config = objectFields(
      value,
      "STDIO",
      ["command", "args", "env", "fc_deploy_region"],
      invalid,
    );
    if (config.command !== "npx" && config.command !== "uvx")
      invalid("command", "expected npx or uvx", "须为 npx 或 uvx");
    if (
      !Array.isArray(config.args) ||
      !config.args.length ||
      !config.args.every((arg) => isText(arg) && /^[A-Za-z0-9_@./:=,+-]+$/.test(arg))
    ) {
      invalid(
        "args",
        "expected nonempty npx/uvx arguments using supported characters",
        "需要非空的 npx/uvx 参数数组，参数只能包含接口支持的字符",
      );
    }
    checkMap(config.env, "env", false, invalid);
    if (config.fc_deploy_region !== undefined && !isText(config.fc_deploy_region))
      invalid("fc_deploy_region", "expected a nonblank region", "需要非空地域");
    return config;
  }
  if (type === "OPENAPI") {
    const config = objectFields(value, "OPENAPI", ["api_host", "headers", "api_list"], invalid);
    checkUrl(config.api_host, "api_host", invalid);
    checkMap(config.headers, "headers", true, invalid);
    checkApis(config.api_list, invalid);
    return config;
  }
  const config = objectFields(value, type, ["url", "headers"], invalid);
  checkUrl(config.url, "url", invalid);
  checkMap(config.headers, "headers", false, invalid);
  return config;
}

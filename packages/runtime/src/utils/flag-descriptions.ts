/** Shared --foo <bool> help text; keep wording consistent with actual CLI/request behavior. */

export const BOOL_FLAG_WATERMARK = {
  "en-US": "Enable watermark (true/false). Omit flag to use CLI default (true).",
  "zh-CN": "是否启用水印（true/false）。不传时使用 CLI 默认值 true。",
};

/** CLI sends prompt_extend=true when flag omitted (qwen-image edit, etc.). */
export const BOOL_FLAG_PROMPT_EXTEND_CLI_TRUE = {
  "en-US": "Enable prompt extend (true/false). Omit flag to use CLI default (true).",
  "zh-CN": "是否启用提示词扩展（true/false）。不传时使用 CLI 默认值 true。",
};

/** Sync qwen-image defaults on; async models omit the field unless flag is set. */
export const BOOL_FLAG_PROMPT_EXTEND_IMAGE_GENERATE = {
  "en-US":
    "Enable prompt extend (true/false). Omit flag: true for qwen-image sync; parameter omitted on async models (API default).",
  "zh-CN":
    "是否启用提示词扩展（true/false）。不传时：qwen-image 同步调用默认为 true；异步模型不传该参数（使用 API 默认值）。",
};

/** CLI omits prompt_extend in the request when flag is unset (video commands). */
export const BOOL_FLAG_PROMPT_EXTEND_API_DEFAULT = {
  "en-US":
    "Enable prompt extend (true/false). Omit flag to omit the parameter (DashScope default).",
  "zh-CN": "是否启用提示词扩展（true/false）。不传时省略该参数（使用 DashScope 默认值）。",
};

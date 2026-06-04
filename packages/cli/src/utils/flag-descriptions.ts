/** Shared --foo <bool> help text; keep wording consistent across commands. */

export const BOOL_FLAG_WATERMARK =
  "Enable watermark (true/false). Default: true. Omit to use API default.";

/** CLI sends prompt_extend=true when flag omitted (qwen-image edit, etc.). */
export const BOOL_FLAG_PROMPT_EXTEND_CLI_TRUE =
  "Enable prompt extend (true/false). Default: true. Omit to use API default.";

/** Sync qwen-image defaults on; async models omit the field unless flag is set. */
export const BOOL_FLAG_PROMPT_EXTEND_IMAGE_GENERATE =
  "Enable prompt extend (true/false). Default: true for qwen-image sync. Omit to use API default.";

/** CLI omits prompt_extend in the request when flag is unset (video commands). */
export const BOOL_FLAG_PROMPT_EXTEND_API_DEFAULT =
  "Enable prompt extend (true/false). Default: API default. Omit to use API default.";

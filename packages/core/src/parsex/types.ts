export type ParsexOperation = "parse" | "extract";
export type ParsexStatus = "init" | "processing" | "success" | "failed";

export interface ParsexOssCredentials {
  access_key_id: string;
  access_key_secret: string;
  security_token?: string;
}

export interface ParsexOssConfig extends ParsexOssCredentials {
  bucket: string;
  endpoint: string;
}

export interface ParsexSubmitRequest {
  file_url?: string;
  parsed_file_biz_id?: string;
  file_name?: string;
  file_name_extension?: string;
  config_id?: string;
  processing?: Record<string, unknown>;
  output?: {
    output_file_format?: string[];
    layout_table_format?: string;
    oss_config?: ParsexOssConfig;
  };
}

export interface ParsexResultRequest {
  biz_id: string;
  step_start?: number;
  step_size?: number;
  oss_config?: ParsexOssCredentials;
}

export interface ParsexResponse<Data> {
  request_id?: string;
  data: Data;
}

/** Preserve all result fields, including layouts, media segments and citations. */
export interface ParsexResultData {
  status: ParsexStatus | (string & {});
  processing?: number;
  code?: string;
  message?: string;
  [field: string]: unknown;
}

export type ParsexSubmitResponse = ParsexResponse<{ biz_id: string }>;
export type ParsexResultResponse = ParsexResponse<ParsexResultData>;

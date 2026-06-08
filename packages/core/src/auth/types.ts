export type AuthMethod = "api-key" | "access-token";

export type AuthMode = "standard-api-key" | "coding-plan" | "token-plan";

export type AuthApiStyle = "dashscope-native" | "openai-compatible";

export interface ResolvedCredential {
  token: string;
  method: AuthMethod;
  mode: AuthMode;
  source: string;
  baseUrl: string;
  apiStyle: AuthApiStyle;
}

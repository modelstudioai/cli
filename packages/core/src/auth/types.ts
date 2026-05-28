export type AuthMethod = "api-key" | "access-token";

export interface ResolvedCredential {
  token: string;
  method: AuthMethod;
  source: string;
}

/** Startup migration only; request paths never consult external config. */
export function initialSettingsPatch(
  initialized: boolean,
  workspaceId: string | undefined,
  personalWorkspace: string | null,
  blWorkspace: string | undefined,
): { configInitialized?: boolean; workspaceId?: string } {
  if (initialized) return {};
  const seed = personalWorkspace || blWorkspace;
  return {
    ...(workspaceId === undefined && seed ? { workspaceId: seed } : {}),
    configInitialized: true,
  };
}

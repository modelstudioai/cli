// bl skill management: OSS unified publishing protocol client + local install/fan-out/status reconciliation.
export type {
  SkillIndexEntry,
  SkillsIndex,
  SkillLockEntry,
  SkillLockFile,
  SkillStatus,
  SkillStatusRow,
} from "./types.ts";
export {
  getSkillRegistryBaseUrl,
  fetchSkillsIndex,
  downloadSkillAsset,
  resolveAssetFileName,
} from "./registry.ts";
export {
  getSkillsDir,
  getSkillLockPath,
  emptySkillLock,
  readSkillLock,
  writeSkillLock,
  upsertSkillLockEntry,
} from "./lock.ts";
export { sanitizeSkillName, isSafeSkillName } from "./sanitize.ts";
export { parseSkillNames } from "./names.ts";
export { validateSkillDir, type SkillMeta } from "./validate.ts";
export { extractTarBr, atomicSwap, isSafeEntryName, computeDirContentHash } from "./extract.ts";
export {
  getAgentTargets,
  detectInstalledAgents,
  linkSkillToAgents,
  unlinkSkillFromAgents,
  type AgentTarget,
  type LinkResult,
} from "./agents.ts";
export {
  installSkill,
  installSkillFromBuffer,
  installSkillWithFanout,
  buildSkillLockEntry,
  removeSkillDir,
  type InstalledSkill,
  type SkillInstallRecord,
} from "./installer.ts";
export { listSkillDirsOnDisk, computeSkillStatuses } from "./status.ts";

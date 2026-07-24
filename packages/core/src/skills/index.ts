// bl skill management: OSS unified publishing protocol client + local install/fan-out/status reconciliation.
export type {
  SkillIndexEntry,
  SkillsIndex,
  SkillLockEntry,
  SkillLockFile,
  SkillStatus,
  SkillStatusRow,
} from "./types.ts";
export { getSkillRegistryBaseUrl, fetchSkillsIndex, downloadSkillAsset } from "./registry.ts";
export {
  getSkillsDir,
  getSkillLockPath,
  emptySkillLock,
  readSkillLock,
  writeSkillLock,
  upsertSkillLockEntry,
} from "./lock.ts";
export { sanitizeSkillName, isSafeSkillName } from "./sanitize.ts";
export { validateSkillDir, type SkillMeta } from "./validate.ts";
export { extractTarBr, atomicSwap, isSafeEntryName } from "./extract.ts";
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
  removeSkillDir,
  type InstalledSkill,
} from "./installer.ts";
export { listSkillDirsOnDisk, computeSkillStatuses } from "./status.ts";

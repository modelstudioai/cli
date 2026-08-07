// Command library for bailian-cli products. Exposes individual command
// implementations only — no path presets or capability groups. Each product
// entrypoint (bl / rag / …) builds its own `{ "<path>": command }` map, so the
// command paths a product exposes are a product decision, not baked in here.

export { default as authLogin } from "./commands/auth/login.ts";
export { default as authStatus } from "./commands/auth/status.ts";
export { default as authLogout } from "./commands/auth/logout.ts";
export { default as authGenerateAccessToken } from "./commands/auth/generate-access-token.ts";
export { default as textChat } from "./commands/text/chat.ts";
export { default as textOmni } from "./commands/omni/chat.ts";
export { default as imageGenerate } from "./commands/image/generate.ts";
export { default as imageEdit } from "./commands/image/edit.ts";
export { default as videoGenerate } from "./commands/video/generate.ts";
export { default as videoEdit } from "./commands/video/edit.ts";
export { default as videoRef } from "./commands/video/ref.ts";
export { default as videoTaskGet } from "./commands/video/task-get.ts";
export { default as videoDownload } from "./commands/video/download.ts";
export { default as visionDescribe } from "./commands/vision/describe.ts";
export { default as configShow } from "./commands/config/show.ts";
export { default as configSet } from "./commands/config/set.ts";
export { default as configList } from "./commands/config/list.ts";
export { default as configUse } from "./commands/config/use.ts";
export { default as configUi } from "./commands/config/ui.ts";
export { default as configAgent } from "./commands/config/agent/index.ts";
export { default as update } from "./commands/update.ts";
export { default as appCall } from "./commands/app/call.ts";
export { default as appList } from "./commands/app/list.ts";
export { default as memoryAdd } from "./commands/memory/add.ts";
export { default as memorySearch } from "./commands/memory/search.ts";
export { default as memoryList } from "./commands/memory/list.ts";
export { default as memoryUpdate } from "./commands/memory/update.ts";
export { default as memoryDelete } from "./commands/memory/delete.ts";
export { default as memoryProfileCreate } from "./commands/memory/profile-create.ts";
export { default as memoryProfileGet } from "./commands/memory/profile-get.ts";
export { default as knowledgeRetrieve } from "./commands/knowledge/retrieve.ts";
export { default as knowledgeSearch } from "./commands/knowledge/search.ts";
export { default as knowledgeChat } from "./commands/knowledge/chat.ts";
export { default as mcpCall } from "./commands/mcp/call.ts";
export { default as mcpList } from "./commands/mcp/list.ts";
export { default as mcpTools } from "./commands/mcp/tools.ts";
export { default as searchWeb } from "./commands/search/web.ts";
export { default as speechSynthesize } from "./commands/speech/synthesize.ts";
export { default as speechRecognize } from "./commands/speech/recognize.ts";
export { default as fileUpload } from "./commands/file/upload.ts";
export { default as consoleCall } from "./commands/console/call.ts";
export { default as usageFree } from "./commands/usage/free.ts";
export { default as usageFreetier } from "./commands/usage/freetier.ts";
export { default as usageStats } from "./commands/usage/stats.ts";
export { default as usageSummary } from "./commands/usage/summary.ts";
export { default as pipelineRun } from "./commands/pipeline/run.ts";
export { default as pipelineValidate } from "./commands/pipeline/validate.ts";
export { default as advisorRecommend } from "./commands/advisor/recommend.ts";
export { default as modelList } from "./commands/model/list.ts";
export { default as workspaceList } from "./commands/workspace/list.ts";
export { default as quotaList } from "./commands/quota/list.ts";
export { default as quotaRequest } from "./commands/quota/request.ts";
export { default as quotaHistory } from "./commands/quota/history.ts";
export { default as quotaCheck } from "./commands/quota/check.ts";
export { default as datasetUpload } from "./commands/dataset/upload.ts";
export { default as datasetList } from "./commands/dataset/list.ts";
export { default as datasetGet } from "./commands/dataset/get.ts";
export { default as datasetDelete } from "./commands/dataset/delete.ts";
export { default as datasetValidate } from "./commands/dataset/validate.ts";
export {
  finetuneTextCreate,
  finetuneAudioCreate,
  finetuneImageCreate,
  finetuneVideoCreate,
} from "./commands/finetune/create.ts";
export { default as finetuneList } from "./commands/finetune/list.ts";
export { default as finetuneGet } from "./commands/finetune/get.ts";
export { default as finetuneCancel } from "./commands/finetune/cancel.ts";
export { default as finetuneDelete } from "./commands/finetune/delete.ts";
export { default as finetuneLogs } from "./commands/finetune/logs.ts";
export { default as finetuneCheckpoints } from "./commands/finetune/checkpoints.ts";
export { default as finetuneExport } from "./commands/finetune/export.ts";
export { default as finetuneWatch } from "./commands/finetune/watch.ts";
export { default as finetuneCapability } from "./commands/finetune/capability.ts";
export { default as finetunePrice } from "./commands/finetune/price.ts";
export {
  deployTextCreate,
  deployAudioCreate,
  deployImageCreate,
} from "./commands/deploy/create.ts";
export { default as deployList } from "./commands/deploy/list.ts";
export { default as deployGet } from "./commands/deploy/get.ts";
export { default as deployModels } from "./commands/deploy/models.ts";
export { default as deployScale } from "./commands/deploy/scale.ts";
export { default as deployUpdate } from "./commands/deploy/update.ts";
export { default as deployDelete } from "./commands/deploy/delete.ts";
export { default as deployPause } from "./commands/deploy/pause.ts";
export { default as deployResume } from "./commands/deploy/resume.ts";
export { default as tokenPlanListSeats } from "./commands/token-plan/list-seats.ts";
export { default as tokenPlanCreateKey } from "./commands/token-plan/create-key.ts";
export { default as tokenPlanAssignSeats } from "./commands/token-plan/assign-seats.ts";
export { default as tokenPlanAddMember } from "./commands/token-plan/add-member.ts";
export { default as managedAgentInit } from "./commands/managed-agent/init.ts";
export { default as managedAgentValidate } from "./commands/managed-agent/validate.ts";
export { default as managedAgentPlan } from "./commands/managed-agent/plan.ts";
export { default as managedAgentApply } from "./commands/managed-agent/apply.ts";
export { default as managedAgentDestroy } from "./commands/managed-agent/destroy.ts";
export { default as managedAgentStateList } from "./commands/managed-agent/state-list.ts";
export { default as managedAgentStateShow } from "./commands/managed-agent/state-show.ts";
export { default as managedAgentStateRm } from "./commands/managed-agent/state-rm.ts";
export { default as managedAgentStateImport } from "./commands/managed-agent/state-import.ts";
export { default as managedAgentSessionCreate } from "./commands/managed-agent/session-create.ts";
export { default as managedAgentSessionList } from "./commands/managed-agent/session-list.ts";
export { default as managedAgentSessionGet } from "./commands/managed-agent/session-get.ts";
export { default as managedAgentSessionDelete } from "./commands/managed-agent/session-delete.ts";
export { default as managedAgentSessionRun } from "./commands/managed-agent/session-run.ts";
export { default as managedAgentSessionSend } from "./commands/managed-agent/session-send.ts";
export { default as managedAgentSessionEvents } from "./commands/managed-agent/session-events.ts";
export { default as managedAgentSkillList } from "./commands/managed-agent/skill-list.ts";
export { default as workspaceInit } from "./commands/workspace/init.ts";
export { default as pluginInstall } from "./commands/plugin/install.ts";
export { default as pluginLink } from "./commands/plugin/link.ts";
export { default as pluginList } from "./commands/plugin/list.ts";
export { default as pluginRemove } from "./commands/plugin/remove.ts";
export { default as skillAdd } from "./commands/skill/add.ts";
export { default as skillUpdate } from "./commands/skill/update.ts";
export { default as skillRemove } from "./commands/skill/remove.ts";
export { default as skillList } from "./commands/skill/list.ts";

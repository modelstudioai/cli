/**
 * 各 topic E2E 的最小路由（path → bailian-cli-commands export 名）。
 * 仅包含该 topic 测试会调用的 path，不维护全量产品 map。
 */
export type E2eRouteExports = Record<string, string>;

export const AUTH_ROUTES: E2eRouteExports = {
  "auth login": "authLogin",
  "auth status": "authStatus",
  "auth logout": "authLogout",
};

export const UPDATE_ROUTES: E2eRouteExports = {
  update: "update",
};

export const TEXT_CHAT_ROUTES: E2eRouteExports = { "text chat": "textChat" };

export const CONFIG_ROUTES: E2eRouteExports = {
  "config show": "configShow",
  "config set": "configSet",
  "config list": "configList",
  "config use": "configUse",
  "config ui": "configUi",
  "config agent": "configAgent",
};

export const MEMORY_ROUTES: E2eRouteExports = {
  "memory add": "memoryAdd",
  "memory search": "memorySearch",
  "memory list": "memoryList",
  "memory update": "memoryUpdate",
  "memory delete": "memoryDelete",
  "memory profile create": "memoryProfileCreate",
  "memory profile get": "memoryProfileGet",
};

export const KNOWLEDGE_ROUTES: E2eRouteExports = {
  "knowledge retrieve": "knowledgeRetrieve",
  "knowledge search": "knowledgeSearch",
  "knowledge chat": "knowledgeChat",
  "knowledge list": "knowledgeKbList", // live: grab a real index id for retrieve
};

export const KNOWLEDGE_SEARCH_ROUTES: E2eRouteExports = {
  "knowledge search": "knowledgeSearch",
};

export const KNOWLEDGE_CHAT_ROUTES: E2eRouteExports = {
  "knowledge chat": "knowledgeChat",
};

export const IMAGE_ROUTES: E2eRouteExports = {
  "image generate": "imageGenerate",
  "image edit": "imageEdit",
};

export const VIDEO_ROUTES: E2eRouteExports = {
  "image generate": "imageGenerate",
  "video generate": "videoGenerate",
  "video edit": "videoEdit",
  "video ref": "videoRef",
  "video task get": "videoTaskGet",
  "video download": "videoDownload",
  "speech synthesize": "speechSynthesize",
};

export const VISION_ROUTES: E2eRouteExports = {
  "vision describe": "visionDescribe",
};

export const SPEECH_ROUTES: E2eRouteExports = {
  "speech synthesize": "speechSynthesize",
  "speech recognize": "speechRecognize",
};

export const MCP_ROUTES: E2eRouteExports = {
  "mcp call": "mcpCall",
  "mcp list": "mcpList",
  "mcp tools": "mcpTools",
};

export const SEARCH_WEB_ROUTES: E2eRouteExports = { "search web": "searchWeb" };

export const PIPELINE_ROUTES: E2eRouteExports = {
  "pipeline run": "pipelineRun",
  "pipeline validate": "pipelineValidate",
};

export const OMNI_ROUTES: E2eRouteExports = {
  omni: "textOmni",
  "speech synthesize": "speechSynthesize",
};

export const FILE_UPLOAD_ROUTES: E2eRouteExports = {
  "file upload": "fileUpload",
};

export const ADVISOR_ROUTES: E2eRouteExports = {
  "advisor recommend": "advisorRecommend",
};

export const QUOTA_ROUTES: E2eRouteExports = {
  "quota list": "quotaList",
  "quota update": "quotaUpdate",
  "quota delete": "quotaDelete",
  // Backward-compatible alias of "quota update".
  "quota request": "quotaUpdate",
  "quota history": "quotaHistory",
  "quota check": "quotaCheck",
};

export const PERMISSION_ROUTES: E2eRouteExports = {
  "permission list": "permissionList",
  "permission grant": "permissionGrant",
  "permission revoke": "permissionRevoke",
};

export const USAGE_ROUTES: E2eRouteExports = {
  "usage free": "usageFree",
  "usage freetier": "usageFreetier",
  "usage stats": "usageStats",
  "usage token-plan": "usageTokenPlan",
  "usage coding-plan": "usageCodingPlan",
};

export const DEPLOY_ROUTES: E2eRouteExports = {
  "deploy text create": "deployTextCreate",
  "deploy audio create": "deployAudioCreate",
  "deploy image create": "deployImageCreate",
  "deploy list": "deployList",
  "deploy get": "deployGet",
  "deploy models": "deployModels",
  "deploy scale": "deployScale",
  "deploy update": "deployUpdate",
  "deploy delete": "deployDelete",
};

export const DATASET_ROUTES: E2eRouteExports = {
  "dataset upload": "datasetUpload",
  "dataset list": "datasetList",
  "dataset get": "datasetGet",
  "dataset delete": "datasetDelete",
  "dataset validate": "datasetValidate",
};

export const FINETUNE_ROUTES: E2eRouteExports = {
  "finetune text create": "finetuneTextCreate",
  "finetune audio create": "finetuneAudioCreate",
  "finetune image create": "finetuneImageCreate",
  "finetune video create": "finetuneVideoCreate",
  "finetune list": "finetuneList",
  "finetune get": "finetuneGet",
  "finetune cancel": "finetuneCancel",
  "finetune delete": "finetuneDelete",
  "finetune logs": "finetuneLogs",
  "finetune checkpoints": "finetuneCheckpoints",
  "finetune export": "finetuneExport",
  "finetune watch": "finetuneWatch",
  "finetune capability": "finetuneCapability",
};

export const CONSOLE_FLAGS_DRY_RUN_ROUTES: E2eRouteExports = {
  "auth login": "authLogin",
  "console call": "consoleCall",
  "mcp list": "mcpList",
  "quota check": "quotaCheck",
};

export const TOKEN_PLAN_ROUTES: E2eRouteExports = {
  "token-plan list-seats": "tokenPlanListSeats",
  "token-plan create-key": "tokenPlanCreateKey",
  "token-plan assign-seats": "tokenPlanAssignSeats",
  "token-plan add-member": "tokenPlanAddMember",
};

export const SKILL_ROUTES: E2eRouteExports = {
  "skill add": "skillAdd",
  "skill update": "skillUpdate",
  "skill remove": "skillRemove",
  "skill list": "skillList",
  "skill init": "skillInit",
};

export const MANAGED_AGENT_ROUTES: E2eRouteExports = {
  "managed-agent init": "managedAgentInit",
  "managed-agent validate": "managedAgentValidate",
  "managed-agent plan": "managedAgentPlan",
  "managed-agent apply": "managedAgentApply",
  "managed-agent destroy": "managedAgentDestroy",
  "managed-agent state list": "managedAgentStateList",
  "managed-agent state rm": "managedAgentStateRm",
  "managed-agent state import": "managedAgentStateImport",
  "managed-agent session create": "managedAgentSessionCreate",
  "managed-agent session get": "managedAgentSessionGet",
  "managed-agent session delete": "managedAgentSessionDelete",
  "managed-agent session run": "managedAgentSessionRun",
  "managed-agent session send": "managedAgentSessionSend",
  "managed-agent session list": "managedAgentSessionList",
  "managed-agent session events": "managedAgentSessionEvents",
  "managed-agent skill-list": "managedAgentSkillList",
  "managed-agent capabilities": "managedAgentCapabilities",
  "managed-agent agent create": "managedAgentAgentCreate",
  "managed-agent agent list": "managedAgentAgentList",
  "managed-agent agent get": "managedAgentAgentGet",
  "managed-agent agent search": "managedAgentAgentSearch",
  "managed-agent agent versions": "managedAgentAgentVersions",
  "managed-agent environment create": "managedAgentEnvironmentCreate",
  "managed-agent environment list": "managedAgentEnvironmentList",
  "managed-agent environment get": "managedAgentEnvironmentGet",
  "managed-agent environment search": "managedAgentEnvironmentSearch",
  "managed-agent skill create": "managedAgentSkillCreate",
  "managed-agent skill list": "managedAgentSkillList",
  "managed-agent skill get": "managedAgentSkillGet",
  "managed-agent skill search": "managedAgentSkillSearch",
  "managed-agent skill versions": "managedAgentSkillVersions",
  "managed-agent skill download": "managedAgentSkillDownload",
  "managed-agent vault create": "managedAgentVaultCreate",
  "managed-agent vault credential create": "managedAgentVaultCredentialCreate",
  "managed-agent vault list": "managedAgentVaultList",
  "managed-agent vault get": "managedAgentVaultGet",
  "managed-agent vault search": "managedAgentVaultSearch",
  "managed-agent deployment create": "managedAgentDeploymentCreate",
  "managed-agent deployment list": "managedAgentDeploymentList",
  "managed-agent deployment get": "managedAgentDeploymentGet",
  "managed-agent deployment search": "managedAgentDeploymentSearch",
  "managed-agent deployment runs list": "managedAgentDeploymentRunsList",
  "managed-agent deployment runs get": "managedAgentDeploymentRunsGet",
  "managed-agent deployment run": "managedAgentDeploymentRun",
  "managed-agent deployment pause": "managedAgentDeploymentPause",
  "managed-agent deployment unpause": "managedAgentDeploymentUnpause",
  "managed-agent session search": "managedAgentSessionSearch",
  "managed-agent session update": "managedAgentSessionUpdate",
  "managed-agent session archive": "managedAgentSessionArchive",
  "managed-agent session event list": "managedAgentSessionEventList",
  "managed-agent session event send": "managedAgentSessionEventSend",
  "managed-agent session event stream": "managedAgentSessionEventStream",
  "managed-agent session debug": "managedAgentSessionDebug",
  "managed-agent session export": "managedAgentSessionExport",
  "managed-agent file upload": "managedAgentFileUpload",
  "managed-agent file list": "managedAgentFileList",
  "managed-agent file get": "managedAgentFileGet",
  "managed-agent file search": "managedAgentFileSearch",
  "managed-agent file download": "managedAgentFileDownload",
  "managed-agent file delete": "managedAgentFileDelete",
};

export const KNOWLEDGE_KB_LIST_ROUTES: E2eRouteExports = {
  "knowledge list": "knowledgeKbList",
};

export const KNOWLEDGE_KB_INFO_ROUTES: E2eRouteExports = {
  "knowledge info": "knowledgeKbInfo",
  "knowledge list": "knowledgeKbList", // live cases list first to grab a real id
};

export const KNOWLEDGE_DOC_LIST_ROUTES: E2eRouteExports = {
  "knowledge doc list": "knowledgeDocList",
  "knowledge list": "knowledgeKbList", // live cases grab a real index id first
};

export const KNOWLEDGE_DOC_STATUS_ROUTES: E2eRouteExports = {
  "knowledge doc status": "knowledgeDocStatus",
  "knowledge doc upload": "knowledgeDocUpload", // live: produce a real job_id
  "knowledge create": "knowledgeKbCreate", // live: create a throwaway base
  "knowledge delete": "knowledgeKbDelete", // live: cleanup the throwaway base
  "knowledge file delete": "knowledgeFileDelete", // live: cleanup data-center files
};

export const KNOWLEDGE_DOC_UPLOAD_ROUTES: E2eRouteExports = {
  "knowledge doc upload": "knowledgeDocUpload",
  "knowledge file delete": "knowledgeFileDelete", // live cleanup of data-center files
  "knowledge list": "knowledgeKbList", // live: grab a real index id for --index-id --wait
};

export const KNOWLEDGE_KB_CREATE_ROUTES: E2eRouteExports = {
  "knowledge create": "knowledgeKbCreate",
};

export const KNOWLEDGE_KB_UPDATE_ROUTES: E2eRouteExports = {
  "knowledge update": "knowledgeKbUpdate",
};

export const KNOWLEDGE_KB_DELETE_ROUTES: E2eRouteExports = {
  "knowledge delete": "knowledgeKbDelete",
  "knowledge create": "knowledgeKbCreate", // live self-cleaning chain
  "knowledge update": "knowledgeKbUpdate", // live update step in the chain
  "knowledge info": "knowledgeKbInfo", // live: verify update landed on the server
  "knowledge list": "knowledgeKbList",
  "knowledge doc upload": "knowledgeDocUpload",
  "knowledge doc list": "knowledgeDocList", // live: verify imported file is visible in the KB
  "knowledge file delete": "knowledgeFileDelete", // live cleanup of data-center files
};

export const KNOWLEDGE_DOC_DELETE_ROUTES: E2eRouteExports = {
  "knowledge doc delete": "knowledgeDocDelete",
};

export const KNOWLEDGE_DOC_TAG_ROUTES: E2eRouteExports = {
  "knowledge doc tag": "knowledgeDocTag",
  "knowledge doc upload": "knowledgeDocUpload", // live uploads first to grab a real fileId
  "knowledge file get": "knowledgeFileGet", // live: verify tags landed on the server
  "knowledge file delete": "knowledgeFileDelete", // live cleanup of data-center files
};

export const KNOWLEDGE_KB_STATS_ROUTES: E2eRouteExports = {
  "knowledge stats": "knowledgeKbStats",
};

export const KNOWLEDGE_SERVICE_ROUTES: E2eRouteExports = {
  "knowledge service list": "knowledgeServiceList",
  "knowledge service get": "knowledgeServiceGet",
  "knowledge service create": "knowledgeServiceCreate",
  "knowledge service update": "knowledgeServiceUpdate",
  "knowledge service deploy": "knowledgeServiceDeploy",
  "knowledge service delete": "knowledgeServiceDelete",
  "knowledge service copy": "knowledgeServiceCopy",
  "knowledge search": "knowledgeSearch", // beta verification chain smoke
};

export const KNOWLEDGE_CHUNK_CATEGORY_FILE_ROUTES: E2eRouteExports = {
  "knowledge chunk add": "knowledgeChunkAdd",
  "knowledge chunk list": "knowledgeChunkList",
  "knowledge chunk update": "knowledgeChunkUpdate",
  "knowledge chunk delete": "knowledgeChunkDelete",
  "knowledge stats": "knowledgeKbStats",
  "knowledge retrieve": "knowledgeRetrieve", // live rerank retrieval on the throwaway base
  "knowledge category list": "knowledgeCategoryList",
  "knowledge category add": "knowledgeCategoryAdd",
  "knowledge category delete": "knowledgeCategoryDelete",
  "knowledge file list": "knowledgeFileList",
  "knowledge file get": "knowledgeFileGet",
  "knowledge file delete": "knowledgeFileDelete",
  "knowledge collection create": "knowledgeCollectionCreate",
  "knowledge collection get": "knowledgeCollectionGet",
  "knowledge doc import-oss": "knowledgeDocImportOss",
  "knowledge list": "knowledgeKbList", // live grabs a real index id
  "knowledge doc list": "knowledgeDocList", // table fixture: resolve the document-level dataId
  "knowledge doc upload": "knowledgeDocUpload", // live produces a fileId
  "knowledge doc delete": "knowledgeDocDelete", // live verifies document-level delete semantics
};

// ---- Journey-level routes (full user-journey chains, see journeys/README.md) ----

/** Minimal create/cleanup routes shared by J1–J4 */
const JOURNEY_KB_BASE_ROUTES: E2eRouteExports = {
  "knowledge doc upload": "knowledgeDocUpload",
  "knowledge create": "knowledgeKbCreate",
  "knowledge retrieve": "knowledgeRetrieve",
  "knowledge delete": "knowledgeKbDelete",
  "knowledge file delete": "knowledgeFileDelete", // clean up data-center files
};

export const JOURNEY_J1_ROUTES: E2eRouteExports = {
  ...JOURNEY_KB_BASE_ROUTES,
  "knowledge service create": "knowledgeServiceCreate",
  "knowledge service get": "knowledgeServiceGet", // search-service retrieval-parameter backfill chain
  "knowledge service update": "knowledgeServiceUpdate",
  "knowledge service delete": "knowledgeServiceDelete",
  "knowledge search": "knowledgeSearch",
  "knowledge chat": "knowledgeChat",
};

export const JOURNEY_J2_ROUTES: E2eRouteExports = {
  ...JOURNEY_KB_BASE_ROUTES,
  "knowledge doc list": "knowledgeDocList",
  "knowledge doc status": "knowledgeDocStatus",
  "knowledge doc tag": "knowledgeDocTag",
  "knowledge doc delete": "knowledgeDocDelete",
  "knowledge stats": "knowledgeKbStats",
};

export const JOURNEY_J3_ROUTES: E2eRouteExports = {
  ...JOURNEY_KB_BASE_ROUTES,
  "knowledge chunk list": "knowledgeChunkList",
  "knowledge chunk update": "knowledgeChunkUpdate",
  "knowledge chunk delete": "knowledgeChunkDelete", // negative branch: delete an unknown chunk id
};

export const JOURNEY_J4_ROUTES: E2eRouteExports = {
  ...JOURNEY_KB_BASE_ROUTES,
  "knowledge service create": "knowledgeServiceCreate",
  "knowledge service update": "knowledgeServiceUpdate",
  "knowledge service get": "knowledgeServiceGet",
  "knowledge service deploy": "knowledgeServiceDeploy",
  "knowledge service delete": "knowledgeServiceDelete",
  "knowledge search": "knowledgeSearch",
};

export const JOURNEY_J5_ROUTES: E2eRouteExports = {
  "knowledge collection create": "knowledgeCollectionCreate",
  "knowledge collection get": "knowledgeCollectionGet",
  "knowledge category add": "knowledgeCategoryAdd",
  "knowledge category list": "knowledgeCategoryList",
  "knowledge category delete": "knowledgeCategoryDelete",
  "knowledge file list": "knowledgeFileList",
  "knowledge file get": "knowledgeFileGet",
  "knowledge file delete": "knowledgeFileDelete",
  "knowledge doc upload": "knowledgeDocUpload",
};

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
  "quota request": "quotaRequest",
  "quota history": "quotaHistory",
  "quota check": "quotaCheck",
};

export const USAGE_ROUTES: E2eRouteExports = {
  "usage free": "usageFree",
  "usage freetier": "usageFreetier",
  "usage stats": "usageStats",
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

export const MANAGED_AGENT_ROUTES: E2eRouteExports = {
  "managed-agent init": "managedAgentInit",
  "managed-agent apply": "managedAgentApply",
  "managed-agent destroy": "managedAgentDestroy",
  "managed-agent state rm": "managedAgentStateRm",
  "managed-agent state import": "managedAgentStateImport",
  "managed-agent session create": "managedAgentSessionCreate",
  "managed-agent session delete": "managedAgentSessionDelete",
  "managed-agent session run": "managedAgentSessionRun",
  "managed-agent session send": "managedAgentSessionSend",
};

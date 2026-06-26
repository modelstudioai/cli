// Command library for bailian-cli products. Exposes individual command
// implementations only — no path presets or capability groups. Each product
// entrypoint (bl / rag / …) builds its own `{ "<path>": command }` map, so the
// command paths a product exposes are a product decision, not baked in here.

export { default as authLogin } from "./commands/auth/login.ts";
export { default as authStatus } from "./commands/auth/status.ts";
export { default as authLogout } from "./commands/auth/logout.ts";
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
export { default as pipelineRun } from "./commands/pipeline/run.ts";
export { default as pipelineValidate } from "./commands/pipeline/validate.ts";
export { default as advisorRecommend } from "./commands/advisor/recommend.ts";
export { default as workspaceList } from "./commands/workspace/list.ts";
export { default as quotaList } from "./commands/quota/list.ts";
export { default as quotaRequest } from "./commands/quota/request.ts";
export { default as quotaHistory } from "./commands/quota/history.ts";
export { default as quotaCheck } from "./commands/quota/check.ts";

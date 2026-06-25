import type { Command } from "bailian-cli-core";

import authLogin from "./auth/login.ts";
import authStatus from "./auth/status.ts";
import authLogout from "./auth/logout.ts";
import textChat from "./text/chat.ts";
import textOmni from "./omni/chat.ts";
import imageGenerate from "./image/generate.ts";
import imageEdit from "./image/edit.ts";
import videoGenerate from "./video/generate.ts";
import videoEdit from "./video/edit.ts";
import videoRef from "./video/ref.ts";
import videoTaskGet from "./video/task-get.ts";
import videoDownload from "./video/download.ts";
import visionDescribe from "./vision/describe.ts";
import configShow from "./config/show.ts";
import configSet from "./config/set.ts";
import configExportSchema from "./config/export-schema.ts";
import update from "./update.ts";
import appCall from "./app/call.ts";
import appList from "./app/list.ts";
import memoryAdd from "./memory/add.ts";
import memorySearch from "./memory/search.ts";
import memoryList from "./memory/list.ts";
import memoryUpdate from "./memory/update.ts";
import memoryDelete from "./memory/delete.ts";
import memoryProfileCreate from "./memory/profile-create.ts";
import memoryProfileGet from "./memory/profile-get.ts";
import knowledgeRetrieve from "./knowledge/retrieve.ts";
import mcpCall from "./mcp/call.ts";
import mcpList from "./mcp/list.ts";
import mcpTools from "./mcp/tools.ts";
import searchWeb from "./search/web.ts";
import speechSynthesize from "./speech/synthesize.ts";
import speechRecognize from "./speech/recognize.ts";
import fileUpload from "./file/upload.ts";
import datasetUpload from "./dataset/upload.ts";
import datasetList from "./dataset/list.ts";
import datasetGet from "./dataset/get.ts";
import datasetDelete from "./dataset/delete.ts";
import datasetValidate from "./dataset/validate.ts";
import finetuneCreate from "./finetune/create.ts";
import finetuneList from "./finetune/list.ts";
import finetuneGet from "./finetune/get.ts";
import finetuneCancel from "./finetune/cancel.ts";
import finetuneDelete from "./finetune/delete.ts";
import finetuneLogs from "./finetune/logs.ts";
import finetuneCheckpoints from "./finetune/checkpoints.ts";
import finetuneExport from "./finetune/export.ts";
import finetuneWatch from "./finetune/watch.ts";
import finetuneCapability from "./finetune/capability.ts";
import deployCreate from "./deploy/create.ts";
import deployList from "./deploy/list.ts";
import deployGet from "./deploy/get.ts";
import deployModels from "./deploy/models.ts";
import deployScale from "./deploy/scale.ts";
import deployUpdate from "./deploy/update.ts";
import deployDelete from "./deploy/delete.ts";
import consoleCall from "./console/call.ts";
import usageFree from "./usage/free.ts";
import usageFreetier from "./usage/freetier.ts";
import usageStats from "./usage/stats.ts";
import pipelineRun from "./pipeline/run.ts";
import pipelineValidate from "./pipeline/validate.ts";
import advisorRecommend from "./advisor/recommend.ts";
import workspaceList from "./workspace/list.ts";
import quotaList from "./quota/list.ts";
import quotaRequest from "./quota/request.ts";
import quotaHistory from "./quota/history.ts";
import quotaCheck from "./quota/check.ts";
import tokenPlanListSeats from "./token-plan/list-seats.ts";
import tokenPlanCreateKey from "./token-plan/create-key.ts";
import tokenPlanAssignSeats from "./token-plan/assign-seats.ts";
import tokenPlanAddMember from "./token-plan/add-member.ts";

/** Command registry map (no dependency on registry.ts — safe for build-time import). */
export const commands: Record<string, Command> = {
  "auth login": authLogin,
  "auth status": authStatus,
  "auth logout": authLogout,
  "text chat": textChat,
  omni: textOmni,
  "image generate": imageGenerate,
  "image edit": imageEdit,
  "video generate": videoGenerate,
  "video edit": videoEdit,
  "video ref": videoRef,
  "video task get": videoTaskGet,
  "video download": videoDownload,
  "vision describe": visionDescribe,
  "app call": appCall,
  "app list": appList,
  "memory add": memoryAdd,
  "memory search": memorySearch,
  "memory list": memoryList,
  "memory update": memoryUpdate,
  "memory delete": memoryDelete,
  "memory profile create": memoryProfileCreate,
  "memory profile get": memoryProfileGet,
  "knowledge retrieve": knowledgeRetrieve,
  "mcp list": mcpList,
  "mcp tools": mcpTools,
  "mcp call": mcpCall,
  "search web": searchWeb,
  "speech synthesize": speechSynthesize,
  "speech recognize": speechRecognize,
  "file upload": fileUpload,
  "dataset upload": datasetUpload,
  "dataset list": datasetList,
  "dataset get": datasetGet,
  "dataset delete": datasetDelete,
  "dataset validate": datasetValidate,
  "finetune create": finetuneCreate,
  "finetune list": finetuneList,
  "finetune get": finetuneGet,
  "finetune cancel": finetuneCancel,
  "finetune delete": finetuneDelete,
  "finetune logs": finetuneLogs,
  "finetune checkpoints": finetuneCheckpoints,
  "finetune export": finetuneExport,
  "finetune watch": finetuneWatch,
  "finetune capability": finetuneCapability,
  "deploy create": deployCreate,
  "deploy list": deployList,
  "deploy get": deployGet,
  "deploy models": deployModels,
  "deploy scale": deployScale,
  "deploy update": deployUpdate,
  "deploy delete": deployDelete,
  "console call": consoleCall,
  "usage free": usageFree,
  "usage freetier": usageFreetier,
  "usage stats": usageStats,
  "pipeline run": pipelineRun,
  "pipeline validate": pipelineValidate,
  "config show": configShow,
  "config set": configSet,
  "config export-schema": configExportSchema,
  "advisor recommend": advisorRecommend,
  "workspace list": workspaceList,
  "quota list": quotaList,
  "quota request": quotaRequest,
  "quota history": quotaHistory,
  "quota check": quotaCheck,
  "token-plan list-seats": tokenPlanListSeats,
  "token-plan create-key": tokenPlanCreateKey,
  "token-plan assign-seats": tokenPlanAssignSeats,
  "token-plan add-member": tokenPlanAddMember,
  update: update,
};

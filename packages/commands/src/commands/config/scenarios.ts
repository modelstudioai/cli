/**
 * Curated "Playground" scenarios surfaced in the config UI.
 *
 * Each scenario is a fixed, reviewable prompt template that the UI can dispatch
 * to a connected local coding agent (e.g. qwen-code), which then runs it in a
 * new terminal. Optional `{{inputs}}` are filled by the user before dispatch.
 *
 * Prompts are defined here and never accepted as free-form text from the web,
 * so the instruction handed to a local agent is always known and auditable.
 */
export interface ScenarioInput {
  key: string;
  label: string;
  placeholder?: string;
}

export interface Scenario {
  id: string;
  title: string;
  description: string;
  category: string;
  prompt: string;
  inputs?: ScenarioInput[];
}

export const SCENARIOS: Scenario[] = [
  // ---- 图像 ----
  {
    id: "image-generate",
    title: "文生图",
    description: "一键生成一张示例图片并保存到输出目录。",
    category: "图像",
    prompt:
      "请使用 bl 的图像生成能力（如 `bl image generate` 命令）生成一张示例图片：一只在雨中撑伞的柯基，水彩风格，光线柔和。保存到输出目录后告诉我文件路径。",
  },
  {
    id: "image-describe",
    title: "图片理解",
    description: "从输出目录任选一张图片，详细描述内容与风格。",
    category: "图像",
    prompt:
      "请在输出目录（默认 output/images）中任选一张图片，用中文详细描述它的内容、主体、构图、色彩与风格，并推测它适合的使用场景。若目录为空请说明。",
  },
  {
    id: "image-alt-batch",
    title: "批量 Alt 文本",
    description: "为输出目录下的图片批量生成无障碍 alt 文本。",
    category: "图像",
    prompt:
      "请扫描输出目录（默认 output/images）下的所有图片，逐张生成简洁、准确的 alt 无障碍描述，最后以「文件名 → alt 文本」的表格汇总。若目录为空请说明。",
  },
  {
    id: "image-to-code",
    title: "截图转代码",
    description: "把输出目录里的界面截图还原成 HTML+CSS。",
    category: "图像",
    prompt:
      "请在输出目录（默认 output/images）中查找一张界面截图，用 HTML + CSS 尽可能还原它的布局、间距与配色，输出为一个可直接在浏览器打开的单文件，并简述还原思路。若没有找到截图请说明。",
  },
  // ---- 音频 ----
  {
    id: "speech-generate",
    title: "文字转语音",
    description: "把一句示例文字合成为自然语音。",
    category: "音频",
    prompt:
      "请使用 bl 的语音合成能力（如 `bl speech` 相关命令）把下面这句话合成为自然语音，保存到输出目录，并告诉我音频文件路径：欢迎使用阿里云百炼命令行工具，让多模态创作更简单。",
  },
  {
    id: "audio-summarize",
    title: "音频转写总结",
    description: "转写输出目录里的音频并提炼要点。",
    category: "音频",
    prompt:
      "请在输出目录（默认 output/speech）中找到一个音频文件，转写其内容，先给出完整文字，再用要点列表总结关键信息。若目录为空或缺少转写能力，请说明并尝试用可用的能力完成。",
  },
  // ---- 视频 ----
  {
    id: "video-generate",
    title: "文生视频",
    description: "一键生成一段示例短视频。",
    category: "视频",
    prompt:
      "请使用 bl 的视频生成能力（如 `bl video generate` 命令）生成一段示例短视频：日落时分海边奔跑的少年，电影质感，慢动作。保存到输出目录后告诉我视频文件路径。",
  },
  {
    id: "video-storyboard",
    title: "视频分镜脚本",
    description: "围绕示例主题产出可用于文生视频的分镜。",
    category: "视频",
    prompt:
      "围绕主题「城市清晨的第一杯咖啡」，为一支 15-30 秒的短视频撰写分镜脚本：逐镜头给出画面描述、时长、字幕或旁白，并为每个镜头附上可直接用于文生视频的英文 prompt。",
  },
  // ---- 多模态 ----
  {
    id: "media-prompt-craft",
    title: "多模态提示词",
    description: "把一个示例创意扩展成图/视频/语音提示词。",
    category: "多模态",
    prompt:
      "把创意「未来赛博城市的夜市」扩展成三组高质量生成提示词：1) 文生图；2) 文生视频；3) 语音风格描述。每组给出中英对照，并简要说明关键参数建议。",
  },
  {
    id: "image-story-narration",
    title: "图片配音文案",
    description: "为输出目录里的图片写解说词并给出可合成文本。",
    category: "多模态",
    prompt:
      "请在输出目录（默认 output/images）中任选一张图片，为它撰写一段 60 秒左右的中文解说词（适合配音），语气生动。随后给出可直接用于语音合成的纯文本版本。若目录为空请说明。",
  },
  // ---- 代码 ----
  {
    id: "summarize-project",
    title: "总结当前项目",
    description: "让 agent 阅读当前目录，总结架构、技术栈与主要模块。",
    category: "代码",
    prompt:
      "请阅读当前工作目录的项目结构和关键源码，用简洁的中文总结：1) 它是做什么的；2) 技术栈；3) 主要模块及其职责；4) 值得注意的设计。先浏览再下结论，不要臆测。",
  },
  {
    id: "write-tests",
    title: "为核心模块写单测",
    description: "自动挑选缺测试的核心模块并补全单元测试。",
    category: "代码",
    prompt:
      "请在当前项目中挑选一个核心且缺少测试（或测试薄弱）的模块，为它编写全面的单元测试，覆盖主要逻辑分支和边界情况，并遵循本项目现有的测试框架与风格。先阅读相关文件及其依赖，再编写测试。",
  },
  {
    id: "code-review",
    title: "代码审查",
    description: "审查当前项目核心代码，指出问题与改进建议。",
    category: "代码",
    prompt:
      "请审查当前项目的核心源码，指出潜在的 bug、安全隐患、性能与可维护性问题，并给出具体、可操作的改进建议，按严重程度排序。先浏览项目结构，选取关键文件再审查。",
  },
  {
    id: "explain-code",
    title: "解释核心代码",
    description: "挑选入口或核心模块，解释其实现与依赖。",
    category: "代码",
    prompt:
      "请挑选当前项目的入口文件或核心模块，解释它的实现：职责是什么、关键流程如何运转、依赖了哪些模块。用清晰的中文说明，必要时给出调用关系。",
  },
  // ---- 文档 ----
  {
    id: "generate-readme",
    title: "生成 README",
    description: "阅读代码后生成结构清晰、与实现一致的 README.md。",
    category: "文档",
    prompt:
      "为当前工作目录的项目生成一个结构清晰的 README.md，包含：项目简介、安装步骤、使用示例、目录结构说明。请先阅读现有代码与配置再撰写，内容必须与实际实现一致。",
  },
];

/** Look up a scenario by id, or undefined when unknown. */
export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

/** Fill a scenario's `{{placeholder}}` tokens from user-provided values. */
export function renderScenarioPrompt(scenario: Scenario, values: Record<string, string>): string {
  return scenario.prompt.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const v = values[key];
    return typeof v === "string" ? v.trim() : "";
  });
}

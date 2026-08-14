import type { Language } from "bailian-cli-core";

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

export const SCENARIOS = [
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
] as const satisfies readonly Scenario[];

type ScenarioTranslation = Pick<Scenario, "title" | "description" | "category" | "prompt">;
type ScenarioId = (typeof SCENARIOS)[number]["id"];

const EN_US_SCENARIOS = {
  "image-generate": {
    title: "Text to image",
    description: "Generate a sample image and save it to the output directory.",
    category: "Image",
    prompt:
      "Use bl's image generation capability (such as `bl image generate`) to create a sample image: a corgi holding an umbrella in the rain, watercolor style, with soft lighting. Save it to the output directory and tell me the file path.",
  },
  "image-describe": {
    title: "Image understanding",
    description: "Pick an image from the output directory and describe its content and style.",
    category: "Image",
    prompt:
      "Pick an image from the output directory (output/images by default). Describe its subject, composition, colors, and style in detail, then suggest suitable use cases. If the directory is empty, say so.",
  },
  "image-alt-batch": {
    title: "Batch alt text",
    description: "Generate accessible alt text for images in the output directory.",
    category: "Image",
    prompt:
      "Scan all images in the output directory (output/images by default) and write concise, accurate accessibility alt text for each one. Summarize the results in a File name -> Alt text table. If the directory is empty, say so.",
  },
  "image-to-code": {
    title: "Screenshot to code",
    description: "Recreate a UI screenshot from the output directory with HTML and CSS.",
    category: "Image",
    prompt:
      "Find a UI screenshot in the output directory (output/images by default) and recreate its layout, spacing, and colors as closely as possible with HTML and CSS. Save it as a single file that opens directly in a browser and briefly explain your approach. If no screenshot is available, say so.",
  },
  "speech-generate": {
    title: "Text to speech",
    description: "Turn a sample sentence into natural speech.",
    category: "Audio",
    prompt:
      "Use bl's speech synthesis capability (such as a `bl speech` command) to turn this sentence into natural speech: Welcome to Alibaba Cloud Model Studio CLI, making multimodal creation easier. Save the audio to the output directory and tell me the file path.",
  },
  "audio-summarize": {
    title: "Transcribe and summarize audio",
    description: "Transcribe an audio file from the output directory and summarize its key points.",
    category: "Audio",
    prompt:
      "Find an audio file in the output directory (output/speech by default), transcribe it, provide the full transcript, and then summarize the key points as a list. If the directory is empty or transcription is unavailable, explain that and try to complete the task with the capabilities available.",
  },
  "video-generate": {
    title: "Text to video",
    description: "Generate a sample short video.",
    category: "Video",
    prompt:
      "Use bl's video generation capability (such as `bl video generate`) to create a sample short video: a teenager running along the beach at sunset, cinematic, in slow motion. Save it to the output directory and tell me the file path.",
  },
  "video-storyboard": {
    title: "Video storyboard",
    description: "Create a storyboard suitable for text-to-video generation.",
    category: "Video",
    prompt:
      "Create a storyboard for a 15-30 second short video themed The first cup of coffee in the city at dawn. For each shot, provide the visual description, duration, subtitles or narration, and an English prompt ready for text-to-video generation.",
  },
  "media-prompt-craft": {
    title: "Multimodal prompts",
    description: "Expand a sample idea into image, video, and speech prompts.",
    category: "Multimodal",
    prompt:
      "Expand the idea A night market in a futuristic cyber city into three high-quality generation prompts: 1) text to image, 2) text to video, and 3) speech style. Provide each prompt in both Chinese and English, with brief parameter recommendations.",
  },
  "image-story-narration": {
    title: "Image narration",
    description: "Write narration for an image in the output directory.",
    category: "Multimodal",
    prompt:
      "Pick an image from the output directory (output/images by default) and write an engaging English narration of about 60 seconds. Then provide a plain-text version ready for speech synthesis. If the directory is empty, say so.",
  },
  "summarize-project": {
    title: "Summarize this project",
    description:
      "Read the current directory and summarize its architecture, stack, and main modules.",
    category: "Code",
    prompt:
      "Inspect the project structure and key source files in the current working directory, then concisely summarize: 1) what it does, 2) its technology stack, 3) its main modules and their responsibilities, and 4) notable design choices. Inspect the code before drawing conclusions; do not guess.",
  },
  "write-tests": {
    title: "Add tests for a core module",
    description: "Choose an under-tested core module and add unit tests.",
    category: "Code",
    prompt:
      "Choose a core module in the current project that has no tests or weak coverage. Add comprehensive unit tests for its main branches and edge cases, following the project's existing test framework and style. Read the relevant files and dependencies before writing tests.",
  },
  "code-review": {
    title: "Code review",
    description: "Review core project code and identify concrete improvements.",
    category: "Code",
    prompt:
      "Review the current project's core source code for potential bugs, security risks, performance issues, and maintainability problems. Give specific, actionable recommendations ordered by severity. Inspect the project structure and select the key files before reviewing them.",
  },
  "explain-code": {
    title: "Explain core code",
    description: "Choose an entry point or core module and explain how it works.",
    category: "Code",
    prompt:
      "Choose the current project's entry point or a core module and explain its responsibilities, key execution flow, and dependencies. Use clear English and include the call relationships when useful.",
  },
  "generate-readme": {
    title: "Generate README",
    description: "Generate a clear README.md that matches the implementation.",
    category: "Documentation",
    prompt:
      "Generate a clear README.md for the project in the current working directory. Include an overview, installation steps, usage examples, and a directory structure guide. Read the existing source code and configuration first; the content must match the actual implementation.",
  },
} satisfies Record<ScenarioId, ScenarioTranslation>;

export function localizeScenarios(language: Language): Scenario[] {
  if (language === "zh-CN") return SCENARIOS.map((scenario) => ({ ...scenario }));

  return SCENARIOS.map((scenario) => ({
    ...scenario,
    ...EN_US_SCENARIOS[scenario.id],
  }));
}

/** Look up a scenario by id, or undefined when unknown. */
export function getScenario(id: string, language: Language): Scenario | undefined {
  return localizeScenarios(language).find((scenario) => scenario.id === id);
}

/** Fill a scenario's `{{placeholder}}` tokens from user-provided values. */
export function renderScenarioPrompt(scenario: Scenario, values: Record<string, string>): string {
  return scenario.prompt.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = values[key];
    return typeof value === "string" ? value.trim() : "";
  });
}

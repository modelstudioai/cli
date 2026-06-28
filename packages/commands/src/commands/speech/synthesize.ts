import { readFileSync, createWriteStream } from "fs";
import {
  BailianError,
  defineCommand,
  ExitCode,
  detectOutputFormat,
  type Client,
  type Config,
  type DashScopeTTSRequest,
  type DashScopeTTSResponse,
  type DashScopeTTSStreamChunk,
  stripUndefined,
  type OutputFormat,
  speechSynthesizePath,
  parseSSE,
  resolveOutputDir,
  DOCS_HOSTS,
  type FlagsDef,
  type Flags,
} from "bailian-cli-core";

const COSYVOICE_CLONE_DESIGN_DOC = `${DOCS_HOSTS.cn}/cosyvoice-clone-design-api`;
import { downloadFile } from "bailian-cli-runtime";
import { runConcurrent, downloadParallel, getConcurrency } from "bailian-cli-runtime";
import { emitResult, emitBare } from "bailian-cli-runtime";

interface VoiceEntry {
  voice: string;
  name: string;
  desc: string;
  lang: string;
}

// cosyvoice-v3-flash system voices
const COSYVOICE_V3_FLASH_VOICES: VoiceEntry[] = [
  // 社交陪伴
  { voice: "longanyang", name: "龙安洋", desc: "阳光大男孩", lang: "中文/英文" },
  { voice: "longanhuan", name: "龙安欢", desc: "欢脱元气女", lang: "中文/英文" },
  { voice: "longantai_v3", name: "龙安台", desc: "嗲甜台湾女", lang: "中文/英文" },
  { voice: "longhua_v3", name: "龙华", desc: "元气甜美女", lang: "中文/英文" },
  { voice: "longcheng_v3", name: "龙橙", desc: "智慧青年男", lang: "中文/英文" },
  { voice: "longze_v3", name: "龙泽", desc: "温暖元气男", lang: "中文/英文" },
  { voice: "longzhe_v3", name: "龙哲", desc: "呆板大暖男", lang: "中文/英文" },
  { voice: "longyan_v3", name: "龙颜", desc: "温暖春风女", lang: "中文/英文" },
  { voice: "longxing_v3", name: "龙星", desc: "温婉邻家女", lang: "中文/英文" },
  { voice: "longtian_v3", name: "龙天", desc: "磁性理智男", lang: "中文/英文" },
  { voice: "longwan_v3", name: "龙婉", desc: "细腻柔声女", lang: "中文/英文" },
  { voice: "longqiang_v3", name: "龙嫱", desc: "浪漫风情女", lang: "中文/英文" },
  { voice: "longfeifei_v3", name: "龙菲菲", desc: "甜美娇气女", lang: "中文/英文" },
  { voice: "longhao_v3", name: "龙浩", desc: "多情忧郁男", lang: "中文/英文" },
  { voice: "longanrou_v3", name: "龙安柔", desc: "温柔娴静女", lang: "中文/英文" },
  // 语音助手
  { voice: "longxiaochun_v3", name: "龙小淳", desc: "知性积极女", lang: "中文/英文" },
  { voice: "longxiaoxia_v3", name: "龙小夏", desc: "沉稳权威女", lang: "中文/英文" },
  { voice: "longyumi_v3", name: "YUMI", desc: "正经青年女", lang: "中文/英文" },
  { voice: "longanyun_v3", name: "龙安昀", desc: "居家暖男", lang: "中文/英文" },
  { voice: "longanwen_v3", name: "龙安温", desc: "优雅知性女", lang: "中文/英文" },
  { voice: "longanli_v3", name: "龙安莉", desc: "利落从容女", lang: "中文/英文" },
  { voice: "longanlang_v3", name: "龙安朗", desc: "清爽利落男", lang: "中文/英文" },
  { voice: "longyingmu_v3", name: "龙应沐", desc: "优雅知性女", lang: "中文/英文" },
  // 客服
  { voice: "longyingxun_v3", name: "龙应询", desc: "年轻青涩男", lang: "中文/英文" },
  { voice: "longyingjing_v3", name: "龙应静", desc: "低调冷静女", lang: "中文/英文" },
  { voice: "longyingling_v3", name: "龙应聆", desc: "温和共情女", lang: "中文/英文" },
  { voice: "longyingtao_v3", name: "龙应桃", desc: "温柔淡定女", lang: "中文/英文" },
  // 电话销售
  { voice: "longyingxiao_v3", name: "龙应笑", desc: "清甜推销女", lang: "中文/英文" },
  // 诗词朗诵
  { voice: "longfei_v3", name: "龙飞", desc: "热血磁性男", lang: "中文/英文" },
  // 童声
  { voice: "longhuhu_v3", name: "龙呼呼", desc: "天真烂漫女童", lang: "中文/英文" },
  { voice: "longpaopao_v3", name: "龙泡泡", desc: "飞天泡泡音", lang: "中文/英文" },
  { voice: "longjielidou_v3", name: "龙杰力豆", desc: "阳光顽皮男", lang: "中文/英文" },
  { voice: "longxian_v3", name: "龙仙", desc: "豪放可爱女", lang: "中文/英文" },
  { voice: "longling_v3", name: "龙铃", desc: "稚气呆板女", lang: "中文/英文" },
  { voice: "longshanshan_v3", name: "龙闪闪", desc: "戏剧化童声", lang: "中文/英文" },
  { voice: "longniuniu_v3", name: "龙牛牛", desc: "阳光男童声", lang: "中文/英文" },
  // 方言
  { voice: "longjiaxin_v3", name: "龙嘉欣", desc: "优雅粤语女", lang: "粤语/英文" },
  { voice: "longjiayi_v3", name: "龙嘉怡", desc: "知性粤语女", lang: "粤语/英文" },
  { voice: "longanyue_v3", name: "龙安粤", desc: "欢脱粤语男", lang: "粤语/英文" },
  { voice: "longlaotie_v3", name: "龙老铁", desc: "东北直率男", lang: "东北话/英文" },
  { voice: "longshange_v3", name: "龙陕哥", desc: "原味陕北男", lang: "陕西话/英文" },
  { voice: "longanmin_v3", name: "龙安闽", desc: "清纯萝莉女", lang: "闽南话/英文" },
  // 出海营销（仅北京地域）
  { voice: "loongabby_v3", name: "loongabby", desc: "美式英文女", lang: "美式英语" },
  { voice: "loongandy_v3", name: "loongandy", desc: "美式英文男", lang: "美式英语" },
  { voice: "loongannie_v3", name: "loongannie", desc: "美式英文女", lang: "美式英语" },
  { voice: "loongava_v3", name: "loongava", desc: "美式英文女", lang: "美式英语" },
  { voice: "loongbeth_v3", name: "loongbeth", desc: "美式英文女", lang: "美式英语" },
  { voice: "loongbetty_v3", name: "loongbetty", desc: "美式英文女", lang: "美式英语" },
  { voice: "loongcally_v3", name: "loongcally", desc: "美式英文女", lang: "美式英语" },
  { voice: "loongcindy_v3", name: "loongcindy", desc: "美式英文女", lang: "美式英语" },
  { voice: "loongdavid_v3", name: "loongdavid", desc: "美式英文男", lang: "美式英语" },
  { voice: "loongdonna_v3", name: "loongdonna", desc: "美式英文女", lang: "美式英语" },
  { voice: "loongemily_v3", name: "loongemily", desc: "英式英文女", lang: "英式英语" },
  { voice: "loongeric_v3", name: "loongeric", desc: "英式英文男", lang: "英式英语" },
  { voice: "loongluna_v3", name: "loongluna", desc: "英式英文女", lang: "英式英语" },
  { voice: "loongluca_v3", name: "loongluca", desc: "英式英文男", lang: "英式英语" },
  { voice: "loongriko_v3", name: "Riko", desc: "二次元霓虹女", lang: "日语" },
  { voice: "loongtomoka_v3", name: "loongtomoka", desc: "日语女", lang: "日语" },
  { voice: "loongtomoya_v3", name: "loongtomoya", desc: "日语男", lang: "日语" },
  { voice: "loongyuuna_v3", name: "Yuuna", desc: "日语女", lang: "日语" },
  { voice: "loongyuuma_v3", name: "Yuuma", desc: "日语男", lang: "日语" },
  { voice: "loongkyong_v3", name: "loongkyong", desc: "韩语女", lang: "韩语" },
  { voice: "loongjihun_v3", name: "Jihun", desc: "韩语男", lang: "韩语" },
  { voice: "loongindah_v3", name: "loongindah", desc: "印尼女", lang: "印尼语" },
];

const MODEL_VOICES: Record<string, VoiceEntry[]> = {
  "cosyvoice-v3-flash": COSYVOICE_V3_FLASH_VOICES,
  "cosyvoice-v3-plus": COSYVOICE_V3_FLASH_VOICES,
  "cosyvoice-v3.5-flash": [],
  "cosyvoice-v3.5-plus": [],
  "cosyvoice-v2": [],
};

function printVoiceList(model: string): void {
  const voices = MODEL_VOICES[model];
  if (!voices) {
    process.stdout.write(`No built-in voice list available for model: ${model}\n`);
    return;
  }
  if (voices.length === 0) {
    process.stdout.write(`Model ${model} has no system voices.\n`);
    process.stdout.write("Use clone or design voices created via the CosyVoice API.\n");
    process.stdout.write(`See: ${COSYVOICE_CLONE_DESIGN_DOC}\n`);
    return;
  }
  const col = (s: string, w: number) => s.padEnd(w);
  process.stdout.write(`\nSystem voices for ${model}:\n`);
  process.stdout.write(
    `${col("VOICE ID", 26)} ${col("NAME", 10)} ${col("DESCRIPTION", 16)} LANGUAGE\n`,
  );
  process.stdout.write(`${"-".repeat(26)} ${"-".repeat(10)} ${"-".repeat(16)} ${"-".repeat(12)}\n`);
  for (const v of voices) {
    process.stdout.write(`${col(v.voice, 26)} ${col(v.name, 10)} ${col(v.desc, 16)} ${v.lang}\n`);
  }
  process.stdout.write(`\nTotal: ${voices.length} voices\n`);
}

const SYNTHESIZE_FLAGS = {
  text: {
    type: "string",
    valueHint: "<text>",
    description: "Text to synthesize into speech (or use --text-file)",
  },
  textFile: {
    type: "string",
    valueHint: "<path>",
    description: "Read text from a file instead of --text",
  },
  model: {
    type: "string",
    valueHint: "<model>",
    description:
      "Model ID (default: cosyvoice-v3-flash). System voices available for cosyvoice-v3-flash",
  },
  voice: {
    type: "string",
    valueHint: "<voice>",
    description:
      "Voice ID. Use --list-voices to see system voices for cosyvoice-v3-flash; for v3.5-flash provide a clone/design voice ID",
  },
  listVoices: {
    type: "switch",
    description: "List available system voices for the selected model and exit",
  },
  format: {
    type: "string",
    valueHint: "<format>",
    description: "Audio format: mp3, pcm, wav, opus (default: mp3)",
    choices: ["mp3", "pcm", "wav", "opus"] as const,
  },
  sampleRate: {
    type: "string",
    valueHint: "<rate>",
    description: "Audio sample rate in Hz (e.g. 24000)",
  },
  volume: { type: "string", valueHint: "<volume>", description: "Volume 0-100 (default: 50)" },
  rate: { type: "string", valueHint: "<rate>", description: "Speech rate 0.5-2.0 (default: 1.0)" },
  pitch: {
    type: "string",
    valueHint: "<pitch>",
    description: "Pitch multiplier 0.5-2.0 (default: 1.0)",
  },
  seed: {
    type: "string",
    valueHint: "<seed>",
    description: "Random seed 0-65535 for reproducible synthesis",
  },
  language: {
    type: "string",
    valueHint: "<lang>",
    description: "Language hint (e.g. zh, en, ja, ko, fr, de)",
  },
  instruction: {
    type: "string",
    valueHint: "<text>",
    description: 'Natural language instruction to control speech style (e.g. "Use a gentle tone"）',
  },
  enableSsml: { type: "switch", description: "Enable SSML markup parsing in input text" },
  out: {
    type: "string",
    valueHint: "<path>",
    description: "Save audio to file (default: auto-generate in temp dir)",
  },
  stream: { type: "switch", description: "Stream raw PCM audio to stdout (pipe to player)" },
} satisfies FlagsDef;
type SynthesizeFlags = Flags<typeof SYNTHESIZE_FLAGS>;

export default defineCommand({
  description: "Synthesize speech from text (CosyVoice TTS)",
  auth: "apiKey",
  usageArgs: "--text <text> [flags]",
  flags: SYNTHESIZE_FLAGS,
  exampleArgs: [
    "--list-voices --model cosyvoice-v3-flash",
    '--text "Hello, I am Qwen" --voice <voice_id>',
    '--text "Hello world" --voice <voice_id> --language en',
    "--text-file script.txt --out speech.wav --voice <voice_id>",
    '--text "Today is a good day" --voice <voice_id> --instruction "Use a gentle tone"',
    '--text "Hello" --voice <voice_id> --format wav --sample-rate 24000',
    "# Stream to audio player (macOS)",
    '--text "Hello" --voice <voice_id> --stream | afplay -',
    "# Pipe to ffplay",
    '--text "Hello" --voice <voice_id> --stream | ffplay -nodisp -autoexit -f s16le -ar 24000 -ac 1 -',
  ],
  validate: (f) => {
    if (f.listVoices) return undefined;
    if (!f.text && !f.textFile) return "Provide --text or --text-file.";
    if (!f.voice) return "Missing required flag: --voice";
    return undefined;
  },
  async run(ctx) {
    const { config, flags } = ctx;
    const model = flags.model || config.defaultSpeechModel || "cosyvoice-v3-flash";

    // --list-voices: print voice list for the model and exit
    if (flags.listVoices) {
      printVoiceList(model);
      return;
    }

    // --text / --text-file presence enforced by validate; empty file content → API rejects.
    let text = flags.text || "";
    if (!text && flags.textFile) {
      const filePath = flags.textFile;
      try {
        text = readFileSync(filePath, "utf-8").trim();
      } catch {
        throw new BailianError(`Cannot read text file: ${filePath}`, ExitCode.USAGE);
      }
    }
    const voice = flags.voice as string;

    const language = flags.language || undefined;
    const instruction = flags.instruction || undefined;
    const audioFormat = flags.format || undefined;
    const sampleRate = flags.sampleRate !== undefined ? Number(flags.sampleRate) : undefined;
    const volume = flags.volume !== undefined ? Number(flags.volume) : undefined;
    const rate = flags.rate !== undefined ? Number(flags.rate) : undefined;
    const pitch = flags.pitch !== undefined ? Number(flags.pitch) : undefined;
    const seed = flags.seed !== undefined ? Number(flags.seed) : undefined;
    const enableSsml = flags.enableSsml === true ? true : undefined;
    const useStream = flags.stream === true;

    const format = detectOutputFormat(config.output);

    const body: DashScopeTTSRequest = {
      model,
      input: {
        text: text!,
        voice,
        format: audioFormat,
        sample_rate: sampleRate,
        volume,
        rate,
        pitch,
        seed,
        language_hints: language ? [language] : undefined,
        instruction,
        enable_ssml: enableSsml,
      },
    };

    // Remove undefined fields from input
    stripUndefined(body.input as Record<string, unknown>);

    if (config.dryRun) {
      emitResult({ request: body }, format);
      return;
    }

    if (!config.quiet) {
      process.stderr.write(`[Model: ${model}] [Voice: ${voice}]\n`);
    }

    if (useStream) {
      await handleStreamMode(ctx.client, config, body, flags, format);
    } else {
      await handleNonStreamMode(ctx.client, config, body, flags, format);
    }
  },
});

async function handleNonStreamMode(
  client: Client,
  config: Config,
  body: DashScopeTTSRequest,
  flags: SynthesizeFlags,
  format: OutputFormat,
): Promise<void> {
  const concurrent = getConcurrency(flags);

  const results = await runConcurrent(concurrent, config, () =>
    client.requestJson<DashScopeTTSResponse>({
      path: speechSynthesizePath(),
      method: "POST",
      body,
    }),
  );

  const audioUrls = results.map((r) => r.output?.audio?.url).filter(Boolean) as string[];

  if (audioUrls.length === 0) {
    throw new BailianError("API returned no audio URL.", ExitCode.GENERAL);
  }

  // Determine output paths
  const path = await import("path");
  const destDir = resolveOutputDir(config, { subDir: "speech" });

  const items = audioUrls.map((audioUrl, i) => {
    let destPath = flags.out;
    if (destPath && audioUrls.length === 1) {
      // Single explicit output path
    } else {
      const timestamp = Date.now();
      const suffix = audioUrls.length > 1 ? `_${String(i + 1).padStart(3, "0")}` : "";
      const ext = body.input.format ?? "mp3";
      destPath = path.join(destDir, `tts_${timestamp}${suffix}.${ext}`);
    }
    return { url: audioUrl, destPath: destPath! };
  });

  const saved = await downloadParallel(items, downloadFile, { quiet: config.quiet });

  if (config.quiet) {
    emitBare(saved.join("\n"));
  } else if (saved.length === 1) {
    const expiresAt = results[0]!.output?.audio?.expires_at;
    emitResult(
      {
        saved: saved[0],
        audio_url: audioUrls[0],
        model: body.model,
        voice: body.input.voice,
        ...(expiresAt ? { url_expires_at: expiresAt } : {}),
      },
      format,
    );
  } else {
    emitResult(
      {
        saved,
        audio_urls: audioUrls,
        total: saved.length,
        model: body.model,
        voice: body.input.voice,
      },
      format,
    );
  }
}

async function handleStreamMode(
  client: Client,
  config: Config,
  body: DashScopeTTSRequest,
  flags: SynthesizeFlags,
  format: OutputFormat,
): Promise<void> {
  const res = await client.request({
    path: speechSynthesizePath(),
    method: "POST",
    body,
    stream: true,
    headers: {
      Accept: "text/event-stream",
      "X-DashScope-SSE": "enable",
    },
  });

  const outPath = flags.out;
  const writer = outPath ? createWriteStream(outPath) : null;
  let lastAudioUrl: string | undefined;

  try {
    for await (const event of parseSSE(res)) {
      if (!event.data || event.data === "[DONE]") continue;

      let chunk: DashScopeTTSStreamChunk;
      try {
        chunk = JSON.parse(event.data) as DashScopeTTSStreamChunk;
      } catch {
        continue;
      }

      const audioData = chunk.output?.audio?.data;
      if (audioData) {
        const buffer = Buffer.from(audioData, "base64");
        if (writer) {
          const ok = writer.write(buffer);
          if (!ok) await new Promise<void>((resolve) => writer.once("drain", () => resolve()));
        } else {
          process.stdout.write(buffer);
        }
      }

      if (chunk.output?.finish_reason === "stop") {
        lastAudioUrl = chunk.output?.audio?.url;
        if (lastAudioUrl && !config.quiet) {
          process.stderr.write(`\nFull audio URL: ${lastAudioUrl}\n`);
        }
        break;
      }
    }
  } finally {
    if (writer) {
      await new Promise<void>((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
        writer.end();
      });
      if (!config.quiet && outPath) {
        process.stderr.write(`Saved: ${outPath}\n`);
      }
    }
  }

  // Emit structured result for agent consumption
  if (outPath) {
    emitResult(
      {
        saved: outPath,
        ...(lastAudioUrl ? { audio_url: lastAudioUrl } : {}),
        model: body.model,
        voice: body.input.voice,
      },
      format,
    );
  }
}

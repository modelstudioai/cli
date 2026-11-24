/**
 * 决策训练数据文件的问题定义签名读取。
 *
 * 只读首条非空记录的问题表（ID、类型、instructions、criteria），用于训练集与
 * 验证集之间的跨文件一致性比对——同一任务两侧的问题定义必须一致，否则分布漂移。
 * 文件不可读、首行不是 JSON 对象或问题表缺失时返回 undefined，调用方据此跳过比对
 * （结构问题由 dataset validate 的逐记录校验负责报告）。
 */
import { createReadStream } from "fs";
import { createInterface } from "readline";
import { decisionQuestionTableSignature, isDecisionObject } from "./questions.ts";

export async function readDecisionQuestionSignature(
  filePath: string,
): Promise<Map<string, string> | undefined> {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const reader = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const raw of reader) {
      const line = raw.trim();
      if (line.length === 0) continue;
      let record: unknown;
      try {
        record = JSON.parse(line);
      } catch {
        return undefined;
      }
      if (!isDecisionObject(record)) return undefined;
      return decisionQuestionTableSignature(record.questions);
    }
    return undefined;
  } catch {
    // Unreadable file (ENOENT/EACCES/...): skip the comparison; dataset
    // validation owns reporting file-level problems.
    return undefined;
  } finally {
    reader.close();
    stream.destroy();
  }
}

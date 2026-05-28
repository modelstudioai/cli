/**
 * 增量写入 results.jsonl —— 每完成一个任务追加一行，防崩溃丢数据。
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sanitizeResultForExport } from "./parsers.mjs";

export class IncrementalWriter {
  /** @param {string} batchRoot */
  constructor(batchRoot) {
    this.filePath = join(batchRoot, "results.jsonl");
    writeFileSync(this.filePath, "", "utf8");
  }

  /** @param {object} result @param {number} _index */
  append(result, _index) {
    const line = JSON.stringify(sanitizeResultForExport(result));
    appendFileSync(this.filePath, line + "\n", "utf8");
  }
}

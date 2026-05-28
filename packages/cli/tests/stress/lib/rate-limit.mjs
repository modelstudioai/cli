/** 睡眠指定毫秒 */

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 滑动窗口限流器：控制任务下发频率。
 */
export class SubmissionRateLimiter {
  /**
   * @param {number} maxRequests 窗口内允许的最大请求数
   * @param {number} windowMs 滑动窗口长度（毫秒）
   */
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.timestamps = [];
    this.waitQueue = [];
    this.draining = false;
  }

  /** 获取一次提交许可；超限则排队等待。 */
  async acquire() {
    return new Promise((resolve) => {
      this.waitQueue.push(resolve);
      void this.drain();
    });
  }

  /** 依次处理等待队列。 */
  async drain() {
    if (this.draining) return;
    this.draining = true;
    while (this.waitQueue.length > 0) {
      const now = Date.now();
      this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
      if (this.timestamps.length >= this.maxRequests) {
        const waitMs = this.windowMs - (now - this.timestamps[0]) + 20;
        await sleep(Math.max(waitMs, 50));
        continue;
      }
      this.timestamps.push(Date.now());
      const next = this.waitQueue.shift();
      next?.();
    }
    this.draining = false;
  }
}

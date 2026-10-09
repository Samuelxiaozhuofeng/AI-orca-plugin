/**
 * 防抖保存：schedule 在 delayMs 后执行最近一次登记的保存；
 * flush 立刻执行还没跑的那次，并等正在跑的那次写完（离开 / 删除对话前用，
 * 别让防抖把最后一条回复吞掉，也别让晚到的保存把刚删的对话写回来）。
 * 保存失败只记日志，不打断后面的切换 / 删除。
 */
export function createPendingSave(delayMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let job: (() => Promise<void> | void) | null = null;
  let running: Promise<void> = Promise.resolve();

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    job = null;
  };

  const start = (run: () => Promise<void> | void) => {
    // 串行：后一次保存等前一次写完，旧对话的保存不会晚于新对话落地
    running = running.then(run).catch((err) => {
      console.error("[pending-save] save failed:", err);
    });
    return running;
  };

  return {
    schedule(fn: () => Promise<void> | void) {
      cancel();
      job = fn;
      timer = setTimeout(() => {
        const run = job;
        timer = null;
        job = null;
        if (run) void start(run);
      }, delayMs);
    },
    cancel,
    async flush() {
      const run = job;
      cancel();
      await (run ? start(run) : running);
    },
  };
}

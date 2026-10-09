/**
 * 防抖保存：schedule 在 delayMs 后执行最近一次登记的保存；
 * flush 立刻执行还没跑的那次（离开对话前用，别让防抖把最后一条回复吞掉）。
 */
export function createPendingSave(delayMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let job: (() => Promise<void> | void) | null = null;

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    job = null;
  };

  return {
    schedule(fn: () => Promise<void> | void) {
      cancel();
      job = fn;
      timer = setTimeout(() => {
        const run = job;
        timer = null;
        job = null;
        run?.();
      }, delayMs);
    },
    cancel,
    async flush() {
      const run = job;
      cancel();
      await run?.();
    },
  };
}

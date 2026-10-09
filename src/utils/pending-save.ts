/**
 * 防抖保存：schedule 登记「拍快照」函数，delayMs 后执行；它同步拍下要存的内容，
 * 返回真正的写入函数。写入一律串行，前一次写完才写下一次。
 * flush 立刻拍下还没跑的那次快照并排队写入，同时等之前的写入都写完（离开 / 删除对话前用，
 * 别让防抖把最后一条回复吞掉，也别让晚到的保存把刚删的对话写回来）。
 * 保存失败只记日志，不打断后面的切换 / 删除。
 */
type Save = () => Promise<void> | void;

export function createPendingSave(delayMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let job: (() => Save) | null = null;
  let running: Promise<void> = Promise.resolve();

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    job = null;
  };

  // 拍快照同步做（调用方此刻的界面状态），写入排到上一次后面
  const start = (snapshot: () => Save) => {
    let save: Save;
    try {
      save = snapshot();
    } catch (err) {
      console.error("[pending-save] snapshot failed:", err);
      return running;
    }
    running = running.then(save).catch((err) => {
      console.error("[pending-save] save failed:", err);
    });
    return running;
  };

  return {
    schedule(snapshot: () => Save) {
      cancel();
      job = snapshot;
      timer = setTimeout(() => {
        const run = job;
        timer = null;
        job = null;
        if (run) void start(run);
      }, delayMs);
    },
    cancel,
    flush(): Promise<void> {
      const run = job;
      cancel();
      return run ? start(run) : running;
    },
  };
}

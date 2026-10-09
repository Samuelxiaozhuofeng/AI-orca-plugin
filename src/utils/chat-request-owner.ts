/**
 * 对话请求归属：新对话 / 切换对话时作废旧请求——中止它，并丢弃它之后的界面写入和弹窗。
 * 发送一开始就登记（早于 abortRef 设置），异步准备阶段换对话也能取消。
 */
export function createChatRequestOwner() {
  let epoch = 0;
  let ctrl = new AbortController();
  return {
    begin() {
      const mine = epoch;
      const epochSignal = ctrl.signal;
      const isCurrent = () => mine === epoch;
      return {
        isCurrent,
        /** 包一层：只在仍属当前对话时才执行 */
        guard<F extends (...args: any[]) => void>(fn: F): F {
          return ((...args: any[]) => { if (isCurrent()) fn(...args); }) as F;
        },
        /**
         * 新建本次请求的中止器；所属对话被换掉时随之中止（已换掉则生来即中止）。
         * 传 ref 时仅在仍属当前对话时登记进去，失效请求不覆盖当前请求的中止器。
         */
        newAborter(ref?: { current: AbortController | null }): AbortController {
          const aborter = new AbortController();
          // ponytail: 正常结束的请求不摘监听，同一对话内随发送次数累积，换对话时随旧 signal 一起释放
          if (epochSignal.aborted) aborter.abort();
          else epochSignal.addEventListener("abort", () => aborter.abort(), { once: true });
          if (ref && isCurrent()) ref.current = aborter;
          return aborter;
        },
      };
    },
    /** 新对话 / 切换对话时调用 */
    invalidate() {
      epoch++;
      ctrl.abort();
      ctrl = new AbortController();
    },
  };
}

/** 新对话 / 切换对话时：未决的确认一律按拒绝结算并清掉，等待它的旧请求得以收尾 */
export function settlePendingConfirms(resolvers: Map<string, (approved: boolean) => void>): void {
  const pending = [...resolvers.values()];
  resolvers.clear();
  for (const resolve of pending) resolve(false);
}

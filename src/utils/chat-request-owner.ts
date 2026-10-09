/**
 * 请求归属：每次发送都是新身份，同时作废上一请求；新对话 / 切换对话也作废进行中的请求。
 * 作废 = 中止它，并丢弃它之后的界面写入、状态和收尾。
 * 发送一开始就登记（早于 abortRef 设置），异步准备阶段被接替或换对话也能取消。
 */
export function createChatRequestOwner() {
  let epoch = 0;
  let ctrl = new AbortController();
  const invalidate = () => {
    epoch++;
    ctrl.abort();
    ctrl = new AbortController();
  };
  return {
    /** 每次发送调用：作废上一请求（中止其中止器），返回本次请求的身份 */
    begin() {
      invalidate();
      const mine = epoch;
      const epochSignal = ctrl.signal;
      const isCurrent = () => mine === epoch;
      return {
        isCurrent,
        /** 包一层：只在仍是当前请求时才执行 */
        guard<F extends (...args: any[]) => void>(fn: F): F {
          return ((...args: any[]) => { if (isCurrent()) fn(...args); }) as F;
        },
        /**
         * 新建本次请求的中止器；请求被作废时随之中止（已作废则生来即中止）。
         * 传 ref 时仅在仍是当前请求时登记进去，失效请求不覆盖当前请求的中止器。
         */
        newAborter(ref?: { current: AbortController | null }): AbortController {
          const aborter = new AbortController();
          if (epochSignal.aborted) aborter.abort();
          else epochSignal.addEventListener("abort", () => aborter.abort(), { once: true });
          if (ref && isCurrent()) ref.current = aborter;
          return aborter;
        },
      };
    },
    /** 新对话 / 切换对话时调用（begin 也会先调它） */
    invalidate,
  };
}

/** 失败要不要报给用户：请求已失效或是中止（AbortError）都不报 */
export function shouldReportFailure(isCurrent: () => boolean, err: unknown): boolean {
  return isCurrent() && String((err as any)?.name) !== "AbortError";
}

/**
 * 切换 / 恢复对话的异步加载：期间用户又选了别的对话或点了新对话（owner 被 begin / invalidate），
 * 加载结果作废，返回 null，不覆盖用户更晚的选择。
 */
export async function loadIfLatest<T>(
  owner: ReturnType<typeof createChatRequestOwner>,
  load: () => Promise<T | null>,
): Promise<T | null> {
  const mine = owner.begin();
  const result = await load();
  return mine.isCurrent() ? result : null;
}

/**
 * Wrap a promise in a hard timeout. If the promise doesn't settle before
 * `ms`, the returned promise rejects with a TimeoutError and the caller
 * moves on. The underlying promise keeps running until it finishes —
 * we don't abort it because the slow-path operations we wrap (histogram
 * fetches, Steam reads) usually have their own axios timeouts, and leaking
 * the eventual result is safer than cancelling a partially-applied side
 * effect.
 */
export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = "operation",
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

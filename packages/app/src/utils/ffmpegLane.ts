let lane: Promise<void> = Promise.resolve();

/** Share the heavy FFmpeg lane between animation and Live Photo jobs.
 * ponytail: serialize cores; add weighted scheduling only after memory measurements.
 */
export function runInFFmpegLane<T>(run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const task = lane.then(() => {
    signal?.throwIfAborted();
    return run();
  });
  // Keep only the release signal, never the previous task's potentially large output.
  lane = task.then(
    () => undefined,
    () => undefined,
  );
  if (!signal) return task;
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Cancelled', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    task.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

import { expect, it, vi } from 'vitest';
import { runInFFmpegLane } from './ffmpegLane';

it('serializes heavy engines, cancels queued jobs immediately and recovers after failure', async () => {
  let finish!: () => void;
  const active = runInFFmpegLane(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await Promise.resolve();
  const controller = new AbortController();
  const cancelledWork = vi.fn();
  const queued = runInFFmpegLane(cancelledWork, controller.signal);
  controller.abort();
  await expect(queued).rejects.toMatchObject({ name: 'AbortError' });
  expect(cancelledWork).not.toHaveBeenCalled();
  finish();
  await active;
  await expect(
    runInFFmpegLane(async () => {
      throw new Error('failed');
    }),
  ).rejects.toThrow('failed');
  await expect(runInFFmpegLane(async () => 'recovered')).resolves.toBe('recovered');
  expect(cancelledWork).not.toHaveBeenCalled();
});

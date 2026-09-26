import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultMotionSettings } from './media';
import type { VideoWorkerResponse } from './videoWorker';
import {
  convertWithWebCodecs,
  resetWebCodecsVideo,
  webCodecsVideoAvailable,
} from './webCodecsVideo';

class MockWorker {
  static last: MockWorker;
  onmessage: ((event: MessageEvent<VideoWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  messages: Array<{ message: unknown; transfer?: Transferable[] }> = [];
  terminated = false;
  constructor() {
    MockWorker.last = this;
  }
  postMessage(message: unknown, transfer?: Transferable[]) {
    this.messages.push({ message, transfer });
  }
  terminate() {
    this.terminated = true;
  }
  reply(data: VideoWorkerResponse) {
    this.onmessage?.({ data } as MessageEvent<VideoWorkerResponse>);
  }
}

const video = new File([new Uint8Array(8)], 'IMG.MOV', { type: 'video/quicktime' });
const run = (
  signal = new AbortController().signal,
  helper = vi.fn(async () => new ArrayBuffer(4)),
) => convertWithWebCodecs(video, defaultMotionSettings, signal, vi.fn(), helper);

describe('convertWithWebCodecs', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('Worker', MockWorker);
    for (const name of ['VideoDecoder', 'VideoEncoder', 'VideoFrame'])
      vi.stubGlobal(name, class {});
    resetWebCodecsVideo();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends the original File and resolves the finished MP4', async () => {
    const result = run();
    const worker = MockWorker.last;
    expect(worker.messages[0].message).toEqual({
      type: 'start',
      video,
      settings: defaultMotionSettings,
    });
    worker.reply({
      type: 'done',
      mp4: new Blob([new Uint8Array(3)]),
      codec: 'avc1.640032',
      audio: 'copy',
    });
    const converted = await result;
    expect(converted).toMatchObject({ codec: 'avc1.640032', audio: 'copy' });
    expect(converted!.video.size).toBe(3);
    expect(worker.terminated).toBe(true);
  });

  it('falls back without penalty when the runtime or file is unsupported', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = run();
      MockWorker.last.reply({ type: 'unsupported', reason: 'decoder hvc1' });
      await expect(result).resolves.toBeUndefined();
    }
    expect(webCodecsVideoAvailable()).toBe(true);
  });

  it('stops trying WebCodecs after repeated runtime failures', async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = run();
      MockWorker.last.reply({ type: 'error', message: 'EncodingError' });
      await expect(result).resolves.toBeUndefined();
    }
    expect(webCodecsVideoAvailable()).toBe(false);
  });

  it('treats a stalled conversion as a runtime failure', async () => {
    vi.useFakeTimers();
    const result = run();
    vi.advanceTimersByTime(120_000);
    await expect(result).resolves.toBeUndefined();
    expect(MockWorker.last.terminated).toBe(true);
    const next = run();
    MockWorker.last.reply({ type: 'error', message: 'again' });
    await next;
    expect(webCodecsVideoAvailable()).toBe(false);
  });

  it('rejects on cancellation and never falls back', async () => {
    const controller = new AbortController();
    const result = run(controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(MockWorker.last.terminated).toBe(true);
    expect(webCodecsVideoAvailable()).toBe(true);
  });

  it('runs the FFmpeg audio helper on request and transfers its output', async () => {
    const m4a = new ArrayBuffer(6);
    const helper = vi.fn(async () => m4a);
    const result = run(undefined, helper);
    const worker = MockWorker.last;
    worker.reply({ type: 'needAudio' });
    await vi.waitFor(() => expect(worker.messages).toHaveLength(2));
    expect(worker.messages[1]).toEqual({ message: { type: 'audio', m4a }, transfer: [m4a] });
    worker.reply({
      type: 'done',
      mp4: new Blob([new Uint8Array(1)]),
      codec: 'avc1.4d0029',
      audio: 'ffmpeg',
    });
    await expect(result).resolves.toMatchObject({ audio: 'ffmpeg' });
  });

  it('falls back when the audio helper fails', async () => {
    const result = run(
      undefined,
      vi.fn(async () => Promise.reject(new Error('videoFailed'))),
    );
    MockWorker.last.reply({ type: 'needAudio' });
    await expect(result).resolves.toBeUndefined();
  });

  it('is unavailable without WebCodecs', () => {
    vi.stubGlobal('VideoEncoder', undefined);
    expect(webCodecsVideoAvailable()).toBe(false);
  });
});

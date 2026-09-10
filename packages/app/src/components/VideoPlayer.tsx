import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FiMaximize, FiPause, FiPlay, FiVolume2, FiVolumeX } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { getRangeProgressStyle } from '../utils/rangeProgress';

const timeLabel = (seconds: number, precise: boolean) => {
  const value = precise ? Math.floor(seconds * 10) / 10 : Math.floor(seconds);
  const part = precise
    ? (value % 60).toFixed(1).padStart(4, '0')
    : String(value % 60).padStart(2, '0');
  return `${Math.floor(value / 60)}:${part}`;
};

/** Playback UI shares the application's controls; the media and downloads are untouched. */
export function VideoPlayer({
  src,
  poster,
  label,
  active,
  onError,
}: {
  src: string;
  poster?: string;
  label: string;
  active: boolean;
  onError: () => void;
}) {
  const { t } = useTranslation();
  const player = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(false);
  const seek = useRef<HTMLInputElement>(null);
  const timer = useRef<HTMLSpanElement>(null);
  const scrubbing = useRef<{ resume: boolean; target: number } | null>(null);
  const [duration, setDuration] = useState(0);
  useLayoutEffect(() => {
    const element = frame.current;
    const video = player.current;
    const container = element?.parentElement;
    if (!active || !element || !video || !container) return;
    const fit = () => {
      if (!video.videoWidth || !video.videoHeight) return;
      const bounds = container.getBoundingClientRect();
      const style = getComputedStyle(element);
      // Choose the layout from its row tokens, not the previous dock's rendered height.
      const baseDockHeight =
        parseFloat(style.getPropertyValue('--pf-video-seek-height')) +
        parseFloat(style.getPropertyValue('--pf-video-action-height')) +
        9;
      const scaleForDock = (height: number) =>
        Math.min(
          1,
          bounds.width / video.videoWidth,
          Math.max(0, bounds.height - height) / video.videoHeight,
        );
      const compact = video.videoWidth * scaleForDock(baseDockHeight) < 220;
      element.dataset.compact = String(compact);
      const dockHeight = baseDockHeight + (compact ? 14 : 0);
      const scale = scaleForDock(dockHeight);
      if (!(scale > 0)) return;
      element.style.setProperty('--pf-video-width', `${video.videoWidth * scale}px`);
      element.style.setProperty('--pf-video-height', `${video.videoHeight * scale + dockHeight}px`);
    };
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    video.addEventListener('loadedmetadata', fit);
    video.addEventListener('resize', fit);
    fit();
    return () => {
      observer.disconnect();
      video.removeEventListener('loadedmetadata', fit);
      video.removeEventListener('resize', fit);
    };
  }, [active]);
  const paint = useCallback(
    (seconds: number) => {
      const input = seek.current;
      if (!input) return;
      const next = Math.max(0, Math.min(duration, seconds));
      input.value = String(next);
      const style = getRangeProgressStyle(next, 0, duration);
      input.style.setProperty('--pf-range-fraction', String(style['--pf-range-fraction']));
      const text = `${timeLabel(next, duration < 10)} / ${timeLabel(duration, duration < 10)}`;
      if (timer.current?.textContent !== text) {
        if (timer.current) timer.current.textContent = text;
        input.setAttribute('aria-valuetext', text);
      }
    },
    [duration],
  );
  const play = () => {
    const video = player.current;
    if (!video) return;
    void video.play().catch((error: Error) => {
      if (error.name !== 'AbortError') onError();
    });
  };
  const finishScrub = () => {
    const state = scrubbing.current;
    if (!state) return;
    scrubbing.current = null;
    if (player.current) player.current.currentTime = state.target;
    paint(state.target);
    if (state.resume && state.target < duration && active && !document.hidden) play();
  };
  const sync = () => {
    if (!scrubbing.current && player.current) paint(player.current.currentTime);
  };
  useEffect(() => {
    const video = player.current;
    if (!video) return;
    let frameId = 0;
    const stop = () => cancelAnimationFrame(frameId);
    const tick = () => {
      if (!active || document.hidden || video.paused) return;
      if (!scrubbing.current) paint(video.currentTime);
      frameId = requestAnimationFrame(tick);
    };
    const visibility = () => {
      stop();
      if (document.hidden) video.pause();
      else tick();
    };
    if (!active) video.pause();
    if (!scrubbing.current) paint(video.currentTime);
    tick();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [active, paused, paint]);
  const toggle = () => {
    if (player.current?.paused) play();
    else player.current?.pause();
  };
  return (
    <div ref={frame} className="pf-video-player">
      <video
        ref={player}
        src={src}
        poster={poster}
        playsInline
        preload="metadata"
        aria-label={label}
        onError={onError}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onLoadedMetadata={(event) => {
          const value = event.currentTarget.duration;
          setDuration(Number.isFinite(value) ? value : 0);
        }}
        onDurationChange={(event) => {
          const value = event.currentTarget.duration;
          setDuration(Number.isFinite(value) ? value : 0);
        }}
        onTimeUpdate={sync}
        onSeeked={sync}
        onEnded={() => {
          setPaused(true);
          sync();
        }}
      />
      <div className="pf-video-controls" role="group" aria-label={t('preview.videoControls')}>
        <button
          type="button"
          className="pf-icon-control pf-video-play"
          aria-label={t(paused ? 'preview.play' : 'preview.pause')}
          data-tooltip={t(paused ? 'preview.play' : 'preview.pause')}
          onClick={toggle}
        >
          {paused ? <FiPlay aria-hidden /> : <FiPause aria-hidden />}
        </button>
        <input
          ref={seek}
          type="range"
          min={0}
          max={duration || 1}
          step="any"
          defaultValue={0}
          disabled={!duration}
          aria-label={t('preview.seek')}
          onPointerDown={(event) => {
            scrubbing.current = {
              resume: !player.current?.paused,
              target: event.currentTarget.valueAsNumber,
            };
            player.current?.pause();
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={finishScrub}
          onPointerCancel={finishScrub}
          onLostPointerCapture={finishScrub}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (scrubbing.current) scrubbing.current.target = next;
            if (player.current) player.current.currentTime = next;
            paint(next);
          }}
        />
        <span ref={timer} className="pf-video-time" aria-hidden />
        <button
          type="button"
          className="pf-icon-control pf-video-mute"
          aria-label={t(muted ? 'preview.unmute' : 'preview.mute')}
          data-tooltip={t(muted ? 'preview.unmute' : 'preview.mute')}
          onClick={() => {
            if (player.current) player.current.muted = !muted;
            setMuted(!muted);
          }}
        >
          {muted ? <FiVolumeX aria-hidden /> : <FiVolume2 aria-hidden />}
        </button>
        <button
          type="button"
          className="pf-icon-control pf-video-fullscreen"
          aria-label={t('preview.fullscreen')}
          data-tooltip={t('preview.fullscreen')}
          disabled={!document.fullscreenEnabled}
          onClick={() => {
            const action = document.fullscreenElement
              ? document.exitFullscreen()
              : frame.current?.requestFullscreen();
            void action?.catch(() => undefined);
          }}
        >
          <FiMaximize aria-hidden />
        </button>
      </div>
    </div>
  );
}

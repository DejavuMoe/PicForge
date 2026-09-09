import { useEffect, useRef, useState } from 'react';
import { FiMaximize, FiPause, FiPlay, FiVolume2, FiVolumeX } from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { getRangeProgressStyle } from '../utils/rangeProgress';

const timeLabel = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

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
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  useEffect(() => {
    if (!active) player.current?.pause();
  }, [active]);
  const toggle = () => {
    const video = player.current;
    if (!video) return;
    if (!video.paused) video.pause();
    else
      void video.play().catch((error: Error) => {
        if (error.name !== 'AbortError') onError();
      });
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
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
      />
      <div className="pf-video-controls" role="group" aria-label={t('preview.videoControls')}>
        <button
          type="button"
          className="pf-icon-control"
          aria-label={t(paused ? 'preview.play' : 'preview.pause')}
          data-tooltip={t(paused ? 'preview.play' : 'preview.pause')}
          onClick={toggle}
        >
          {paused ? <FiPlay aria-hidden /> : <FiPause aria-hidden />}
        </button>
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={Math.min(time, duration)}
          disabled={!duration}
          aria-label={t('preview.seek')}
          aria-valuetext={`${timeLabel(time)} / ${timeLabel(duration)}`}
          style={getRangeProgressStyle(time, 0, duration || 1)}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (player.current) player.current.currentTime = next;
            setTime(next);
          }}
        />
        <span className="pf-video-time" aria-hidden>
          {timeLabel(time)} / {timeLabel(duration)}
        </span>
        <button
          type="button"
          className="pf-icon-control"
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
          className="pf-icon-control"
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

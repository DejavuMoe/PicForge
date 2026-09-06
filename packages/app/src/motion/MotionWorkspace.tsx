import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiUploadCloud, FiDownload, FiImage, FiPlay } from 'react-icons/fi';
import { saveAs } from 'file-saver';
import { formatFileSize } from '../utils/fileUtils';
import { defaultMotionSettings, groupMedia, type MediaOutput, type MotionSettings } from './media';
import { processMedia } from './processor';

interface Job {
  status: 'processing' | 'done' | 'error';
  progress: number;
  error?: string;
  output?: MediaOutput;
}
function OutputPreview({ output, name }: { output: MediaOutput; name: string }) {
  const [previewFailed, setPreviewFailed] = useState(false);
  const [urls, setUrls] = useState<{ image?: string; video?: string }>({});
  const { t } = useTranslation();
  useEffect(() => {
    const next = {
      image: output.image && URL.createObjectURL(output.image),
      video: output.video && URL.createObjectURL(output.video),
    };
    setPreviewFailed(false);
    setUrls(next);
    return () => {
      Object.values(next).forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [output]);
  return (
    <div className="pf-motion-output">
      {urls.video && !previewFailed ? (
        <video
          onError={() => setPreviewFailed(true)}
          src={urls.video}
          poster={urls.image}
          controls
          playsInline
          preload="metadata"
          aria-label={name}
        />
      ) : (
        urls.image && <img src={urls.image} alt={name} />
      )}
      {previewFailed && (
        <p className="pf-motion-preview-note pf-motion-note" role="status">
          {t('motion.previewUnavailable')}
        </p>
      )}
      <div className="pf-motion-downloads">
        {(['image', 'video'] as const).map(
          (type) =>
            output[type] && (
              <button
                key={type}
                className="pf-motion-button"
                onClick={() => saveAs(output[type]!, `${name}.${type === 'image' ? 'jpg' : 'mp4'}`)}
              >
                <FiDownload aria-hidden /> {type === 'image' ? 'JPG' : 'MP4'} ·{' '}
                {formatFileSize(output[type]!.size)}
                <span className="pf-sr-only"> {t('motion.download')}</span>
              </button>
            ),
        )}
      </div>
    </div>
  );
}
export default function MotionWorkspace({ android }: { android: boolean }) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<File[]>([]);
  const [settings, setSettings] = useState<MotionSettings>(defaultMotionSettings);
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState('');
  const [dragging, setDragging] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const items = groupMedia(files, android);
  const done = Object.values(jobs).filter((job) => job.status === 'done').length;
  useEffect(() => () => controller.current?.abort(), []);
  const add = (incoming: File[]) => {
    if (controller.current || exporting || done > 0) return;
    if (
      files.length + incoming.length > 100 ||
      [...files, ...incoming].reduce((sum, file) => sum + file.size, 0) > 256 * 1024 * 1024
    ) {
      setNotice('batchLimit');
      return;
    }
    setFiles((previous) => [...previous, ...incoming]);
    setJobs({});
    setNotice('');
  };
  const run = async () => {
    if (controller.current) return;
    const active = new AbortController();
    controller.current = active;
    setBusy(true);
    setNotice('');
    try {
      // ponytail: one job at a time bounds WASM memory; add concurrency only after device benchmarks.
      for (const item of items) {
        if (active.signal.aborted) break;
        if (item.issue || jobs[item.id]?.status === 'done') continue;
        setJobs((previous) => ({ ...previous, [item.id]: { status: 'processing', progress: 0 } }));
        try {
          const output = await processMedia(item, android, settings, active.signal, (progress) => {
            if (!active.signal.aborted)
              setJobs((previous) => ({
                ...previous,
                [item.id]: { status: 'processing', progress },
              }));
          });
          active.signal.throwIfAborted();
          setJobs((previous) => ({
            ...previous,
            [item.id]: { status: 'done', progress: 100, output },
          }));
        } catch (error) {
          const key = active.signal.aborted
            ? 'cancelled'
            : error instanceof Error
              ? error.message
              : 'engineFailed';
          setJobs((previous) => ({
            ...previous,
            [item.id]: { status: 'error', progress: 0, error: key },
          }));
        }
      }
    } finally {
      controller.current = null;
      setBusy(false);
    }
  };
  const exportZip = async () => {
    setExporting(true);
    setNotice('');
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const manifest: object[] = [];
      items.forEach((item, index) => {
        const output = jobs[item.id]?.output;
        if (!output) return;
        const base =
          item.name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/^\.+$/, '_') || 'photo';
        const directory = `${String(index + 1).padStart(3, '0')}-${base}`;
        if (output.image) zip.file(`${directory}/${base}.jpg`, output.image);
        if (output.video) zip.file(`${directory}/${base}.mp4`, output.video);
        manifest.push({ name: item.name, directory, image: !!output.image, video: !!output.video });
      });
      zip.file(
        'picforge-manifest.json',
        JSON.stringify(
          {
            tool: android ? 'android' : 'ios',
            settings: android ? null : settings,
            items: manifest,
          },
          null,
          2,
        ),
      );
      saveAs(
        await zip.generateAsync({ type: 'blob', compression: 'STORE' }),
        'picforge-motion.zip',
      );
    } catch {
      setNotice('exportFailed');
    } finally {
      setExporting(false);
    }
  };
  const locked = busy || exporting || done > 0;
  return (
    <main className="pf-motion-workspace">
      <div className="pf-motion-heading">
        <span className="pf-motion-eyebrow">{t('motion.local')}</span>
        <h1>{t(android ? 'motion.android' : 'motion.ios')}</h1>
        <p>{t(android ? 'motion.androidBody' : 'motion.iosBody')}</p>
      </div>
      <div className="pf-motion-layout">
        <aside className="pf-motion-settings">
          <h2>{t('motion.output')}</h2>
          {android ? (
            <p>{t('motion.lossless')}</p>
          ) : (
            <fieldset disabled={locked}>
              <label>
                {t('motion.preset')}
                <select
                  value={settings.preset}
                  onChange={(e) =>
                    setSettings({ ...settings, preset: e.target.value as MotionSettings['preset'] })
                  }
                >
                  {['balanced', 'quality', 'compact'].map((value) => (
                    <option key={value} value={value}>
                      {t(`motion.${value}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('motion.fps')}
                <select
                  value={settings.fps}
                  onChange={(e) =>
                    setSettings({ ...settings, fps: e.target.value as MotionSettings['fps'] })
                  }
                >
                  <option value="source">{t('motion.sourceFps')}</option>
                  <option value="30">30 fps</option>
                </select>
              </label>
              <label>
                {t('motion.jpegQuality')} · {settings.quality}
                <input
                  type="range"
                  min="60"
                  max="95"
                  value={settings.quality}
                  onChange={(e) => setSettings({ ...settings, quality: Number(e.target.value) })}
                />
              </label>
              <label className="pf-motion-check">
                <input
                  type="checkbox"
                  checked={settings.audio}
                  onChange={(e) => setSettings({ ...settings, audio: e.target.checked })}
                />
                {t('motion.audio')}
              </label>
            </fieldset>
          )}
          <div className="pf-motion-note">
            {t(android ? 'motion.androidNote' : 'motion.iosNote')}
          </div>
          <div className="pf-motion-note">{t('motion.offline')}</div>
        </aside>
        <section className="pf-motion-queue" aria-label={t('motion.queue')}>
          <div
            className={`pf-motion-drop${dragging ? ' is-dragging' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              add(Array.from(e.dataTransfer.files));
            }}
          >
            <FiUploadCloud size={28} aria-hidden />
            <h2>{t('motion.drop')}</h2>
            <p>{android ? 'JPG · JPEG' : 'HEIC + MOV · HEIF · JPG · MP4'}</p>
            <button
              className="pf-motion-button is-primary"
              disabled={busy || exporting || done > 0}
              onClick={() => input.current?.click()}
            >
              {t('motion.select')}
            </button>
            <input
              ref={input}
              type="file"
              multiple
              hidden
              accept={android ? '.jpg,.jpeg' : '.heic,.heif,.mov,.jpg,.jpeg,.mp4'}
              onChange={(e) => {
                add(Array.from(e.target.files ?? []));
                e.target.value = '';
              }}
            />
          </div>
          {!android && <p className="pf-motion-note">{t('motion.pairing')}</p>}
          <div className="pf-motion-actions">
            <span role="status" aria-live="polite">
              {t('motion.count', { total: items.length, done })}
            </span>
            <button
              className="pf-motion-button"
              disabled={!items.length || busy || exporting}
              onClick={() => {
                setFiles([]);
                setJobs({});
                setNotice('');
              }}
            >
              {t('motion.clear')}
            </button>
            {busy ? (
              <button className="pf-motion-button" onClick={() => controller.current?.abort()}>
                {t('motion.cancel')}
              </button>
            ) : (
              <button
                className="pf-motion-button is-primary"
                disabled={
                  exporting ||
                  !items.some((item) => !item.issue && jobs[item.id]?.status !== 'done')
                }
                onClick={run}
              >
                {t('motion.start')}
              </button>
            )}
            <button
              className="pf-motion-button"
              disabled={!done || busy || exporting}
              onClick={exportZip}
            >
              <FiDownload aria-hidden />
              {t(exporting ? 'motion.exporting' : 'motion.zip')}
            </button>
          </div>
          {notice && <p role="alert">{t(`motion.errors.${notice}`)}</p>}
          <div className="pf-motion-items">
            {items.map((item) => {
              const job = jobs[item.id];
              return (
                <article className="pf-motion-item" key={item.id}>
                  <div className="pf-motion-item-heading">
                    {item.video || android ? <FiPlay aria-hidden /> : <FiImage aria-hidden />}
                    <strong>{item.name}</strong>
                    <span className="pf-motion-badge">
                      {t(
                        android
                          ? 'motion.motionPhoto'
                          : item.image && item.video
                            ? 'motion.pair'
                            : item.image
                              ? 'motion.still'
                              : 'motion.video',
                      )}
                    </span>
                  </div>
                  <p className="pf-motion-note">
                    {[item.image?.name, item.video?.name].filter(Boolean).join(' + ')}
                  </p>
                  {item.issue || job?.error ? (
                    <p role="alert" className="pf-motion-error">
                      {t(`motion.errors.${item.issue || job?.error}`, {
                        defaultValue: t('motion.errors.engineFailed'),
                      })}
                    </p>
                  ) : (
                    <p>{t(`motion.${job?.status ?? 'queued'}`)}</p>
                  )}
                  {job?.status === 'processing' && (
                    <progress max="100" value={job.progress} aria-label={t('motion.processing')} />
                  )}
                  {job?.output && <OutputPreview output={job.output} name={item.name} />}
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

import { SelectControl } from '../components/SelectControl';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ToolHeading } from '../components/ToolHeading';
import { FiUploadCloud, FiDownload } from 'react-icons/fi';
import { saveAs } from 'file-saver';
import { formatFileSize } from '../utils/fileUtils';
import { getRangeProgressStyle } from '../utils/rangeProgress';
import { defaultMotionSettings, groupMedia, type MediaOutput, type MotionSettings } from './media';
import { Confetti } from './Confetti';
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
  const showVideo = !!urls.video && !previewFailed;
  const showImage = !showVideo && !!urls.image;
  return (
    <div className="pf-motion-output">
      {(showVideo || showImage) && (
        <div className="pf-motion-media">
          {urls.image && (
            <img className="pf-motion-media-backdrop" src={urls.image} alt="" aria-hidden="true" />
          )}
          {showVideo ? (
            <video
              className="pf-motion-media-content"
              onError={() => setPreviewFailed(true)}
              src={urls.video}
              poster={urls.image}
              controls
              playsInline
              preload="metadata"
              aria-label={name}
            />
          ) : (
            <img className="pf-motion-media-content" src={urls.image} alt={name} />
          )}
        </div>
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

  // Fire one restrained confetti burst when a batch becomes fully complete.
  const [burst, setBurst] = useState(0);
  const celebrated = useRef(false);
  const allDone =
    items.length > 0 &&
    items.some((item) => !item.issue) &&
    items.every((item) => item.issue || jobs[item.id]?.status === 'done');
  useEffect(() => {
    if (allDone && !busy && !celebrated.current) {
      celebrated.current = true;
      setBurst((value) => value + 1);
    }
    if (!allDone) celebrated.current = false;
  }, [allDone, busy]);
  // Android results retain file slices; iOS retains newly encoded output in memory.
  const batchMegabytes = android ? 1024 : 256;
  const add = (incoming: File[]) => {
    if (controller.current || exporting || done > 0) return;
    if (
      files.length + incoming.length > 100 ||
      [...files, ...incoming].reduce((sum, file) => sum + file.size, 0) >
        batchMegabytes * 1024 * 1024
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
  const hasResults = done > 0;
  const started = busy || Object.keys(jobs).length > 0;
  const pending = items.filter((item) => !item.issue && jobs[item.id]?.status !== 'done').length;
  const resetQueue = () => {
    setFiles([]);
    setJobs({});
    setNotice('');
  };
  return (
    <main className="pf-motion-workspace" data-tool={android ? 'android' : 'ios'}>
      <ToolHeading tool={android ? 'android' : 'ios'}>
        {items.length > 0 && (
          <div className="pf-motion-actions">
            <span role="status" aria-live="polite">
              {t('motion.count', { total: items.length, done })}
            </span>
            {busy ? (
              <button className="pf-motion-button" onClick={() => controller.current?.abort()}>
                {t('motion.cancel')}
              </button>
            ) : (
              <>
                {items.length > 0 &&
                  (allDone ? (
                    <button className="pf-motion-button" onClick={resetQueue}>
                      {t('motion.newBatch')}
                    </button>
                  ) : (
                    <button className="pf-motion-button" disabled={exporting} onClick={resetQueue}>
                      {t('motion.clear')}
                    </button>
                  ))}
                {pending > 0 && (
                  <button
                    className="pf-motion-button is-primary"
                    disabled={exporting}
                    onClick={run}
                  >
                    {t('motion.start')}
                  </button>
                )}
                {hasResults && (
                  <button
                    className={`pf-motion-button${allDone ? ' is-primary' : ''}`}
                    disabled={exporting}
                    onClick={exportZip}
                  >
                    <FiDownload aria-hidden />
                    {t(exporting ? 'motion.exporting' : 'motion.zip')}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </ToolHeading>
      <div className="pf-motion-body" data-has-items={items.length > 0} data-started={started}>
        <section className="pf-motion-queue" aria-label={t('motion.queue')}>
          {notice && (
            <p role="alert" className="pf-motion-error">
              {t(`motion.errors.${notice}`, { maxMB: batchMegabytes })}
            </p>
          )}

          <div className="pf-motion-setup">
            {!hasResults && !busy && (
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
                <span className="pf-upload-icon" aria-hidden="true">
                  <FiUploadCloud />
                </span>
                <div className="pf-motion-drop-text">
                  <h2>{t('motion.drop')}</h2>
                  <p>{android ? 'JPG · JPEG' : 'HEIC + MOV · HEIF · JPG · MP4'}</p>
                </div>
                <button
                  className="pf-motion-button is-primary"
                  disabled={busy || exporting}
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
            )}
            {!android && !started && <p className="pf-motion-note">{t('motion.pairing')}</p>}
            <section className="pf-motion-settings">
              <h2>{t('motion.output')}</h2>
              {android ? (
                <dl className="pf-motion-specs">
                  <div>
                    <dt>JPG</dt>
                    <dd>{t('motion.specImageValue')}</dd>
                  </div>
                  <div>
                    <dt>MP4</dt>
                    <dd>{t('motion.specVideoValue')}</dd>
                  </div>
                  <div>
                    <dt>Codec</dt>
                    <dd>{t('motion.specCodecValue')}</dd>
                  </div>
                </dl>
              ) : (
                <fieldset disabled={locked}>
                  <label>
                    {t('motion.preset')}
                    <SelectControl
                      value={settings.preset}
                      onValueChange={(value) =>
                        setSettings({
                          ...settings,
                          preset: value as MotionSettings['preset'],
                        })
                      }
                    >
                      {['balanced', 'quality', 'compact'].map((value) => (
                        <option key={value} value={value}>
                          {t(`motion.${value}`)}
                        </option>
                      ))}
                    </SelectControl>
                  </label>
                  <label>
                    {t('motion.fps')}
                    <SelectControl
                      value={settings.fps}
                      onValueChange={(value) =>
                        setSettings({ ...settings, fps: value as MotionSettings['fps'] })
                      }
                    >
                      <option value="source">{t('motion.sourceFps')}</option>
                      <option value="30">30 fps</option>
                    </SelectControl>
                  </label>
                  <label>
                    {t('motion.jpegQuality')} · {settings.quality}
                    <input
                      type="range"
                      min="60"
                      max="95"
                      value={settings.quality}
                      style={getRangeProgressStyle(settings.quality, 60, 95)}
                      onChange={(e) =>
                        setSettings({ ...settings, quality: Number(e.target.value) })
                      }
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
              {!android && <div className="pf-motion-note">{t('motion.offline')}</div>}
            </section>
          </div>
          <div className="pf-motion-items">
            {items.map((item, index) => {
              const job = jobs[item.id];
              return (
                <article
                  className="pf-motion-item"
                  key={item.id}
                  style={{ '--d': `${Math.min(index, 8) * 45}ms` } as React.CSSProperties}
                >
                  <div className="pf-motion-item-heading">
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
                    <p className="pf-motion-status" data-state={job?.status ?? 'queued'}>
                      {t(`motion.${job?.status ?? 'queued'}`)}
                    </p>
                  )}
                  {job?.status === 'processing' && (
                    <div
                      className="pf-motion-progress"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(job.progress)}
                      aria-label={t('motion.processing')}
                    >
                      <span
                        className="pf-motion-progress-fill"
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                  )}
                  {job?.output && <OutputPreview output={job.output} name={item.name} />}
                </article>
              );
            })}
          </div>
        </section>
      </div>
      <Confetti burst={burst} />
    </main>
  );
}

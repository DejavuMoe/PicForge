import { SelectControl } from '../components/SelectControl';
import { VideoPlayer } from '../components/VideoPlayer';
import { NumberControl } from '../components/NumberControl';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WorkbenchLayout, Inspector, SwitchControl } from '../components/WorkbenchLayout';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  FiArrowLeft,
  FiChevronLeft,
  FiChevronRight,
  FiPlus,
  FiDownload,
  FiImage,
  FiTrash2,
} from 'react-icons/fi';
import { saveAs } from 'file-saver';
import { formatFileSize } from '../utils/fileUtils';
import { getRangeProgressStyle } from '../utils/rangeProgress';
import { defaultMotionSettings, groupMedia, type MediaOutput, type MotionSettings } from './media';
import { processMedia } from './processor';

interface Job {
  status: 'processing' | 'done' | 'error';
  progress: number;
  error?: string;
  output?: MediaOutput;
}
function useBlobUrl(blob?: Blob) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) {
      setUrl(undefined);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}
function Thumbnail({ blob }: { blob?: Blob }) {
  const url = useBlobUrl(blob);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [blob]);
  return (
    <span className="pf-motion-thumb">
      {url && !failed ? (
        <img src={url} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : (
        <FiImage aria-hidden />
      )}
    </span>
  );
}
export function OutputPreview({
  output,
  name,
  downloads = true,
  active = true,
}: {
  output: MediaOutput;
  name: string;
  downloads?: boolean;
  active?: boolean;
}) {
  const { t } = useTranslation();
  const image = useBlobUrl(output.image);
  const video = useBlobUrl(output.video);
  const [previewFailed, setPreviewFailed] = useState(false);
  useEffect(() => setPreviewFailed(false), [output.video]);
  return (
    <div className="pf-motion-output">
      {output.image && (
        <figure className="pf-motion-media-pane" data-kind="image">
          <figcaption>{t('workbench.photo')} · JPG</figcaption>
          <div className="pf-motion-media-frame">
            {image && <img src={image} alt={`${name} — ${t('workbench.photo')}`} />}
          </div>
          {downloads && (
            <button className="pf-text-button" onClick={() => saveAs(output.image!, `${name}.jpg`)}>
              <FiDownload aria-hidden />
              {t('workbench.downloadJpg')} <span>{formatFileSize(output.image.size)}</span>
            </button>
          )}
        </figure>
      )}
      {output.video && (
        <figure className="pf-motion-media-pane" data-kind="video">
          <figcaption>{t('workbench.video')} · MP4</figcaption>
          <div className="pf-motion-media-frame">
            {video && !previewFailed ? (
              <VideoPlayer
                src={video}
                poster={image}
                label={`${name} — ${t('workbench.video')}`}
                active={active}
                onError={() => setPreviewFailed(true)}
              />
            ) : image ? (
              <img src={image} alt={name} />
            ) : (
              <FiImage className="pf-media-placeholder" aria-hidden />
            )}
          </div>
          {previewFailed && (
            <p className="pf-motion-preview-note" role="status">
              {t('motion.previewUnavailable')}
            </p>
          )}
          {downloads && (
            <button className="pf-text-button" onClick={() => saveAs(output.video!, `${name}.mp4`)}>
              <FiDownload aria-hidden />
              {t('workbench.downloadMp4')} <span>{formatFileSize(output.video.size)}</span>
            </button>
          )}
        </figure>
      )}
    </div>
  );
}
export default function MotionWorkspace({
  android,
  active = true,
}: {
  android: boolean;
  active?: boolean;
}) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<File[]>([]);
  const [settings, setSettings] = useState<MotionSettings>(defaultMotionSettings);
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState('');
  const [dragging, setDragging] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'preview'>('list');
  const [confirmReset, setConfirmReset] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const items = groupMedia(files, android);
  const done = Object.values(jobs).filter((job) => job.status === 'done').length;
  useEffect(() => () => controller.current?.abort(), []);

  const allDone =
    items.length > 0 &&
    items.some((item) => !item.issue) &&
    items.every((item) => item.issue || jobs[item.id]?.status === 'done');
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
    setMobileView('list');
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
  const pending = items.filter((item) => !item.issue && jobs[item.id]?.status !== 'done').length;
  const resetQueue = () => {
    setFiles([]);
    setSelectedId(null);
    setMobileView('list');
    setConfirmReset(false);
    setJobs({});
    setNotice('');
  };
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const selectedJob = selected ? jobs[selected.id] : undefined;
  const selectedIndex = selected ? items.indexOf(selected) : -1;
  const choose = (id: string) => {
    setSelectedId(id);
    setMobileView('preview');
  };
  const thumbSource = (item: (typeof items)[number]) =>
    jobs[item.id]?.output?.image ??
    (item.image && /\.jpe?g$/i.test(item.image.name) ? item.image : undefined);
  const selectedError = selected?.issue || selectedJob?.error;
  const openInput = () => input.current?.click();
  const queue = (
    <div className="pf-file-list">
      <header className="pf-file-list-header">
        <h2>
          {t(android ? 'workbench.files' : 'workbench.pairs')} <span>{items.length || ''}</span>
        </h2>
        <button className="pf-text-button pf-add-files" disabled={locked} onClick={openInput}>
          <FiPlus aria-hidden />
          {t('workbench.add')}
        </button>
        {items.length > 0 && (
          <button
            className="pf-icon-button"
            disabled={busy || exporting}
            aria-label={t('motion.clear')}
            onClick={(event) => {
              event.currentTarget.focus();
              setConfirmReset(true);
            }}
          >
            <FiTrash2 aria-hidden />
          </button>
        )}
      </header>
      {items.length ? (
        <div className="pf-file-list-scroll">
          {items.map((item) => {
            const job = jobs[item.id];
            const error = item.issue || job?.error;
            return (
              <button
                key={item.id}
                className={`pf-motion-row${selected?.id === item.id ? ' is-selected' : ''}`}
                aria-pressed={selected?.id === item.id}
                onClick={() => choose(item.id)}
              >
                <Thumbnail blob={thumbSource(item)} />
                <span className="pf-motion-row-content">
                  <strong>{item.name}</strong>
                  <span
                    className={`pf-motion-row-status ${error === 'cancelled' ? 'is-cancelled' : error ? 'is-error' : job?.status === 'done' ? 'is-done' : ''}`}
                  >
                    {error
                      ? t(error === 'cancelled' ? 'status.cancelled' : 'motion.error')
                      : t(`motion.${job?.status ?? 'queued'}`)}
                  </span>
                  <span className="pf-motion-row-meta">
                    {android
                      ? formatFileSize(item.image?.size ?? 0)
                      : item.image && item.video
                        ? t('motion.pair')
                        : t(item.image ? 'motion.still' : 'motion.video')}
                  </span>
                </span>
                {job?.status === 'processing' && (
                  <span className="pf-file-row-progress">
                    <span style={{ width: `${job.progress}%` }} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="pf-queue-empty">{t('workbench.noFiles')}</div>
      )}
    </div>
  );
  const drop = (
    <div
      className={`pf-drop-zone${dragging ? ' is-dragging' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        add(Array.from(event.dataTransfer.files));
      }}
    >
      <div
        className="pf-drop-surface"
        role="button"
        tabIndex={0}
        onClick={openInput}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openInput();
          }
        }}
        aria-label={t('motion.drop')}
      >
        <div className="pf-drop-content">
          <div>
            <h2 className="pf-drop-main-text">{t('motion.drop')}</h2>
            <p className="pf-drop-secondary-text">
              {t(android ? 'workbench.androidImportHint' : 'workbench.iosImportHint')}
            </p>
          </div>
          <span className="pf-drop-cta" aria-hidden>
            {t('motion.select')}
          </span>
        </div>
      </div>
    </div>
  );
  const viewer = !selected ? (
    drop
  ) : (
    <div className="pf-motion-viewer">
      <header className="pf-preview-header">
        <div className="pf-preview-nav">
          <button
            className="pf-icon-control pf-preview-back"
            aria-label={t('preview.backToList')}
            onClick={() => setMobileView('list')}
          >
            <FiArrowLeft aria-hidden />
          </button>
          <span className="pf-preview-filename">{selected.name}</span>
        </div>
      </header>
      {selectedJob?.output ? (
        <OutputPreview
          key={selected.id}
          output={selectedJob.output}
          name={selected.name}
          downloads={!android}
          active={active}
        />
      ) : (
        <div className="pf-motion-waiting">
          <Thumbnail blob={thumbSource(selected)} />
          <h2>
            {selectedError
              ? t(selectedError === 'cancelled' ? 'status.cancelled' : 'motion.error')
              : t(`motion.${selectedJob?.status ?? 'queued'}`)}
          </h2>
          {selectedError ? (
            <p className="pf-field-error" role="alert">
              {t(`motion.errors.${selectedError}`, {
                defaultValue: t('motion.errors.engineFailed'),
              })}
            </p>
          ) : (
            <p className="pf-field-hint">
              {[selected.image?.name, selected.video?.name].filter(Boolean).join(' + ')}
            </p>
          )}
          {selectedJob?.status === 'processing' && (
            <progress max={100} value={selectedJob.progress} aria-label={t('motion.processing')} />
          )}
          {!busy && !selected?.issue && selectedJob?.error && (
            <button className="pf-button" onClick={run}>
              {t('workbench.retryUnfinished')}
            </button>
          )}
        </div>
      )}
      <div className="pf-viewer-footer">
        <span className="pf-viewer-metadata">
          {selectedIndex + 1} / {items.length}
        </span>
        <div className="pf-viewer-controls">
          <button
            className="pf-icon-control"
            aria-label={t('preview.previous')}
            disabled={selectedIndex <= 0}
            onClick={() => choose(items[selectedIndex - 1].id)}
          >
            <FiChevronLeft aria-hidden />
          </button>
          <button
            className="pf-icon-control"
            aria-label={t('preview.next')}
            disabled={selectedIndex >= items.length - 1}
            onClick={() => choose(items[selectedIndex + 1].id)}
          >
            <FiChevronRight aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
  const inspector = (
    <Inspector title={t(android ? 'workbench.outputFiles' : 'workbench.conversionSettings')}>
      {android ? (
        <>
          {(['image', 'video'] as const).map((type) => (
            <div className="pf-output-file" key={type}>
              <div>
                <h3>
                  {t(type === 'image' ? 'workbench.photo' : 'workbench.video')} ·{' '}
                  {type === 'image' ? 'JPG' : 'MP4'}
                </h3>
                <p>
                  {selectedJob?.output?.[type]
                    ? formatFileSize(selectedJob.output[type]!.size)
                    : t('workbench.notReady')}
                </p>
              </div>
              <button
                className="pf-button"
                disabled={!selectedJob?.output?.[type]}
                onClick={() => {
                  if (selectedJob?.output?.[type] && selected)
                    saveAs(
                      selectedJob.output[type]!,
                      `${selected.name}.${type === 'image' ? 'jpg' : 'mp4'}`,
                    );
                }}
              >
                {t(type === 'image' ? 'workbench.downloadJpg' : 'workbench.downloadMp4')}
              </button>
            </div>
          ))}
          <section className="pf-settings-section">
            <h3>{t('workbench.originalBytes')}</h3>
            <p className="pf-field-hint">{t('motion.androidNote')}</p>
          </section>
        </>
      ) : (
        <>
          <fieldset className="pf-settings-fields" disabled={locked}>
            <label className="pf-field">
              <span>{t('motion.preset')}</span>
              <SelectControl
                value={settings.preset}
                aria-label={t('motion.preset')}
                disabled={locked}
                onValueChange={(value) =>
                  setSettings({ ...settings, preset: value as MotionSettings['preset'] })
                }
              >
                {['balanced', 'quality', 'compact'].map((value) => (
                  <option value={value} key={value}>
                    {t(`motion.${value}`)}
                  </option>
                ))}
              </SelectControl>
            </label>
            <label className="pf-field">
              <span>{t('motion.fps')}</span>
              <SelectControl
                value={settings.fps}
                aria-label={t('motion.fps')}
                disabled={locked}
                onValueChange={(value) =>
                  setSettings({ ...settings, fps: value as MotionSettings['fps'] })
                }
              >
                <option value="source">{t('motion.sourceFps')}</option>
                <option value="30">30 fps</option>
              </SelectControl>
            </label>
            <label className="pf-field">
              <span>{t('motion.jpegQuality')}</span>
              <div className="pf-range-field">
                <input
                  type="range"
                  min={60}
                  max={95}
                  value={settings.quality}
                  style={getRangeProgressStyle(settings.quality, 60, 95)}
                  onChange={(event) =>
                    setSettings({ ...settings, quality: Number(event.target.value) })
                  }
                />
                <NumberControl
                  className="pf-number-value"
                  min={60}
                  max={95}
                  value={settings.quality}
                  aria-label={t('workbench.qualityValue')}
                  onValueChange={(quality) => setSettings({ ...settings, quality })}
                />
              </div>
            </label>
            <div className="pf-field-heading">
              <span>{t('motion.audio')}</span>
              <SwitchControl
                checked={settings.audio}
                ariaLabel={t('motion.audio')}
                onChange={(audio) => setSettings({ ...settings, audio })}
              />
            </div>
          </fieldset>
          <details className="pf-settings-extra">
            <summary>{t('workbench.pairingHelp')}</summary>
            <p className="pf-motion-note">{t('motion.pairing')}</p>
            <p className="pf-motion-note">{t('motion.iosNote')}</p>
            <p className="pf-motion-note">{t('motion.offline')}</p>
          </details>
        </>
      )}
      {locked && !busy && <p className="pf-motion-note">{t('motion.lockedHint')}</p>}
      {notice && (
        <p className="pf-field-error" role="alert">
          {t(`motion.errors.${notice}`, { maxMB: batchMegabytes })}
        </p>
      )}
    </Inspector>
  );
  return (
    <div className="pf-motion-workspace" data-tool={android ? 'android' : 'ios'}>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={android ? '.jpg,.jpeg' : '.heic,.heif,.mov,.jpg,.jpeg,.mp4'}
        onChange={(event) => {
          add(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
      <WorkbenchLayout
        queue={queue}
        viewer={viewer}
        inspector={inspector}
        hasFiles={items.length > 0}
        mobileView={mobileView}
      />
      {items.length > 0 && (
        <div className="pf-status-bar" role="region" aria-label={t('workbench.batchActions')}>
          <div className="pf-batch-status" role="status" aria-live="polite">
            {items.length > 0 && t('motion.count', { done, total: items.length })}
          </div>
          <div className="pf-motion-actions">
            {busy ? (
              <button className="pf-button" onClick={() => controller.current?.abort()}>
                {t('workbench.cancelProcessing')}
              </button>
            ) : (
              <>
                {allDone && (
                  <button
                    className="pf-text-button"
                    disabled={exporting}
                    onClick={(event) => {
                      event.currentTarget.focus();
                      setConfirmReset(true);
                    }}
                  >
                    {t('motion.newBatch')}
                  </button>
                )}
                {pending > 0 && (
                  <button
                    className={`pf-button${hasResults ? '' : ' is-primary'}`}
                    disabled={exporting}
                    onClick={run}
                  >
                    {t(android ? 'workbench.extractFiles' : 'motion.start')}
                  </button>
                )}
              </>
            )}
            {(hasResults || pending === 0) && (
              <button
                className="pf-button pf-export-button is-primary"
                disabled={!hasResults || exporting || busy}
                onClick={exportZip}
              >
                <FiDownload aria-hidden />
                {t(exporting ? 'motion.exporting' : 'workbench.exportCompleted')}
              </button>
            )}
          </div>
        </div>
      )}
      {confirmReset && (
        <ConfirmDialog
          danger
          title={t('dialog.clearTitle')}
          body={t('dialog.clearBody')}
          onCancel={() => setConfirmReset(false)}
          onConfirm={resetQueue}
        />
      )}
    </div>
  );
}

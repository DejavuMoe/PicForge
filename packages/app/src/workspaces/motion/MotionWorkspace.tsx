import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { saveAs } from 'file-saver';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DropSheet } from '../../components/workbench/DropSheet';
import { WorkbenchLayout } from '../../components/workbench/WorkbenchLayout';
import { readLivePhotoIdentifier } from '../../motion/appleIdentifier';
import { defaultMotionSettings, groupMedia, type MotionSettings } from '../../motion/media';
import { processMedia } from '../../motion/processor';
import { collectDroppedFiles } from '../../utils/fileUtils';
import type { Job } from './jobs';
import { MotionBatchBar } from './MotionBatchBar';
import { MotionInspector } from './MotionInspector';
import { MotionOutputs } from './MotionOutputs';
import { MotionQueue } from './MotionQueue';
import { MotionViewer } from './MotionViewer';

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'preview'>('list');
  const [confirmReset, setConfirmReset] = useState(false);
  // Apple content identifiers read from added iOS files; pairing waits for them.
  const [identifiers, setIdentifiers] = useState<ReadonlyMap<File, string | undefined>>(
    () => new Map(),
  );
  const [scanning, setScanning] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  // Folder drops resolve asynchronously; check limits against the latest queue.
  const filesRef = useRef(files);
  filesRef.current = files;
  const items = groupMedia(files, android, android ? undefined : identifiers);
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
    const queued = filesRef.current;
    if (
      queued.length + incoming.length > 100 ||
      [...queued, ...incoming].reduce((sum, file) => sum + file.size, 0) >
        batchMegabytes * 1024 * 1024
    ) {
      setNotice('batchLimit');
      return;
    }
    filesRef.current = [...queued, ...incoming];
    setFiles((previous) => [...previous, ...incoming]);
    setMobileView('list');
    setJobs({});
    setNotice('');
    if (android) return;
    setScanning((count) => count + 1);
    void Promise.all(
      incoming.map(async (file) => [file, await readLivePhotoIdentifier(file)] as const),
    )
      .then((entries) =>
        setIdentifiers((previous) => {
          const next = new Map(previous);
          for (const [file, identifier] of entries) next.set(file, identifier);
          return next;
        }),
      )
      .finally(() => setScanning((count) => count - 1));
  };
  const run = async () => {
    if (controller.current || scanning > 0) return;
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
          if (!active.signal.aborted) console.warn(`[PicForge] ${item.name} failed`, error);
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
  const pending = items.filter((item) => !item.issue && jobs[item.id]?.status !== 'done').length;
  const resetQueue = () => {
    setFiles([]);
    setSelectedId(null);
    setMobileView('list');
    setConfirmReset(false);
    setJobs({});
    setIdentifiers(new Map());
    setNotice('');
  };
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const selectedJob = selected ? jobs[selected.id] : undefined;
  const selectedIndex = selected ? items.indexOf(selected) : -1;
  const choose = (id: string) => {
    setSelectedId(id);
    setMobileView('preview');
  };
  const openInput = () => input.current?.click();
  const viewer = !selected ? (
    <DropSheet
      index={android ? '02' : '03'}
      tool={t(`motion.${android ? 'android' : 'ios'}`)}
      title={t('motion.drop')}
      hint={t(android ? 'workbench.androidImportHint' : 'workbench.iosImportHint')}
      formats={android ? ['JPG'] : ['HEIC', 'MOV', 'JPG', 'MP4']}
      label={t('motion.drop')}
      // Entries are read synchronously here; folders are expanded afterwards.
      onDrop={(data) => void collectDroppedFiles(data).then(add)}
      onBrowse={openInput}
    />
  ) : (
    <MotionViewer
      android={android}
      item={selected}
      job={selectedJob}
      index={selectedIndex}
      total={items.length}
      active={active}
      canRetry={!busy && !selected.issue && !!selectedJob?.error}
      retryDisabled={scanning > 0}
      onRetry={run}
      onBack={() => setMobileView('list')}
      onPrev={() => choose(items[selectedIndex - 1].id)}
      onNext={() => choose(items[selectedIndex + 1].id)}
    />
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
        queue={
          <MotionQueue
            android={android}
            items={items}
            jobs={jobs}
            selectedId={selected?.id}
            locked={locked}
            clearDisabled={busy || exporting}
            onAdd={openInput}
            onClear={() => setConfirmReset(true)}
            onSelect={choose}
          />
        }
        viewer={viewer}
        inspector={
          <MotionInspector
            android={android}
            settings={settings}
            onSettings={setSettings}
            locked={locked}
            busy={busy}
            notice={notice}
            batchMegabytes={batchMegabytes}
            footer={
              selected && (
                <MotionOutputs android={android} item={selected} output={selectedJob?.output} />
              )
            }
          />
        }
        hasFiles={items.length > 0}
        mobileView={mobileView}
        batch={
          items.length > 0 && (
            <MotionBatchBar
              android={android}
              total={items.length}
              done={done}
              pending={pending}
              busy={busy}
              exporting={exporting}
              scanning={scanning > 0}
              allDone={allDone}
              onRun={run}
              onCancel={() => controller.current?.abort()}
              onExport={exportZip}
              onNewBatch={() => setConfirmReset(true)}
            />
          )
        }
      />
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

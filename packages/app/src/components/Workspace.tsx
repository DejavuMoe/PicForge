import type { ImageFile } from '../types';
import { FileList } from './FileList';
import { Preview } from './Preview';

interface WorkspaceProps {
  selectedId: string | null;
  selectedFile: ImageFile | null;
  mobileView: 'list' | 'preview';
  currentIdx: number;
  fileCount: number;
  onSelect: (file: ImageFile) => void;
  onBackToList: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export function Workspace({
  selectedId,
  selectedFile,
  mobileView,
  currentIdx,
  fileCount,
  onSelect,
  onBackToList,
  onPrev,
  onNext,
}: WorkspaceProps) {
  return (
    <main className="pf-workspace" data-testid="app-main">
      <section
        className={`pf-file-list-panel${mobileView === 'list' ? ' is-mobile-active' : ''}`}
        data-testid="file-list-panel"
      >
        <FileList selectedId={selectedId} onSelect={onSelect} />
      </section>

      <section
        className={`pf-preview-panel${mobileView === 'preview' ? ' is-mobile-active' : ''}`}
        data-testid="preview-panel"
      >
        <Preview
          file={selectedFile}
          onPrev={onPrev}
          onNext={onNext}
          hasPrev={currentIdx > 0}
          hasNext={currentIdx < fileCount - 1}
          onBackToList={onBackToList}
          showBackButton={mobileView === 'preview'}
        />
      </section>
    </main>
  );
}

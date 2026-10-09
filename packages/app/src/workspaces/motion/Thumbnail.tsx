import { useEffect, useState } from 'react';
import { FiImage } from 'react-icons/fi';
import { cx } from '../../components/ui/cx';
import { useBlobUrl } from './useBlobUrl';

export function Thumbnail({ blob, large = false }: { blob?: Blob; large?: boolean }) {
  const url = useBlobUrl(blob);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [blob]);
  return (
    <span className={cx('pf-motion-thumb', large && 'is-large')}>
      {url && !failed ? (
        <img src={url} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : (
        <FiImage aria-hidden />
      )}
    </span>
  );
}

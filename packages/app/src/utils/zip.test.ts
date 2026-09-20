import { runInNewContext } from 'node:vm';
import JSZip from 'jszip';
import { expect, it } from 'vitest';

it('preserves Blob and cross-realm typed-array bytes with Unicode names in ZIP exports', async () => {
  const zip = new JSZip();
  const foreign: Uint8Array = runInNewContext('new Uint8Array([99, 1, 2, 3, 99]).subarray(1, 4)');
  zip.file('照片/原片.bin', new Blob([Uint8Array.of(4, 5, 6)]));
  zip.file('worker.bin', foreign);
  zip.file('picforge-manifest.json', JSON.stringify({ name: '照片', outputs: 2 }));
  const archive = await JSZip.loadAsync(
    await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
  );
  expect(Array.from(await archive.file('照片/原片.bin')!.async('uint8array'))).toEqual([4, 5, 6]);
  expect(Array.from(await archive.file('worker.bin')!.async('uint8array'))).toEqual([1, 2, 3]);
  expect(JSON.parse(await archive.file('picforge-manifest.json')!.async('string'))).toEqual({
    name: '照片',
    outputs: 2,
  });
});

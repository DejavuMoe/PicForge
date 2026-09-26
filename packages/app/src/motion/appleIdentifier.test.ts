import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readLivePhotoIdentifier } from './appleIdentifier';

const fixture = (name: string) =>
  new File([readFileSync(new URL(`../../../../sample/ios/${name}`, import.meta.url))], name);

describe('Apple Live Photo identifier', () => {
  it('reads the same content identifier from the approved HEIC and MOV pair', async () => {
    const still = await readLivePhotoIdentifier(fixture('IMG_1539.HEIC'));
    const video = await readLivePhotoIdentifier(fixture('IMG_1539.MOV'));
    expect(still).toBe('F587AE2E-32C1-4F2F-8D4A-E044CAAB26CA');
    expect(video).toBe(still);
  });

  it('returns undefined for files without the identifier', async () => {
    expect(await readLivePhotoIdentifier(new File([new Uint8Array(64)], 'x.heic'))).toBeUndefined();
    expect(
      await readLivePhotoIdentifier(new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], 'x.jpg')),
    ).toBeUndefined();
    expect(await readLivePhotoIdentifier(new File([new Uint8Array(16)], 'x.mov'))).toBeUndefined();
    expect(await readLivePhotoIdentifier(new File([new Uint8Array(16)], 'x.png'))).toBeUndefined();
  });
});

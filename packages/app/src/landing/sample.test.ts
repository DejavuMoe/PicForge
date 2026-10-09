import { statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SAMPLE_BYTES } from './sample';

const size = (name: string) => statSync(new URL(`../assets/${name}`, import.meta.url)).size;

describe('home sample', () => {
  it('labels the sample pair with the sizes of the committed files', () => {
    expect(size('dune-sample.jpg')).toBe(SAMPLE_BYTES.jpeg);
    expect(size('dune-preview.webp')).toBe(SAMPLE_BYTES.webp);
  });
});

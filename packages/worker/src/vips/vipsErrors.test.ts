import { describe, expect, it } from 'vitest';
import { normalizeVipsError } from './vipsErrors';
import { ImageEngineError } from '../imageEngine';

describe('Vips native fault classification', () => {
  it('treats corrupt and unsupported inputs as input failures', () => {
    expect(
      normalizeVipsError({ message: ['vips::Error', 'VipsJpeg: Premature end of input'] }).failure,
    ).toBe('input');
    expect(
      normalizeVipsError({ message: ['vips::Error', 'unable to load from buffer'] }).message,
    ).toContain('unable to load from buffer');
    const typed = new ImageEngineError('bad ICC profile', 'input');
    expect(normalizeVipsError(typed)).toBe(typed);
  });
  it.each([
    new WebAssembly.RuntimeError('out of bounds'),
    new RangeError('allocation failed'),
    new DOMException('transfer failed', 'DataCloneError'),
    { message: ['std::bad_alloc', 'bad allocation'] },
    { message: ['vips::Error', 'glib: Error creating thread: Resource temporarily unavailable'] },
    { message: ['vips::Error', 'no such operation jpegload_buffer'] },
  ])('counts explicit runtime faults: %j', (error) => {
    expect(normalizeVipsError(error).failure).toBe('runtime');
  });
  it('always classifies initialization faults as infrastructure', () => {
    expect(normalizeVipsError({ message: ['vips::Error', 'probe failed'] }, true).failure).toBe(
      'runtime',
    );
    expect(normalizeVipsError(new TypeError('failed fetch'), true).failure).toBe('runtime');
  });
});

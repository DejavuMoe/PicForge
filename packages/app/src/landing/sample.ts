/**
 * Byte sizes of the bundled sample pair, shown on the home plate. They describe the
 * committed files exactly; sample.test.ts fails if either file changes without them.
 */
export const SAMPLE_BYTES = {
  jpeg: 147972,
  webp: 55092,
} as const;

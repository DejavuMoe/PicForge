export type CompareMode = 'slider' | 'sideBySide' | 'single';

interface DefaultCompareModeInput {
  hasResult: boolean;
  hasDimensionChange: boolean;
  isMobile: boolean;
}

export function getDefaultCompareMode({
  hasResult,
  hasDimensionChange,
  isMobile,
}: DefaultCompareModeInput): CompareMode {
  if (!hasResult) return 'single';
  if (isMobile) return 'sideBySide';
  return hasDimensionChange ? 'sideBySide' : 'slider';
}

export function isCompareModeAvailable(mode: CompareMode, hasResult: boolean): boolean {
  if (mode === 'single') return true;
  return hasResult;
}

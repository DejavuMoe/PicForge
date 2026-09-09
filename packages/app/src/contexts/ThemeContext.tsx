import {
  createContext,
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ColorMode = 'light' | 'dark';

export interface ThemeColors {
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
  toggleColorMode: () => void;
  pageBg: string;
  surfaceBg: string;
  cardBg: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textDisabled: string;
  borderDefault: string;
  borderHover: string;
  borderActive: string;
  borderSubtle: string;
  accent: string;
  accentHover: string;
  accentSubtle: string;
  success: string;
  successSubtle: string;
  error: string;
  errorSubtle: string;
  warning: string;
  warningSubtle: string;
  hoverBg: string;
  activeBg: string;
  selectedBg: string;
  focusRing: string;
  shadowRaised: string;
  shadowPopover: string;
}

const LIGHT_COLORS = {
  pageBg: '#ffffff',
  surfaceBg: '#f6f6f6',
  cardBg: '#ffffff',
  textPrimary: '#202322',
  textSecondary: '#616762',
  textTertiary: '#686e69',
  textDisabled: '#69736c',
  borderDefault: '#dddfdd',
  borderHover: '#858c87',
  borderActive: '#617269',
  borderSubtle: '#e9ebe9',
  accent: '#245946',
  accentHover: '#1c4939',
  accentSubtle: '#edf3f0',
  success: '#245946',
  successSubtle: '#edf3f0',
  error: '#b53b3b',
  errorSubtle: '#faeded',
  warning: '#916716',
  warningSubtle: '#faf2e3',
  hoverBg: '#eff1ef',
  activeBg: '#e4eae6',
  selectedBg: '#edf3f0',
  focusRing: '0 0 0 2px #ffffff, 0 0 0 4px #245946',
  shadowRaised: 'none',
  shadowPopover: '0 8px 28px rgba(20, 30, 24, 0.14)',
} satisfies Omit<ThemeColors, 'colorMode' | 'setColorMode' | 'toggleColorMode'>;

const DARK_COLORS = {
  pageBg: '#202222',
  surfaceBg: '#242626',
  cardBg: '#202222',
  textPrimary: '#eceeec',
  textSecondary: '#c1cdc5',
  textTertiary: '#a0a7a1',
  textDisabled: '#a1afa6',
  borderDefault: '#373b38',
  borderHover: '#747d76',
  borderActive: '#91bba4',
  borderSubtle: '#303431',
  accent: '#91bba4',
  accentHover: '#acd0bc',
  accentSubtle: '#303e37',
  success: '#91bba4',
  successSubtle: '#303e37',
  error: '#ee9999',
  errorSubtle: '#422a2a',
  warning: '#e3bd74',
  warningSubtle: '#3d3425',
  hoverBg: '#2c312e',
  activeBg: '#354039',
  selectedBg: '#303e37',
  focusRing: '0 0 0 2px #202222, 0 0 0 4px #91bba4',
  shadowRaised: 'none',
  shadowPopover: '0 8px 28px rgba(0, 0, 0, 0.3)',
} satisfies Omit<ThemeColors, 'colorMode' | 'setColorMode' | 'toggleColorMode'>;

const DEFAULT_COLORS: ThemeColors = {
  colorMode: 'light',
  setColorMode: () => undefined,
  toggleColorMode: () => undefined,
  ...LIGHT_COLORS,
};

const CSS_VARS: Array<
  [keyof Omit<ThemeColors, 'colorMode' | 'setColorMode' | 'toggleColorMode'>, string]
> = [
  ['pageBg', '--pf-page-bg'],
  ['surfaceBg', '--pf-surface-bg'],
  ['cardBg', '--pf-card-bg'],
  ['textPrimary', '--pf-text-primary'],
  ['textSecondary', '--pf-text-secondary'],
  ['textTertiary', '--pf-text-tertiary'],
  ['textDisabled', '--pf-text-disabled'],
  ['borderDefault', '--pf-border-default'],
  ['borderHover', '--pf-border-hover'],
  ['borderActive', '--pf-border-active'],
  ['borderSubtle', '--pf-border-subtle'],
  ['accent', '--pf-accent'],
  ['accentHover', '--pf-accent-hover'],
  ['accentSubtle', '--pf-accent-subtle'],
  ['success', '--pf-success'],
  ['successSubtle', '--pf-success-subtle'],
  ['error', '--pf-error'],
  ['errorSubtle', '--pf-error-subtle'],
  ['warning', '--pf-warning'],
  ['warningSubtle', '--pf-warning-subtle'],
  ['hoverBg', '--pf-hover-bg'],
  ['activeBg', '--pf-active-bg'],
  ['selectedBg', '--pf-selected-bg'],
  ['focusRing', '--pf-focus-ring'],
  ['shadowRaised', '--pf-shadow-raised'],
  ['shadowPopover', '--pf-shadow-popover'],
];

const PICFORGE_COLOR_KEY = 'picforge-color-mode';

export const ThemeContext = createContext<ThemeColors>(DEFAULT_COLORS);

function getInitialColorMode(): ColorMode {
  if (typeof window === 'undefined') return 'light';

  const stored = window.localStorage.getItem(PICFORGE_COLOR_KEY);
  if (stored === 'light' || stored === 'dark') return stored;

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function persistColorMode(mode: ColorMode): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PICFORGE_COLOR_KEY, mode);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [colorMode, setColorModeState] = useState<ColorMode>(() => getInitialColorMode());

  const setColorMode = useCallback((mode: ColorMode) => {
    persistColorMode(mode);
    setColorModeState(mode);
  }, []);

  const toggleColorMode = useCallback(() => {
    setColorModeState((current) => {
      const next = current === 'light' ? 'dark' : 'light';
      persistColorMode(next);
      return next;
    });
  }, []);

  const colors = colorMode === 'light' ? LIGHT_COLORS : DARK_COLORS;

  const value = useMemo<ThemeColors>(
    () => ({
      colorMode,
      setColorMode,
      toggleColorMode,
      ...colors,
    }),
    [colorMode, colors, setColorMode, toggleColorMode],
  );

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.pfTheme = value.colorMode;
    root.style.colorScheme = value.colorMode;

    for (const [key, varName] of CSS_VARS) {
      root.style.setProperty(varName, value[key]);
    }
  }, [value]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

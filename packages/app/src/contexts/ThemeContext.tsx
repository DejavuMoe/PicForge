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
  pageBg: '#f5f6f8',
  surfaceBg: '#fbfcfd',
  cardBg: '#ffffff',
  textPrimary: '#16181d',
  textSecondary: '#4b525c',
  textTertiary: '#78808c',
  textDisabled: '#b7bdc7',
  borderDefault: '#e2e5ea',
  borderHover: '#c6ccd6',
  borderActive: '#9aa3b0',
  borderSubtle: '#eceef2',
  accent: '#2f6bf0',
  accentHover: '#1f59d8',
  accentSubtle: '#eaf1fe',
  success: '#1d9e63',
  successSubtle: '#e5f7ee',
  error: '#e5484d',
  errorSubtle: '#fdecec',
  warning: '#d9930d',
  warningSubtle: '#fdf3e0',
  hoverBg: '#eef0f4',
  activeBg: '#e4e7ec',
  selectedBg: '#e8effd',
  focusRing: '0 0 0 2px #ffffff, 0 0 0 4px #2f6bf0',
  shadowRaised: '0 1px 2px rgba(16, 24, 40, 0.05)',
  shadowPopover:
    '0 1px 2px rgba(16, 24, 40, 0.04), 0 8px 24px -8px rgba(16, 24, 40, 0.12), 0 24px 48px -16px rgba(16, 24, 40, 0.14)',
} satisfies Omit<ThemeColors, 'colorMode' | 'setColorMode' | 'toggleColorMode'>;

const DARK_COLORS = {
  pageBg: '#090a0d',
  surfaceBg: '#0d0f13',
  cardBg: '#11141a',
  textPrimary: '#e9ebf0',
  textSecondary: '#9ba3af',
  textTertiary: '#6e7683',
  textDisabled: '#3d434d',
  borderDefault: '#21252e',
  borderHover: '#333a46',
  borderActive: '#4a5262',
  borderSubtle: '#171a20',
  accent: '#5b8cff',
  accentHover: '#7aa3ff',
  accentSubtle: '#101a30',
  success: '#3fce8a',
  successSubtle: '#0a2418',
  error: '#f2636e',
  errorSubtle: '#2c1016',
  warning: '#e8a94a',
  warningSubtle: '#261a09',
  hoverBg: '#161a21',
  activeBg: '#1c212a',
  selectedBg: '#131c2e',
  focusRing: '0 0 0 2px #090a0d, 0 0 0 4px #5b8cff',
  shadowRaised: '0 1px 2px rgba(0, 0, 0, 0.4)',
  shadowPopover: '0 2px 8px rgba(0, 0, 0, 0.45), 0 16px 48px -8px rgba(0, 0, 0, 0.55)',
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

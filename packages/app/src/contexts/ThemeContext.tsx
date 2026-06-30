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
  surfaceBg: '#fafafa',
  cardBg: '#ffffff',
  textPrimary: '#171717',
  textSecondary: '#4d4d4d',
  textTertiary: '#7d7d7d',
  textDisabled: '#a8a8a8',
  borderDefault: '#eaeaea',
  borderHover: '#c9c9c9',
  borderActive: '#a8a8a8',
  borderSubtle: '#ebebeb',
  accent: '#006bff',
  accentHover: '#0059ec',
  accentSubtle: '#f0f7ff',
  success: '#28a948',
  successSubtle: '#ecfdec',
  error: '#fc0035',
  errorSubtle: '#ffeeef',
  warning: '#ffae00',
  warningSubtle: '#fff6de',
  hoverBg: '#f2f2f2',
  activeBg: '#e6e6e6',
  selectedBg: '#f0f7ff',
  focusRing: '0 0 0 2px #ffffff, 0 0 0 4px #006bff',
  shadowRaised: '0 2px 2px rgba(0, 0, 0, 0.04)',
  shadowPopover:
    '0 1px 1px rgba(0, 0, 0, 0.02), 0 4px 8px -4px rgba(0, 0, 0, 0.04), 0 16px 24px -8px rgba(0, 0, 0, 0.06)',
} satisfies Omit<ThemeColors, 'colorMode' | 'setColorMode' | 'toggleColorMode'>;

const DARK_COLORS = {
  pageBg: '#000000',
  surfaceBg: '#0a0a0a',
  cardBg: '#0a0a0a',
  textPrimary: '#ededed',
  textSecondary: '#a0a0a0',
  textTertiary: '#878787',
  textDisabled: '#454545',
  borderDefault: '#2e2e2e',
  borderHover: '#454545',
  borderActive: '#878787',
  borderSubtle: '#1f1f1f',
  accent: '#006efe',
  accentHover: '#005be7',
  accentSubtle: '#06193a',
  success: '#00ac3a',
  successSubtle: '#002608',
  error: '#f13242',
  errorSubtle: '#330a11',
  warning: '#ffae00',
  warningSubtle: '#2a1700',
  hoverBg: '#1a1a1a',
  activeBg: '#1f1f1f',
  selectedBg: '#06193a',
  focusRing: '0 0 0 2px #000000, 0 0 0 4px #47a8ff',
  shadowRaised: '0 1px 2px rgba(0, 0, 0, 0.16)',
  shadowPopover:
    '0 1px 1px rgba(0, 0, 0, 0.02), 0 4px 8px -4px rgba(0, 0, 0, 0.04), 0 16px 24px -8px rgba(0, 0, 0, 0.06)',
} satisfies Omit<ThemeColors, 'colorMode' | 'setColorMode' | 'toggleColorMode'>;

const DEFAULT_COLORS: ThemeColors = {
  colorMode: 'light',
  setColorMode: () => undefined,
  toggleColorMode: () => undefined,
  ...LIGHT_COLORS,
};

const CSS_VARS: Array<[
  keyof Omit<ThemeColors, 'colorMode' | 'setColorMode' | 'toggleColorMode'>,
  string,
]> = [
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

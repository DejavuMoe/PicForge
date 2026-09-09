import {
  createContext,
  useCallback,
  useEffect,
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
}
const COLOR_KEY = 'picforge-color-mode';
export const ThemeContext = createContext<ThemeColors>({
  colorMode: 'light',
  setColorMode: () => undefined,
  toggleColorMode: () => undefined,
});
function storedMode(): ColorMode | null {
  try {
    const mode = localStorage.getItem(COLOR_KEY);
    return mode === 'light' || mode === 'dark' ? mode : null;
  } catch {
    return null;
  }
}
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ColorMode | null>(storedMode);
  const [system, setSystem] = useState<ColorMode>(() =>
    matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  );
  const colorMode = preference ?? system;
  const setColorMode = useCallback((mode: ColorMode) => {
    setPreference(mode);
    try {
      localStorage.setItem(COLOR_KEY, mode);
    } catch {
      /* Preferences still work for this visit. */
    }
  }, []);
  const toggleColorMode = useCallback(
    () => setColorMode(colorMode === 'light' ? 'dark' : 'light'),
    [colorMode, setColorMode],
  );
  useEffect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystem(query.matches ? 'dark' : 'light');
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useLayoutEffect(() => {
    document.documentElement.dataset.pfTheme = colorMode;
    document.documentElement.style.colorScheme = colorMode;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', colorMode === 'dark' ? '#202020' : '#ffffff');
  }, [colorMode]);
  const value = useMemo(
    () => ({ colorMode, setColorMode, toggleColorMode }),
    [colorMode, setColorMode, toggleColorMode],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

import { useContext } from 'react';
import { ThemeContext, type ThemeColors } from '../contexts/ThemeContext';

export function useThemeColors(): ThemeColors {
  return useContext(ThemeContext);
}

export type { ThemeColors };

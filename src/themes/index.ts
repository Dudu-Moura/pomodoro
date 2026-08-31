import type { ThemeId } from '../core/types';
import type { ThemeModule } from './types';
import { orbitTheme } from './orbit';
import { blackholeTheme } from './blackhole';
import { terminalTheme } from './terminal';
import { reactorTheme } from './reactor';

export const themes: Record<ThemeId, ThemeModule> = {
  orbit: orbitTheme,
  blackhole: blackholeTheme,
  terminal: terminalTheme,
  reactor: reactorTheme,
};

export const themeList: ThemeModule[] = [orbitTheme, blackholeTheme, terminalTheme, reactorTheme];
export const getTheme = (id: ThemeId): ThemeModule => themes[id] ?? orbitTheme;

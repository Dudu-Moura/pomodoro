import { store, todayKey } from './store';
import { getTheme } from '../themes';
import type { AppState, Phase, ThemeId } from './types';

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  icon: string;
  test: (s: AppState) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first', name: 'Ignição', icon: '✦', desc: 'Conclua sua primeira sessão de foco.', test: (s) => s.totals.sessions >= 1 },
  { id: 'ten', name: 'Constância', icon: '❖', desc: 'Conclua 10 sessões de foco.', test: (s) => s.totals.sessions >= 10 },
  { id: 'fifty', name: 'Veterano', icon: '✵', desc: 'Conclua 50 sessões de foco.', test: (s) => s.totals.sessions >= 50 },
  { id: 'century', name: 'Centurião', icon: '⬢', desc: 'Conclua 100 sessões de foco.', test: (s) => s.totals.sessions >= 100 },
  { id: 'h5', name: 'Cinco Horas', icon: '◷', desc: 'Acumule 5 horas de foco.', test: (s) => s.totals.focusMinutes >= 300 },
  { id: 'h25', name: 'Maratonista', icon: '◶', desc: 'Acumule 25 horas de foco.', test: (s) => s.totals.focusMinutes >= 1500 },
  { id: 'streak3', name: 'Três em Linha', icon: '▲', desc: 'Mantenha 3 dias seguidos de foco.', test: (s) => s.streak.count >= 3 },
  { id: 'streak7', name: 'Semana Perfeita', icon: '★', desc: 'Mantenha 7 dias seguidos de foco.', test: (s) => s.streak.count >= 7 },
  { id: 'streak30', name: 'Hábito Formado', icon: '✷', desc: 'Mantenha 30 dias seguidos de foco.', test: (s) => s.streak.count >= 30 },
  {
    id: 'day4', name: 'Dia Cheio', icon: '◉', desc: 'Conclua 4 sessões em um mesmo dia.',
    test: (s) => s.marks.filter((m) => m.phase === 'focus' && m.completed && todayKey(new Date(m.ts)) === todayKey()).length >= 4,
  },
  {
    id: 'night', name: 'Coruja', icon: '☾', desc: 'Conclua uma sessão entre 00h e 05h.',
    test: (s) => s.marks.some((m) => m.completed && m.phase === 'focus' && new Date(m.ts).getHours() < 5),
  },
  {
    id: 'dawn', name: 'Madrugador', icon: '☀', desc: 'Conclua uma sessão antes das 07h.',
    test: (s) => s.marks.some((m) => m.completed && m.phase === 'focus' && new Date(m.ts).getHours() >= 5 && new Date(m.ts).getHours() < 7),
  },
  {
    id: 'explorer', name: 'Explorador', icon: '⧉', desc: 'Conclua ao menos uma sessão em cada um dos 4 temas.',
    test: (s) => (['orbit', 'blackhole', 'terminal', 'reactor'] as ThemeId[]).every((t) => s.progress[t].sessions >= 1),
  },
  { id: 'deep', name: 'Sessão Profunda', icon: '⌬', desc: 'Conclua uma sessão de foco de 50 min ou mais.', test: (s) => s.marks.some((m) => m.completed && m.phase === 'focus' && m.minutes >= 50) },
  { id: 'writer', name: 'Anotador', icon: '✎', desc: 'Escreva 500 caracteres nas anotações.', test: (s) => s.notes.length >= 500 },
];

export interface SessionOutcome {
  xpGained: number;
  counterGained: number;
  levelUp: { from: number; to: number; name: string; desc: string } | null;
  unlocks: { name: string; icon: string; desc: string }[];
  achievements: Achievement[];
  message: string;
}

const unlockedIds = (themeId: ThemeId, counter: number): string[] => {
  const t = getTheme(themeId);
  const fake = { xp: 0, level: 1, totalMinutes: 0, sessions: 0, unlocked: [], counter, stagePick: 0 };
  return t.progression.view(fake, 1).collection.filter((c) => c.unlocked).map((c) => c.id);
};

const levelFor = (themeId: ThemeId, counter: number): number =>
  Math.max(1, getTheme(themeId).progression.tiers.filter((t) => counter >= t.at).length);

/** Aplica o resultado de uma fase concluída ao estado persistido. */
export function applySession(phase: Phase, minutes: number, completed: boolean): SessionOutcome {
  const s = store.state;
  const themeId = s.settings.theme;
  const theme = getTheme(themeId);
  const p = s.progress[themeId];

  const before = { level: p.level, unlocked: unlockedIds(themeId, p.counter) };
  const beforeAch = new Set(ACHIEVEMENTS.filter((a) => a.test(s)).map((a) => a.id));

  const gained = completed ? theme.progression.gain(minutes, phase) : theme.progression.gain(minutes * 0.4, phase);
  const xp = Math.round(minutes * (phase === 'focus' ? 10 : 3) * (completed ? 1 : 0.4));

  p.counter += gained;
  p.xp += xp;
  p.totalMinutes += minutes;
  if (phase === 'focus' && completed) {
    p.sessions += 1;
    s.totals.sessions += 1;
  }
  if (phase === 'focus') s.totals.focusMinutes += minutes;

  const newLevel = levelFor(themeId, p.counter);
  const levelUpTier = newLevel > before.level ? theme.progression.tiers[newLevel - 1] : null;
  p.level = newLevel;

  const after = unlockedIds(themeId, p.counter);
  const newIds = after.filter((id) => !before.unlocked.includes(id));
  const view = theme.progression.view(p, p.level);
  const unlocks = view.collection.filter((c) => newIds.includes(c.id)).map((c) => ({ name: c.name, icon: c.icon, desc: c.desc }));
  p.unlocked = Array.from(new Set([...p.unlocked, ...after]));

  const achievements = ACHIEVEMENTS.filter((a) => !beforeAch.has(a.id) && a.test(s));

  store.emit();

  return {
    xpGained: xp,
    counterGained: gained,
    levelUp: levelUpTier ? { from: before.level, to: newLevel, name: levelUpTier.name, desc: levelUpTier.desc } : null,
    unlocks,
    achievements,
    message: theme.progression.completionMessage(p, minutes),
  };
}

export const unlockedAchievements = (s: AppState): Achievement[] => ACHIEVEMENTS.filter((a) => a.test(s));

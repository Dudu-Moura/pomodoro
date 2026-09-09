export type Phase = 'focus' | 'short' | 'long';
export type ThemeId = 'orbit' | 'blackhole' | 'terminal' | 'reactor';
export type ThemeFamily = 'cosmic' | 'tech';

export interface Settings {
  focusMin: number;
  shortMin: number;
  longMin: number;
  longEvery: number;          // ciclos de foco até a pausa longa
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  tickSound: boolean;
  soundOn: boolean;
  volume: number;             // 0..1
  /** camada de som ambiente contínua, própria de cada tema */
  ambience: boolean;
  ambienceVolume: number;     // 0..1
  effects: number;            // 0..1 intensidade dos efeitos
  reduceMotion: boolean;
  notifications: boolean;
  /** aviso no celular ao terminar um foco, via serviço de push */
  notifyPhone: boolean;
  notifyProvider: 'ntfy' | 'webhook';
  notifyTarget: string;
  showSeconds: boolean;
  /** modo zen: esconde os dígitos e deixa só a arte do tema */
  hideTime: boolean;
  dailyGoal: number;          // sessões de foco por dia
  theme: ThemeId;
}

export interface FocusMark {
  id: string;
  ts: number;                 // início (epoch ms)
  end: number;                // fim (epoch ms)
  minutes: number;            // minutos efetivos de foco
  phase: Phase;
  theme: ThemeId;
  task: string;
  completed: boolean;         // terminou naturalmente (não abortada)
}

export interface LogEntry {
  id: string;
  ts: number;
  kind: 'system' | 'user' | 'reward';
  text: string;
}

export interface ThemeProgress {
  xp: number;
  level: number;
  totalMinutes: number;
  sessions: number;
  unlocked: string[];         // ids de itens/coleção desbloqueados
  counter: number;            // contador livre por tema (planetas, massa, MW, uptime)
  /** estágio escolhido manualmente (1..N). 0 = sempre o mais recente desbloqueado */
  stagePick: number;
}

export interface AppState {
  /** epoch ms da última gravação — decide quem vence entre disco e navegador */
  savedAt: number;
  settings: Settings;
  marks: FocusMark[];
  logs: LogEntry[];
  notes: string;
  task: string;
  progress: Record<ThemeId, ThemeProgress>;
  streak: { count: number; lastDay: string };
  totals: { focusMinutes: number; sessions: number; startedAt: number };
}

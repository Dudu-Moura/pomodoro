import type { AppState, LogEntry, Settings, ThemeId, ThemeProgress, FocusMark } from './types';
import { loadRemote, saveRemote, saveRemoteBeacon, type SyncMode } from './sync';

const KEY = 'pomodoro-cosmos:v1';

const defaultSettings: Settings = {
  focusMin: 25,
  shortMin: 5,
  longMin: 15,
  longEvery: 4,
  autoStartBreaks: true,
  autoStartFocus: false,
  tickSound: false,
  soundOn: true,
  volume: 0.5,
  ambience: true,
  ambienceVolume: 0.55,
  effects: 0.85,
  reduceMotion: false,
  notifications: false,
  notifyPhone: false,
  notifyProvider: 'ntfy',
  notifyTarget: '',
  showSeconds: true,
  hideTime: false,
  dailyGoal: 8,
  theme: 'orbit',
};

const emptyProgress = (): ThemeProgress => ({
  xp: 0, level: 1, totalMinutes: 0, sessions: 0, unlocked: [], counter: 0, stagePick: 0,
});

export const todayKey = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const defaultState = (): AppState => ({
  savedAt: 0,
  settings: { ...defaultSettings },
  marks: [],
  logs: [],
  notes: '',
  task: '',
  progress: {
    orbit: emptyProgress(),
    blackhole: emptyProgress(),
    terminal: emptyProgress(),
    reactor: emptyProgress(),
  },
  streak: { count: 0, lastDay: '' },
  totals: { focusMinutes: 0, sessions: 0, startedAt: Date.now() },
});

type Listener = (s: AppState) => void;

class Store {
  state: AppState;
  /** onde o progresso está sendo guardado de fato */
  mode: SyncMode = 'navegador';
  private listeners = new Set<Listener>();
  private saveTimer: number | undefined;

  constructor() {
    this.state = this.load();
  }

  /** Completa um estado salvo (possivelmente antigo ou parcial) com os padrões. */
  private normalize(saved: Partial<AppState>): AppState {
    const base = defaultState();
    return {
      ...base,
      ...saved,
      // um carimbo no futuro (relógio errado, arquivo adulterado) venceria a
      // reconciliação para sempre e deixaria o usuário sem saída: limita a agora
      savedAt: Math.min(saved.savedAt ?? 0, Date.now()),
      settings: { ...base.settings, ...(saved.settings ?? {}) },
      progress: Object.fromEntries(
        (Object.keys(base.progress) as ThemeId[]).map((k) => [k, { ...base.progress[k], ...(saved.progress?.[k] ?? {}) }]),
      ) as AppState['progress'],
      streak: { ...base.streak, ...(saved.streak ?? {}) },
      totals: { ...base.totals, ...(saved.totals ?? {}) },
      marks: saved.marks ?? [],
      logs: saved.logs ?? [],
    };
  }

  private load(): AppState {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultState();
      return this.normalize(JSON.parse(raw) as Partial<AppState>);
    } catch {
      return defaultState();
    }
  }

  /**
   * Reconcilia o navegador com o arquivo em disco antes da UI subir.
   * Vence o lado com gravação mais recente; se o arquivo não existe ainda,
   * o que estava no navegador é migrado para ele.
   */
  async hydrate(): Promise<SyncMode> {
    const remote = await loadRemote();
    if (!remote) {
      const ok = await saveRemote({ ...this.state, savedAt: Date.now() });
      this.mode = ok ? 'disco' : 'navegador';
      return this.mode;
    }
    const incoming = this.normalize(remote);
    if (incoming.savedAt >= this.state.savedAt) {
      this.state = incoming;
      try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* ignora */ }
    } else {
      await saveRemote({ ...this.state, savedAt: Date.now() });
    }
    this.mode = 'disco';
    return this.mode;
  }

  /** O disco ficou mais novo que esta aba? (outra aba/janela gravou por cima) */
  async remoteIsNewer(): Promise<boolean> {
    if (this.mode !== 'disco') return false;
    const remote = await loadRemote();
    return Boolean(remote && (remote.savedAt ?? 0) > this.state.savedAt);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(): void {
    for (const fn of this.listeners) fn(this.state);
    this.persist();
  }

  private persist(): void {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.state.savedAt = Date.now();
      try {
        localStorage.setItem(KEY, JSON.stringify(this.state));
      } catch { /* quota cheia: segue sem persistir */ }
      if (this.mode === 'disco') void saveRemote(this.state);
    }, 250);
  }

  /** Gravação imediata — ao fechar a aba ou antes de exportar. */
  flush(): void {
    window.clearTimeout(this.saveTimer);
    this.state.savedAt = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* ignora */ }
    if (this.mode === 'disco') saveRemoteBeacon(this.state);
  }

  setSettings(patch: Partial<Settings>): void {
    this.state.settings = { ...this.state.settings, ...patch };
    this.emit();
  }

  get theme(): ThemeId { return this.state.settings.theme; }
  get themeProgress(): ThemeProgress { return this.state.progress[this.theme]; }

  /**
   * Estágio efetivamente em uso: o escolhido à mão, se ainda desbloqueado,
   * senão o mais avançado que a progressão liberou.
   */
  activeLevel(themeId: ThemeId = this.theme): number {
    const p = this.state.progress[themeId];
    if (!p) return 1;
    const max = Math.max(1, p.level);
    const pick = p.stagePick ?? 0;
    return pick >= 1 && pick <= max ? pick : max;
  }

  /** 0 volta para o modo automático (sempre o estágio mais recente). */
  pickStage(level: number): void {
    const p = this.themeProgress;
    p.stagePick = level >= 1 && level <= p.level ? level : 0;
    this.emit();
  }

  log(text: string, kind: LogEntry['kind'] = 'system'): LogEntry {
    const entry: LogEntry = { id: crypto.randomUUID(), ts: Date.now(), kind, text };
    this.state.logs.unshift(entry);
    if (this.state.logs.length > 400) this.state.logs.length = 400;
    this.emit();
    return entry;
  }

  addMark(mark: FocusMark): void {
    this.state.marks.unshift(mark);
    if (this.state.marks.length > 1000) this.state.marks.length = 1000;
    this.emit();
  }

  touchStreak(): boolean {
    const day = todayKey();
    const s = this.state.streak;
    if (s.lastDay === day) return false;
    const yesterday = todayKey(new Date(Date.now() - 86_400_000));
    s.count = s.lastDay === yesterday ? s.count + 1 : 1;
    s.lastDay = day;
    this.emit();
    return true;
  }

  marksToday(): FocusMark[] {
    const day = todayKey();
    return this.state.marks.filter((m) => m.phase === 'focus' && todayKey(new Date(m.ts)) === day);
  }

  reset(): void {
    this.state = defaultState();
    this.flush();
    this.emit();
  }

  /**
   * Zera só o que é conquista: progressão dos temas, totais, sequência e marcas.
   * Preserva anotações, registro e configurações.
   */
  resetProgress(): void {
    this.state.progress = {
      orbit: emptyProgress(),
      blackhole: emptyProgress(),
      terminal: emptyProgress(),
      reactor: emptyProgress(),
    };
    this.state.totals = { focusMinutes: 0, sessions: 0, startedAt: Date.now() };
    this.state.streak = { count: 0, lastDay: '' };
    this.state.marks = [];
    this.flush();
    this.emit();
  }
}

export const store = new Store();

import { store } from './store';
import type { Phase } from './types';

export type TimerEvent =
  | { type: 'start'; phase: Phase }
  | { type: 'pause'; phase: Phase }
  | { type: 'resume'; phase: Phase }
  | { type: 'reset'; phase: Phase }
  | { type: 'tick'; remaining: number }
  | { type: 'complete'; phase: Phase; minutes: number }
  | { type: 'skip'; phase: Phase }
  | { type: 'phase'; phase: Phase };

type Handler = (e: TimerEvent) => void;

export class PomodoroTimer {
  phase: Phase = 'focus';
  running = false;
  /** ms restantes na fase atual */
  remaining = 0;
  /** total da fase em ms */
  total = 0;
  cycle = 0;                   // focos concluídos no ciclo atual
  private endAt = 0;
  private ticker: number | undefined;
  private lastWholeSecond = -1;
  private startedAt = 0;
  private accumulated = 0;     // ms efetivamente decorridos nesta fase
  private handlers = new Set<Handler>();

  constructor() {
    this.total = this.durationOf('focus');
    this.remaining = this.total;
  }

  on(fn: Handler): () => void {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }

  private fire(e: TimerEvent): void {
    for (const h of this.handlers) h(e);
  }

  durationOf(phase: Phase): number {
    const s = store.state.settings;
    const min = phase === 'focus' ? s.focusMin : phase === 'short' ? s.shortMin : s.longMin;
    return Math.max(1, Math.round(min * 60)) * 1000;
  }

  get progress(): number {
    if (this.total <= 0) return 0;
    return Math.min(1, Math.max(0, 1 - this.remaining / this.total));
  }

  /** minutos efetivamente focados na fase corrente */
  get elapsedMinutes(): number {
    return (this.accumulated + (this.running ? Date.now() - this.startedAt : 0)) / 60000;
  }

  start(): void {
    if (this.running) return;
    const resuming = this.remaining < this.total;
    this.running = true;
    this.startedAt = Date.now();
    this.endAt = Date.now() + this.remaining;
    this.fire(resuming ? { type: 'resume', phase: this.phase } : { type: 'start', phase: this.phase });
    window.clearInterval(this.ticker);
    // intervalo em vez de rAF: abas em segundo plano congelam o rAF e a fase
    // nunca terminaria. O tempo restante vem sempre do relógio, não da contagem.
    this.ticker = window.setInterval(this.loop, 200);
    this.loop();
  }

  pause(): void {
    if (!this.running) return;
    this.accumulated += Date.now() - this.startedAt;
    this.running = false;
    window.clearInterval(this.ticker);
    this.fire({ type: 'pause', phase: this.phase });
  }

  toggle(): void {
    this.running ? this.pause() : this.start();
  }

  reset(): void {
    window.clearInterval(this.ticker);
    this.running = false;
    this.accumulated = 0;
    this.total = this.durationOf(this.phase);
    this.remaining = this.total;
    this.lastWholeSecond = -1;
    this.fire({ type: 'reset', phase: this.phase });
  }

  /** troca de fase sem contar como conclusão */
  skip(): void {
    const from = this.phase;
    this.fire({ type: 'skip', phase: from });
    this.advance(false);
  }

  setPhase(phase: Phase): void {
    window.clearInterval(this.ticker);
    this.running = false;
    this.phase = phase;
    this.accumulated = 0;
    this.total = this.durationOf(phase);
    this.remaining = this.total;
    this.lastWholeSecond = -1;
    this.fire({ type: 'phase', phase });
  }

  /** re-sincroniza durações quando as configs mudam com o timer parado */
  syncDurations(): void {
    if (this.running) return;
    const fresh = this.durationOf(this.phase);
    if (this.remaining === this.total) this.remaining = fresh;
    this.total = fresh;
    this.remaining = Math.min(this.remaining, fresh);
  }

  private nextPhase(): Phase {
    if (this.phase !== 'focus') return 'focus';
    const every = Math.max(1, store.state.settings.longEvery);
    return this.cycle % every === 0 ? 'long' : 'short';
  }

  private advance(completed: boolean): void {
    const finished = this.phase;
    const minutes = this.elapsedMinutes;
    if (completed && finished === 'focus') this.cycle += 1;
    const next = this.nextPhase();
    if (completed) this.fire({ type: 'complete', phase: finished, minutes });
    this.setPhase(next);

    const s = store.state.settings;
    const auto = next === 'focus' ? s.autoStartFocus : s.autoStartBreaks;
    if (auto) window.setTimeout(() => this.start(), 900);
  }

  private loop = (): void => {
    if (!this.running) return;
    this.remaining = Math.max(0, this.endAt - Date.now());

    const sec = Math.ceil(this.remaining / 1000);
    if (sec !== this.lastWholeSecond) {
      this.lastWholeSecond = sec;
      this.fire({ type: 'tick', remaining: this.remaining });
    }

    if (this.remaining <= 0) {
      this.accumulated += Date.now() - this.startedAt;
      this.running = false;
      window.clearInterval(this.ticker);
      this.advance(true);
    }
  };

  /** Reavalia imediatamente — usado ao voltar para a aba. */
  sync(): void {
    if (this.running) this.loop();
  }
}

export const timer = new PomodoroTimer();

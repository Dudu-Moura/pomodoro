import type { Phase, ThemeFamily, ThemeId, ThemeProgress } from '../core/types';

export interface RenderCtx {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  t: number;            // segundos desde o início da cena
  dt: number;           // delta em segundos
  progress: number;     // 0..1 da fase atual
  phase: Phase;
  running: boolean;
  intensity: number;    // 0..1 (config de efeitos)
  reduceMotion: boolean;
  level: number;        // nível de progressão do tema (afeta o visual)
  counter: number;      // contador do tema (planetas, massa, MW...)
  burst: number;        // 0..1 decai após eventos (conclusão/colapso)
  overload: number;     // 0..1 nos 10% finais da fase
}

export type SceneEvent = 'start' | 'pause' | 'resume' | 'reset' | 'complete' | 'skip' | 'tick' | 'levelup';

export interface Scene {
  background(rc: RenderCtx): void;
  stage(rc: RenderCtx): void;
  event(e: SceneEvent, rc: RenderCtx): void;
}

export interface Tier {
  id: string;
  name: string;
  at: number;           // valor de `counter` necessário
  desc: string;
  icon: string;
}

export interface HudItem {
  label: string;
  value: string;
}

export interface ProgressionView {
  title: string;         // nome do recurso (ex.: "Sistema Kepler-9")
  headline: string;      // valor grande
  sub: string;           // legenda
  barPct: number;        // 0..100 progresso até o próximo tier
  barLabel: string;
  stats: HudItem[];
  collection: { id: string; name: string; icon: string; desc: string; unlocked: boolean }[];
}

export interface Progression {
  /** rótulo da moeda/recurso do tema */
  unit: string;
  tiers: Tier[];
  /** ganho de `counter` por minuto de foco */
  gain(minutes: number, phase: Phase): number;
  view(p: ThemeProgress): ProgressionView;
  /** mensagem exibida no log ao concluir um foco */
  completionMessage(p: ThemeProgress, minutes: number): string;
}

export interface ThemeModule {
  id: ThemeId;
  name: string;
  family: ThemeFamily;
  tagline: string;
  swatch: [string, string, string];
  vars: Record<string, string>;
  createScene(): Scene;
  sounds: {
    start(): void;
    pause(): void;
    complete(phase: Phase): void;
    tick(): void;
    levelup(): void;
    ui(): void;
    warn(): void;
  };
  progression: Progression;
  /** rótulos de UI específicos do tema */
  labels: {
    focus: string;
    short: string;
    long: string;
    start: string;
    pause: string;
    resume: string;
    reset: string;
    skip: string;
    notes: string;
    log: string;
  };
}

export const clamp = (v: number, a = 0, b = 1): number => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const TAU = Math.PI * 2;

/** PRNG determinístico para gerar corpos/estrelas estáveis entre frames. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

import { getTheme } from '../themes';
import type { RenderCtx, Scene, SceneEvent } from '../themes/types';
import { store } from '../core/store';
import { timer } from '../core/timer';
import type { ThemeId } from '../core/types';

interface Surface { el: HTMLCanvasElement; ctx: CanvasRenderingContext2D; w: number; h: number; }

const surface = (el: HTMLCanvasElement): Surface => {
  const ctx = el.getContext('2d');
  if (!ctx) throw new Error('canvas 2d indisponível');
  return { el, ctx, w: 0, h: 0 };
};

export class Renderer {
  private bg: Surface;
  private stage: Surface;
  private scene: Scene;
  private themeId: ThemeId;
  private t = 0;
  private last = performance.now();
  private burst = 0;
  private raf = 0;

  constructor(bgEl: HTMLCanvasElement, stageEl: HTMLCanvasElement) {
    this.bg = surface(bgEl);
    this.stage = surface(stageEl);
    this.themeId = store.theme;
    this.scene = getTheme(this.themeId).createScene();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(stageEl.parentElement ?? stageEl);
  }

  setTheme(id: ThemeId): void {
    this.themeId = id;
    this.scene = getTheme(id).createScene();
    this.resize();
  }

  event(e: SceneEvent): void {
    if (e === 'complete') this.burst = 1;
    this.scene.event(e, this.ctxFor(this.stage));
  }

  private fit(s: Surface): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = s.el.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    s.el.width = Math.round(w * dpr);
    s.el.height = Math.round(h * dpr);
    s.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    s.w = w; s.h = h;
  }

  resize(): void {
    this.fit(this.bg);
    this.fit(this.stage);
  }

  private ctxFor(s: Surface): RenderCtx {
    const st = store.state;
    const p = st.progress[this.themeId];
    const progress = timer.progress;
    return {
      ctx: s.ctx, w: s.w, h: s.h,
      t: this.t, dt: 0,
      progress,
      phase: timer.phase,
      running: timer.running,
      intensity: st.settings.effects,
      reduceMotion: st.settings.reduceMotion,
      level: p.level,
      counter: p.counter,
      burst: this.burst,
      overload: progress > 0.9 ? (progress - 0.9) / 0.1 : 0,
    };
  }

  start(): void {
    const loop = (now: number): void => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.t += dt;
      this.burst = Math.max(0, this.burst - dt * 0.6);

      const base = this.ctxFor(this.bg);
      this.bg.ctx.clearRect(0, 0, this.bg.w, this.bg.h);
      this.scene.background({ ...base, dt });

      const st = this.ctxFor(this.stage);
      // o palco é transparente sobre o fundo: precisa ser limpo a cada frame,
      // senão os brilhos se acumulam e estouram a imagem
      this.stage.ctx.clearRect(0, 0, this.stage.w, this.stage.h);
      this.scene.stage({ ...st, dt });

      this.raf = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(loop);
  }
}

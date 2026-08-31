import type { ThemeModule, Scene, RenderCtx, SceneEvent, Tier } from './types';
import { TAU, clamp, lerp, mulberry32 } from './types';
import { audio } from '../core/audio';

const GENS: Tier[] = [
  { id: 'proto', name: 'Protótipo Mk-0', at: 0, desc: 'Bancada improvisada. Faísca instável.', icon: '▽' },
  { id: 'mk2', name: 'Reator Mk-II', at: 400, desc: 'Contenção fechada e refrigeração básica.', icon: '◇' },
  { id: 'mk3', name: 'Reator Mk-III', at: 1800, desc: 'Bobinas duplas, saída estável em rede.', icon: '◈' },
  { id: 'ares', name: 'Núcleo ARES-9', at: 6000, desc: 'Fusão sustentada. Alimenta um setor inteiro.', icon: '⬢' },
  { id: 'sing', name: 'Motor de Singularidade', at: 20000, desc: 'Energia negativa contida. Não olhe direto.', icon: '⧫' },
];

const MODULES = [
  { id: 'coil', name: 'Bobina Primária', icon: '◉', at: 100, desc: 'Indução magnética base. Sem ela, nada gira.' },
  { id: 'cryo', name: 'Dissipador Criogênico', icon: '❄', at: 500, desc: 'Mantém o núcleo abaixo do ponto de fuga.' },
  { id: 'cap', name: 'Banco de Capacitores', icon: '⚡', at: 1500, desc: 'Armazena o pico da descarga final.' },
  { id: 'inj', name: 'Injetor de Plasma', icon: '◐', at: 3500, desc: 'Alimentação contínua de combustível.' },
  { id: 'fus', name: 'Câmara de Fusão', icon: '☢', at: 8000, desc: 'Confinamento toroidal de alta densidade.' },
  { id: 'ovr', name: 'Módulo Overdrive', icon: '⧗', at: 15000, desc: 'Ignora todos os limitadores. Por sua conta.' },
  { id: 'anti', name: 'Célula de Antimatéria', icon: '✵', at: 30000, desc: 'Um grama vale uma cidade.' },
  { id: 'sing', name: 'Contenção de Singularidade', icon: '⧫', at: 60000, desc: 'O reator agora dobra o espaço ao redor.' },
];

interface Spark { x: number; y: number; vx: number; vy: number; life: number; }

class ReactorScene implements Scene {
  private sparks: Spark[] = [];
  private motes: { x: number; y: number; v: number; s: number }[] = [];
  private overloadT = 0;
  private shake = 0;
  private arcSeed = 0;
  private traces: { x: number; y: number; len: number; dir: number; ph: number }[] = [];

  background(rc: RenderCtx): void {
    const { ctx, w, h, t } = rc;
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#0b0416');
    g.addColorStop(0.5, '#12061f');
    g.addColorStop(1, '#05020c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    if (!this.traces.length) {
      const rnd = mulberry32(5150);
      this.traces = Array.from({ length: 26 }, () => ({
        x: rnd() * w, y: rnd() * h, len: 40 + rnd() * 180, dir: rnd() > 0.5 ? 0 : 1, ph: rnd() * 10,
      }));
      this.motes = Array.from({ length: 70 }, () => ({ x: rnd() * w, y: rnd() * h, v: 8 + rnd() * 32, s: 0.6 + rnd() * 2 }));
    }

    // grade em perspectiva
    ctx.strokeStyle = `rgba(255, 45, 149, ${0.20 * rc.intensity})`;
    ctx.lineWidth = 1;
    const horizon = h * 0.62;
    for (let i = -14; i <= 14; i++) {
      ctx.beginPath();
      ctx.moveTo(w / 2 + i * 26, horizon);
      ctx.lineTo(w / 2 + i * 300, h + 60);
      ctx.stroke();
    }
    const scroll = rc.reduceMotion ? 0 : (t * 26) % 60;
    for (let i = 0; i < 16; i++) {
      const yy = horizon + Math.pow(i + scroll / 60, 2.1) * 3.2;
      if (yy > h + 20) break;
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(w, yy); ctx.stroke();
    }

    // trilhas de circuito piscando
    for (const tr of this.traces) {
      const pulse = 0.15 + 0.55 * Math.abs(Math.sin(t * 0.8 + tr.ph));
      ctx.strokeStyle = `rgba(0, 240, 255, ${pulse * 0.45 * rc.intensity})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(tr.x, tr.y);
      if (tr.dir === 0) { ctx.lineTo(tr.x + tr.len, tr.y); ctx.lineTo(tr.x + tr.len + 30, tr.y + 30); }
      else { ctx.lineTo(tr.x, tr.y + tr.len); ctx.lineTo(tr.x + 30, tr.y + tr.len + 30); }
      ctx.stroke();
    }

    // partículas subindo
    for (const m of this.motes) {
      if (!rc.reduceMotion) { m.y -= m.v * rc.dt * (0.4 + rc.progress * 1.4); if (m.y < -6) { m.y = h + 6; m.x = Math.random() * w; } }
      ctx.fillStyle = `rgba(0, 240, 255, ${0.35 * rc.intensity})`;
      ctx.fillRect(m.x, m.y, m.s, m.s * 3);
    }

    // névoa neon reagindo ao progresso
    const haze = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.6);
    const hot = rc.overload;
    haze.addColorStop(0, `rgba(${255},${lerp(45, 200, hot)},${lerp(149, 60, hot)},${(0.10 + rc.progress * 0.16) * rc.intensity})`);
    haze.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, w, h);

    if (this.overloadT > 0) {
      ctx.fillStyle = `rgba(255, 200, 60, ${this.overloadT * 0.22})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  private hex(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot: number): void {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = rot + (i / 6) * TAU;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  private bolt(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, amp: number): void {
    const seg = 7;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    for (let i = 1; i < seg; i++) {
      const p = i / seg;
      const nx = lerp(x1, x2, p) + (Math.random() - 0.5) * amp;
      const ny = lerp(y1, y2, p) + (Math.random() - 0.5) * amp;
      ctx.lineTo(nx, ny);
    }
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  stage(rc: RenderCtx): void {
    const { ctx, w, h, t, progress } = rc;
    this.overloadT = Math.max(0, this.overloadT - rc.dt * 0.7);
    this.shake = Math.max(0, this.shake - rc.dt * 1.8);
    this.arcSeed += rc.dt;

    const jit = this.shake * 10 * rc.intensity + (rc.overload > 0 ? rc.overload * 2 : 0);
    const cx = w / 2 + (Math.random() - 0.5) * jit;
    const cy = h / 2 + (Math.random() - 0.5) * jit;
    const R = Math.min(w, h) / 2;
    const charge = clamp(progress + this.overloadT * 0.4);
    const isFocus = rc.phase === 'focus';
    const hot = rc.overload;
    const mainCol = this.overloadT > 0 ? '255,210,80' : isFocus ? `255,${lerp(45, 190, hot)},${lerp(149, 70, hot)}` : '0,240,255';

    // módulos construídos = anéis externos
    const built = MODULES.filter((m) => rc.counter >= m.at).length;
    for (let i = 0; i < built; i++) {
      const rr = R * (0.94 - i * 0.055);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rc.reduceMotion ? 0 : t * (i % 2 === 0 ? 0.18 : -0.13));
      ctx.strokeStyle = `rgba(0,240,255,${0.18 + 0.22 * (i / Math.max(1, built))})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([R * 0.12, R * 0.06]);
      ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // contenção hexagonal
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rc.reduceMotion ? 0 : t * 0.22 * (rc.running ? 1 : 0.2));
    ctx.strokeStyle = `rgba(${mainCol},${0.5 + charge * 0.5})`;
    ctx.lineWidth = 3;
    ctx.shadowBlur = 26 * rc.intensity;
    ctx.shadowColor = `rgba(${mainCol},0.9)`;
    this.hex(ctx, 0, 0, R * 0.72, 0); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(0,240,255,0.35)`;
    ctx.lineWidth = 1.5;
    this.hex(ctx, 0, 0, R * 0.6, Math.PI / 6); ctx.stroke();
    ctx.restore();

    // bobinas carregando em sequência
    const coils = 6;
    for (let i = 0; i < coils; i++) {
      const a = (i / coils) * TAU - Math.PI / 2;
      const x = cx + Math.cos(a) * R * 0.66, y = cy + Math.sin(a) * R * 0.66;
      const on = charge * coils >= i + 0.15;
      const lvl = clamp(charge * coils - i);
      ctx.fillStyle = on ? `rgba(${mainCol},${0.35 + lvl * 0.6})` : 'rgba(80,90,120,0.35)';
      ctx.shadowBlur = on ? 18 * rc.intensity * lvl : 0;
      ctx.shadowColor = `rgba(${mainCol},1)`;
      ctx.beginPath(); ctx.arc(x, y, 6 + lvl * 4, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;

      if (on && !rc.reduceMotion && Math.random() < 0.25 * rc.intensity * (0.3 + charge)) {
        ctx.strokeStyle = `rgba(${mainCol},${0.35 + lvl * 0.5})`;
        ctx.lineWidth = 1.2;
        this.bolt(ctx, x, y, cx, cy, 14 * charge + 4);
      }
    }

    // núcleo
    const coreR = R * (0.2 + charge * 0.16);
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    cg.addColorStop(0, '#ffffff');
    cg.addColorStop(0.35, `rgba(${mainCol},1)`);
    cg.addColorStop(1, `rgba(${mainCol},0)`);
    ctx.fillStyle = cg;
    ctx.shadowBlur = (30 + charge * 70) * rc.intensity;
    ctx.shadowColor = `rgba(${mainCol},1)`;
    ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;

    // medidor circular de energia
    const gaugeR = R * 0.86;
    ctx.strokeStyle = 'rgba(120,140,190,0.22)';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(cx, cy, gaugeR, 0, TAU); ctx.stroke();
    ctx.strokeStyle = `rgba(${mainCol},0.95)`;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.shadowBlur = 20 * rc.intensity;
    ctx.shadowColor = `rgba(${mainCol},1)`;
    ctx.beginPath(); ctx.arc(cx, cy, gaugeR, -Math.PI / 2, -Math.PI / 2 + progress * TAU); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineCap = 'butt';

    // aviso de sobrecarga
    if (hot > 0.02 && isFocus) {
      ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.textAlign = 'center';
      const blink = Math.floor(t * 6) % 2 === 0;
      ctx.fillStyle = blink ? `rgba(255,210,80,${0.5 + hot * 0.5})` : 'rgba(255,120,60,0.5)';
      ctx.fillText('⚠ SOBRECARGA IMINENTE', cx, cy + R * 0.98);
      ctx.textAlign = 'left';
    }

    // faíscas da descarga
    for (const s of this.sparks) {
      s.x += s.vx * rc.dt; s.y += s.vy * rc.dt; s.vy += 140 * rc.dt; s.life -= rc.dt * 0.9;
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
    for (const s of this.sparks) {
      ctx.fillStyle = `rgba(255,${200 + Math.random() * 55},120,${clamp(s.life)})`;
      ctx.fillRect(s.x, s.y, 2.5, 2.5);
    }

    if (this.overloadT > 0.02) {
      for (let i = 0; i < 5; i++) {
        const a = Math.random() * TAU;
        ctx.strokeStyle = `rgba(255,230,140,${this.overloadT * 0.8})`;
        ctx.lineWidth = 1.5 + Math.random() * 2;
        this.bolt(ctx, cx, cy, cx + Math.cos(a) * R, cy + Math.sin(a) * R, 26);
      }
      const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.5);
      fg.addColorStop(0, `rgba(255,255,255,${this.overloadT * 0.7})`);
      fg.addColorStop(1, 'rgba(255,180,60,0)');
      ctx.fillStyle = fg;
      ctx.fillRect(0, 0, w, h);
    }
  }

  event(e: SceneEvent, rc: RenderCtx): void {
    if (e === 'complete') {
      this.overloadT = 1;
      this.shake = 1;
      const cx = rc.w / 2, cy = rc.h / 2;
      for (let i = 0; i < 90; i++) {
        const a = Math.random() * TAU, sp = 60 + Math.random() * 320;
        this.sparks.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.6 + Math.random() });
      }
    }
    if (e === 'reset') { this.sparks.length = 0; this.overloadT = 0; }
  }
}

const curGen = (c: number): Tier => [...GENS].reverse().find((g) => c >= g.at) ?? GENS[0];
const nextGen = (c: number): Tier => GENS.find((g) => g.at > c) ?? GENS[GENS.length - 1];
const fmtMW = (v: number): string => (v >= 1000 ? `${(v / 1000).toFixed(2)} GW` : `${v.toFixed(0)} MW`);

export const reactorTheme: ThemeModule = {
  id: 'reactor',
  name: 'Reator Neon',
  family: 'tech',
  tagline: 'Gera energia enquanto você foca. No fim, sobrecarrega.',
  swatch: ['#0b0416', '#ff2d95', '#00f0ff'],
  vars: {
    '--bg': '#05020c',
    '--bg-soft': '#12061f',
    '--panel': 'rgba(26, 6, 44, 0.55)',
    '--panel-solid': '#160829',
    '--border': 'rgba(0, 240, 255, 0.3)',
    '--border-strong': 'rgba(255, 45, 149, 0.65)',
    '--text': '#f2e9ff',
    '--text-dim': '#9d7fc0',
    '--accent': '#ff2d95',
    '--accent-2': '#00f0ff',
    '--accent-ink': '#12001f',
    '--glow': 'rgba(255, 45, 149, 0.6)',
    '--danger': '#ffb020',
    '--ok': '#00f0ff',
    '--font-ui': "'Rajdhani', 'Inter', system-ui, sans-serif",
    '--font-mono': "ui-monospace, 'SF Mono', monospace",
    '--font-display': "'Rajdhani', 'Inter', sans-serif",
    '--radius': '2px',
    '--radius-card': '2px',
    '--radius-sm': '2px',
    '--letter': '0.14em',
    '--panel-blur': '10px',
    '--ui-transform': 'uppercase',
  },
  createScene: () => new ReactorScene(),
  sounds: {
    start() {
      audio.tone({ freq: 60, glideTo: 180, type: 'sawtooth', dur: 1.4, gain: 0.16, filter: { type: 'lowpass', freq: 1200, q: 8 } });
      audio.tone({ freq: 880, glideTo: 1320, type: 'square', dur: 0.5, gain: 0.06 });
    },
    pause() { audio.tone({ freq: 300, glideTo: 60, type: 'sawtooth', dur: 0.6, gain: 0.14, filter: { type: 'lowpass', freq: 800 } }); },
    complete(phase) {
      if (phase === 'focus') {
        audio.noise({ dur: 1.2, gain: 0.2, type: 'bandpass', freq: 4000, sweepTo: 200, q: 0.7 });
        audio.tone({ freq: 1600, glideTo: 60, type: 'sawtooth', dur: 1.4, gain: 0.18, filter: { type: 'lowpass', freq: 2400, q: 5 } });
        audio.rumble(1.8, 0.2);
        audio.chord([220, 277.18, 329.63], { type: 'square', dur: 0.5, gain: 0.07, delay: 1.1 });
      } else {
        audio.tone({ freq: 440, glideTo: 660, type: 'square', dur: 0.35, gain: 0.1 });
      }
    },
    tick() { audio.tone({ freq: 2200, type: 'square', dur: 0.012, gain: 0.02 }); },
    levelup() {
      audio.tone({ freq: 110, glideTo: 880, type: 'sawtooth', dur: 1.6, gain: 0.15, filter: { type: 'lowpass', freq: 3000, q: 10 } });
      audio.chord([523.25, 698.46, 880, 1174.66], { type: 'square', dur: 0.9, gain: 0.09, delay: 0.5 });
    },
    ui() { audio.tone({ freq: 1200, glideTo: 1800, type: 'square', dur: 0.03, gain: 0.05 }); },
    warn() {
      audio.tone({ freq: 740, type: 'square', dur: 0.14, gain: 0.1 });
      audio.tone({ freq: 740, type: 'square', dur: 0.14, gain: 0.1, delay: 0.2 });
    },
  },
  progression: {
    unit: 'MW',
    tiers: GENS,
    gain: (minutes, phase) => (phase === 'focus' ? minutes * 10 : minutes * 2),
    view(p) {
      const c = curGen(p.counter), n = nextGen(p.counter);
      const span = Math.max(1, n.at - c.at);
      const pct = n.at > p.counter ? clamp((p.counter - c.at) / span) * 100 : 100;
      return {
        title: c.name,
        headline: fmtMW(p.counter),
        sub: `energia gerada · nível ${p.level}`,
        barPct: pct,
        barLabel: n.at > p.counter ? `${fmtMW(n.at - p.counter)} até ${n.name}` : 'saída máxima atingida',
        stats: [
          { label: 'Descargas', value: `${p.sessions}` },
          { label: 'Módulos', value: `${MODULES.filter((m) => p.counter >= m.at).length}/${MODULES.length}` },
          { label: 'Runtime', value: `${Math.round(p.totalMinutes)} min` },
        ],
        collection: MODULES.map((m) => ({
          id: m.id, name: m.name, icon: m.icon, desc: m.desc, unlocked: p.counter >= m.at,
        })),
      };
    },
    completionMessage(p, minutes) {
      return `Descarga concluída: +${fmtMW(minutes * 10)} em ${minutes.toFixed(0)} min. Reator: ${curGen(p.counter).name}.`;
    },
  },
  labels: {
    focus: 'Carga', short: 'Resfriar', long: 'Manutenção',
    start: 'Ligar reator', pause: 'Conter', resume: 'Religar',
    reset: 'Purgar', skip: 'Próxima fase', notes: 'Bloco técnico', log: 'Console',
  },
};

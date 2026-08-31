import type { ThemeModule, Scene, RenderCtx, SceneEvent, Tier } from './types';
import { TAU, clamp, lerp, mulberry32 } from './types';
import { audio } from '../core/audio';
import type { ThemeProgress } from '../core/types';

const SYSTEMS: Tier[] = [
  { id: 'sol', name: 'Sistema Solar', at: 0, desc: 'Onde tudo começa. Uma estrela amarela e muita paciência.', icon: '☉' },
  { id: 'alpha', name: 'Alpha Centauri', at: 3, desc: 'Trinca estelar a 4,37 anos-luz. Primeira viagem real.', icon: '✦' },
  { id: 'trappist', name: 'TRAPPIST-1', at: 8, desc: 'Sete mundos rochosos ao redor de uma anã ultrafria.', icon: '❂' },
  { id: 'kepler', name: 'Kepler-90', at: 16, desc: 'Oito planetas — um espelho do nosso sistema.', icon: '✷' },
  { id: 'sirius', name: 'Sírius', at: 28, desc: 'A estrela mais brilhante do céu noturno.', icon: '✧' },
  { id: 'betel', name: 'Betelgeuse', at: 45, desc: 'Supergigante vermelha à beira da supernova.', icon: '✵' },
  { id: 'core', name: 'Núcleo Galáctico', at: 70, desc: 'Sagitário A*. Você orbitou até o centro da Via Láctea.', icon: '✶' },
];

const PLANET_TYPES = [
  { id: 'rocky', name: 'Mundo Rochoso', icon: '🜨', at: 1, desc: 'Crosta sólida, primeiro passo.', color: '#c98d5a' },
  { id: 'ocean', name: 'Mundo Oceânico', icon: '🜄', at: 2, desc: 'Superfície coberta por água líquida.', color: '#4aa9d8' },
  { id: 'gas', name: 'Gigante Gasoso', icon: '🜁', at: 5, desc: 'Tempestades maiores que continentes.', color: '#d9a566' },
  { id: 'ice', name: 'Gigante de Gelo', icon: '❄', at: 9, desc: 'Metano congelado nas camadas altas.', color: '#7fd4e0' },
  { id: 'ring', name: 'Mundo Anelado', icon: '◍', at: 14, desc: 'Anéis de poeira e gelo em ressonância.', color: '#e6c88a' },
  { id: 'lava', name: 'Mundo de Lava', icon: '🜂', at: 20, desc: 'Travado por maré, hemisfério em fusão.', color: '#e2603c' },
  { id: 'terra', name: 'Terraformado', icon: '🝆', at: 32, desc: 'Atmosfera estável. Habitável.', color: '#6fd68a' },
  { id: 'exotic', name: 'Mundo Exótico', icon: '✺', at: 50, desc: 'Química impossível. Ciência nova.', color: '#b98ce8' },
];

interface Body { r: number; a: number; speed: number; size: number; color: string; ring: boolean; }

class OrbitScene implements Scene {
  private stars: { x: number; y: number; z: number; s: number }[] = [];
  private bodies: Body[] = [];
  private trail: { x: number; y: number; life: number }[] = [];
  private flash = 0;
  private lastCounter = -1;
  private comet = { a: Math.random() * TAU, r: 0, on: 0 };

  private buildStars(w: number, h: number): void {
    const rnd = mulberry32(1337);
    const n = 260;
    this.stars = Array.from({ length: n }, () => ({
      x: rnd() * w, y: rnd() * h, z: 0.25 + rnd() * 0.75, s: 0.4 + rnd() * 1.5,
    }));
  }

  private buildBodies(counter: number): void {
    const rnd = mulberry32(9001);
    const n = Math.min(9, counter);
    this.bodies = Array.from({ length: n }, (_, i) => {
      const type = PLANET_TYPES[Math.min(PLANET_TYPES.length - 1, Math.floor(rnd() * (1 + i)))];
      return {
        r: 0.30 + i * 0.072,
        a: rnd() * TAU,
        speed: 0.20 / (0.6 + i * 0.35),
        size: 3 + rnd() * 4 + i * 0.35,
        color: type.color,
        ring: rnd() > 0.72,
      };
    });
    this.lastCounter = counter;
  }

  background(rc: RenderCtx): void {
    const { ctx, w, h, t } = rc;
    if (!this.stars.length || this.stars.length < 10) this.buildStars(w, h);

    const g = ctx.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.42, Math.max(w, h) * 0.75);
    g.addColorStop(0, '#131a3a');
    g.addColorStop(0.45, '#0a0e24');
    g.addColorStop(1, '#04050f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // nebulosa
    const neb = ctx.createRadialGradient(w * 0.78, h * 0.24, 0, w * 0.78, h * 0.24, w * 0.55);
    neb.addColorStop(0, `rgba(120,80,200,${0.16 * rc.intensity})`);
    neb.addColorStop(1, 'rgba(120,80,200,0)');
    ctx.fillStyle = neb;
    ctx.fillRect(0, 0, w, h);
    const neb2 = ctx.createRadialGradient(w * 0.18, h * 0.82, 0, w * 0.18, h * 0.82, w * 0.5);
    neb2.addColorStop(0, `rgba(220,150,70,${0.10 * rc.intensity})`);
    neb2.addColorStop(1, 'rgba(220,150,70,0)');
    ctx.fillStyle = neb2;
    ctx.fillRect(0, 0, w, h);

    const drift = rc.reduceMotion ? 0 : t * 3;
    for (const s of this.stars) {
      const x = (s.x + drift * s.z) % w;
      const tw = rc.reduceMotion ? 1 : 0.55 + 0.45 * Math.sin(t * 1.6 + s.x * 0.05);
      ctx.globalAlpha = clamp(s.z * tw, 0.05, 1) * (0.5 + rc.intensity * 0.5);
      ctx.fillStyle = '#e9eeff';
      ctx.fillRect(x, s.y, s.s, s.s);
    }
    ctx.globalAlpha = 1;

    // cometa ocasional
    if (!rc.reduceMotion && rc.intensity > 0.2) {
      this.comet.on -= rc.dt;
      if (this.comet.on <= -8) {
        this.comet.on = 2.2;
        this.comet.a = Math.random() * 0.6 - 0.3;
        this.comet.r = Math.random() * h * 0.6;
      }
      if (this.comet.on > 0) {
        const p = 1 - this.comet.on / 2.2;
        const x = -80 + p * (w + 200);
        const y = this.comet.r + p * 120;
        const grd = ctx.createLinearGradient(x - 90, y - 40, x, y);
        grd.addColorStop(0, 'rgba(255,240,200,0)');
        grd.addColorStop(1, `rgba(255,240,200,${0.7 * rc.intensity})`);
        ctx.strokeStyle = grd;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - 90, y - 40);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    }
  }

  stage(rc: RenderCtx): void {
    const { ctx, w, h, t, progress } = rc;
    const cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) / 2;
    if (this.lastCounter !== rc.counter) this.buildBodies(rc.counter);

    const isFocus = rc.phase === 'focus';
    const starPulse = rc.reduceMotion ? 1 : 1 + Math.sin(t * 1.8) * 0.03 + this.flash * 0.25;
    const starR = R * (0.10 + Math.min(0.04, rc.level * 0.006)) * starPulse;

    // coroa
    const corona = ctx.createRadialGradient(cx, cy, starR * 0.4, cx, cy, R * (isFocus ? 0.78 : 0.6));
    const warm = isFocus ? '255,196,92' : '150,190,255';
    corona.addColorStop(0, `rgba(${warm},${(0.30 + this.flash * 0.45) * rc.intensity})`);
    corona.addColorStop(0.3, `rgba(${warm},${0.09 * rc.intensity})`);
    corona.addColorStop(1, `rgba(${warm},0)`);
    ctx.fillStyle = corona;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();

    // órbitas assentadas
    for (const b of this.bodies) {
      ctx.strokeStyle = 'rgba(180,200,255,0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, R * b.r, 0, TAU); ctx.stroke();
      if (!rc.reduceMotion) b.a += b.speed * rc.dt * (rc.running ? 1 : 0.25);
      const bx = cx + Math.cos(b.a) * R * b.r;
      const by = cy + Math.sin(b.a) * R * b.r * 0.42;
      if (b.ring) {
        ctx.strokeStyle = 'rgba(230,200,140,0.55)';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.ellipse(bx, by, b.size * 2.1, b.size * 0.7, 0.5, 0, TAU); ctx.stroke();
      }
      const bg = ctx.createRadialGradient(bx - b.size * 0.3, by - b.size * 0.3, 0, bx, by, b.size);
      bg.addColorStop(0, '#ffffff');
      bg.addColorStop(0.35, b.color);
      bg.addColorStop(1, 'rgba(0,0,0,0.85)');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(bx, by, b.size, 0, TAU); ctx.fill();
    }

    // órbita ativa (a sessão em curso)
    const oR = R * 0.855;
    ctx.strokeStyle = `rgba(255,206,120,${0.20 + rc.overload * 0.5})`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 7]);
    ctx.beginPath(); ctx.ellipse(cx, cy, oR, oR * 0.42, 0, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);

    // arco percorrido
    const a0 = -Math.PI / 2;
    const a1 = a0 + progress * TAU;
    ctx.strokeStyle = isFocus ? '#ffce78' : '#8fc7ff';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 18 * rc.intensity;
    ctx.shadowColor = isFocus ? '#ffb347' : '#8fc7ff';
    ctx.beginPath(); ctx.ellipse(cx, cy, oR, oR * 0.42, 0, a0, a1); ctx.stroke();
    ctx.shadowBlur = 0;

    // planeta em formação
    const px = cx + Math.cos(a1) * oR;
    const py = cy + Math.sin(a1) * oR * 0.42;
    const grow = 4 + progress * 8;
    this.trail.push({ x: px, y: py, life: 1 });
    if (this.trail.length > 46) this.trail.shift();
    for (const p of this.trail) {
      p.life -= rc.dt * 0.85;
      if (p.life <= 0) continue;
      ctx.globalAlpha = p.life * 0.5 * rc.intensity;
      ctx.fillStyle = isFocus ? '#ffd79a' : '#a9d4ff';
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.2 * p.life, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    const pg = ctx.createRadialGradient(px - grow * 0.3, py - grow * 0.3, 0, px, py, grow);
    pg.addColorStop(0, '#fff7e0');
    pg.addColorStop(0.4, isFocus ? '#e8a04d' : '#6fa8e8');
    pg.addColorStop(1, 'rgba(20,10,0,0.9)');
    ctx.fillStyle = pg;
    ctx.shadowBlur = 22 * rc.intensity;
    ctx.shadowColor = isFocus ? '#ffb347' : '#7fb6ff';
    ctx.beginPath(); ctx.arc(px, py, grow, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;

    // estrela
    const sg = ctx.createRadialGradient(cx, cy, 0, cx, cy, starR);
    sg.addColorStop(0, '#ffffff');
    sg.addColorStop(0.4, isFocus ? '#ffd98a' : '#cfe4ff');
    sg.addColorStop(1, isFocus ? '#e8862c' : '#5a86c8');
    ctx.fillStyle = sg;
    ctx.shadowBlur = 40 * rc.intensity * starPulse;
    ctx.shadowColor = isFocus ? '#ffa53a' : '#7fb6ff';
    ctx.beginPath(); ctx.arc(cx, cy, starR, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;

    // onda de choque na conclusão
    if (this.flash > 0) {
      const rr = R * (1 - this.flash) * 1.5;
      ctx.strokeStyle = `rgba(255,220,150,${this.flash * 0.9})`;
      ctx.lineWidth = 3 + this.flash * 8;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke();
      this.flash = Math.max(0, this.flash - rc.dt * 0.8);
    }
    this.flash = lerp(this.flash, rc.burst, 0.2);
  }

  event(e: SceneEvent): void {
    if (e === 'complete') { this.flash = 1; this.trail.length = 0; this.lastCounter = -1; }
    if (e === 'reset' || e === 'skip') this.trail.length = 0;
  }
}

const nextSystem = (c: number): Tier => SYSTEMS.find((s) => s.at > c) ?? SYSTEMS[SYSTEMS.length - 1];
const currentSystem = (c: number): Tier => [...SYSTEMS].reverse().find((s) => c >= s.at) ?? SYSTEMS[0];

export const orbitTheme: ThemeModule = {
  id: 'orbit',
  name: 'Órbita Estelar',
  family: 'cosmic',
  tagline: 'Cada sessão é uma volta completa ao redor da estrela.',
  swatch: ['#0a0e24', '#ffce78', '#8fc7ff'],
  vars: {
    '--bg': '#04050f',
    '--bg-soft': '#0a0e24',
    '--panel': 'rgba(14, 20, 48, 0.55)',
    '--panel-solid': '#0c1230',
    '--border': 'rgba(160, 190, 255, 0.18)',
    '--border-strong': 'rgba(255, 206, 120, 0.45)',
    '--text': '#eef2ff',
    '--text-dim': '#9aa8d0',
    '--accent': '#ffce78',
    '--accent-2': '#8fc7ff',
    '--accent-ink': '#1a1200',
    '--glow': 'rgba(255, 206, 120, 0.55)',
    '--danger': '#ff7a6b',
    '--ok': '#7fe0a8',
    '--font-ui': "'Inter', 'Segoe UI', system-ui, sans-serif",
    '--font-mono': "'JetBrains Mono', 'SF Mono', ui-monospace, monospace",
    '--font-display': "'Inter', system-ui, sans-serif",
    '--radius': '18px',
    '--radius-card': '20px',
    '--radius-sm': '12px',
    '--letter': '0.02em',
    '--panel-blur': '14px',
    '--ui-transform': 'none',
  },
  createScene: () => new OrbitScene(),
  sounds: {
    start() {
      audio.chord([392, 523.25, 659.25], { type: 'sine', dur: 1.1, gain: 0.16, attack: 0.08 });
      audio.tone({ freq: 130.81, type: 'sine', dur: 1.6, gain: 0.12 });
    },
    pause() { audio.tone({ freq: 523.25, glideTo: 329.63, type: 'sine', dur: 0.45, gain: 0.14 }); },
    complete(phase) {
      if (phase === 'focus') {
        audio.chord([523.25, 659.25, 783.99, 1046.5], { type: 'sine', dur: 1.7, gain: 0.17, attack: 0.05 });
        audio.tone({ freq: 65.41, type: 'sine', dur: 2.2, gain: 0.14, delay: 0.05 });
        audio.noise({ dur: 1.6, gain: 0.05, type: 'highpass', freq: 1800, delay: 0.1 });
      } else {
        audio.chord([392, 493.88, 587.33], { type: 'sine', dur: 1.1, gain: 0.13 });
      }
    },
    tick() { audio.tone({ freq: 1046.5, type: 'sine', dur: 0.05, gain: 0.03 }); },
    levelup() {
      audio.chord([523.25, 659.25, 783.99, 1046.5, 1318.5], { type: 'triangle', dur: 2.0, gain: 0.15, attack: 0.06 });
    },
    ui() { audio.tone({ freq: 880, type: 'sine', dur: 0.07, gain: 0.06 }); },
    warn() { audio.tone({ freq: 220, glideTo: 180, type: 'sine', dur: 0.5, gain: 0.12 }); },
  },
  progression: {
    unit: 'planetas',
    tiers: SYSTEMS,
    gain: (_minutes, phase) => (phase === 'focus' ? 1 : 0),
    view(p: ThemeProgress) {
      const cur = currentSystem(p.counter);
      const nxt = nextSystem(p.counter);
      const span = Math.max(1, nxt.at - cur.at);
      const pct = nxt.at > p.counter ? clamp((p.counter - cur.at) / span) * 100 : 100;
      return {
        title: cur.name,
        headline: `${p.counter}`,
        sub: `planetas formados · nível ${p.level}`,
        barPct: pct,
        barLabel: nxt.at > p.counter ? `${nxt.at - p.counter} planetas até ${nxt.name}` : 'Galáxia mapeada',
        stats: [
          { label: 'Sistemas', value: `${SYSTEMS.filter((s) => p.counter >= s.at).length}/${SYSTEMS.length}` },
          { label: 'Órbitas', value: `${p.sessions}` },
          { label: 'Tempo em órbita', value: `${Math.round(p.totalMinutes)} min` },
        ],
        collection: PLANET_TYPES.map((t) => ({
          id: t.id, name: t.name, icon: t.icon, desc: t.desc, unlocked: p.counter >= t.at,
        })),
      };
    },
    completionMessage(p, minutes) {
      const type = [...PLANET_TYPES].reverse().find((t) => p.counter >= t.at) ?? PLANET_TYPES[0];
      return `Órbita completa em ${minutes.toFixed(0)} min — ${type.name} formado. Sistema: ${currentSystem(p.counter).name}.`;
    },
  },
  labels: {
    focus: 'Órbita', short: 'Afélio', long: 'Trânsito Longo',
    start: 'Iniciar órbita', pause: 'Congelar', resume: 'Retomar órbita',
    reset: 'Reiniciar', skip: 'Pular fase', notes: 'Diário de bordo', log: 'Registro de voo',
  },
};

import type { ThemeModule, Scene, RenderCtx, SceneEvent, Tier } from './types';
import { TAU, clamp, lerp, mulberry32 } from './types';
import { audio } from '../core/audio';

const STAGES: Tier[] = [
  { id: 'stellar', name: 'Buraco Negro Estelar', at: 0, desc: 'Colapso de uma estrela massiva. Alguns quilômetros de horizonte.', icon: '◍' },
  { id: 'inter', name: 'Massa Intermediária', at: 150, desc: 'Milhares de massas solares. Devora aglomerados.', icon: '◎' },
  { id: 'super', name: 'Supermassivo', at: 900, desc: 'O coração de uma galáxia inteira gira ao seu redor.', icon: '⬤' },
  { id: 'ultra', name: 'Ultramassivo', at: 4000, desc: 'Horizonte maior que o Sistema Solar.', icon: '⊙' },
  { id: 'quasar', name: 'Quasar Ativo', at: 15000, desc: 'Jatos relativísticos visíveis do outro lado do universo.', icon: '✷' },
];

const CONSUMED = [
  { id: 'ast', name: 'Asteroide', icon: '·', at: 20, desc: 'Rocha errante. Nem sentiu.' },
  { id: 'com', name: 'Cometa', icon: '☄', at: 80, desc: 'Cauda de gelo esticada até o infinito.' },
  { id: 'pla', name: 'Planeta', icon: '🜨', at: 200, desc: 'Espaguetificado em segundos de tempo próprio.' },
  { id: 'dwarf', name: 'Anã Branca', icon: '◌', at: 500, desc: 'Núcleo estelar degenerado, absorvido.' },
  { id: 'neut', name: 'Estrela de Nêutrons', icon: '◉', at: 1200, desc: 'Kilonova registrada em ondas gravitacionais.' },
  { id: 'cloud', name: 'Nuvem Molecular', icon: '☁', at: 3000, desc: 'Berçário estelar inteiro em queda livre.' },
  { id: 'comp', name: 'Estrela Companheira', icon: '✦', at: 8000, desc: 'Sistema binário canibalizado.' },
  { id: 'bh', name: 'Fusão Binária', icon: '∞', at: 20000, desc: 'Dois horizontes viram um. LIGO agradece.' },
];

/** Cada estágio de massa muda a cor do disco, o tamanho e o que aparece em cena. */
const STAGE_LOOK = [
  { hot: 390, cold: 280, ring: '255,210,150', accent: '#b07bff', a2: '#ffb877', disk: 1.00, horizon: 1.00 },
  { hot: 400, cold: 285, ring: '255,196,130', accent: '#c78fff', a2: '#ffa860', disk: 1.18, horizon: 1.16 },
  { hot: 410, cold: 300, ring: '255,180,110', accent: '#d6a0ff', a2: '#ff9040', disk: 1.38, horizon: 1.34 },
  { hot: 430, cold: 320, ring: '220,225,255', accent: '#a9c4ff', a2: '#ffd0a0', disk: 1.58, horizon: 1.52 },
  { hot: 460, cold: 350, ring: '235,250,255', accent: '#7fe8ff', a2: '#ffffff', disk: 1.80, horizon: 1.70 },
];
const look = (level: number) => STAGE_LOOK[Math.min(STAGE_LOOK.length, Math.max(1, level)) - 1];

interface P { r: number; a: number; s: number; hue: number; size: number; }
/** Corpo visível caindo no horizonte, esticado pela maré. */
interface Debris { r: number; a: number; size: number; hue: number; spin: number; kind: 0 | 1 | 2; }

class BlackHoleScene implements Scene {
  private ps: P[] = [];
  private debris: Debris[] = [];
  private eaten: { a: number; life: number }[] = [];
  private stars: { x: number; y: number; s: number }[] = [];
  private collapse = 0;
  private flash = 0;
  private shake = 0;

  private init(R: number): void {
    const rnd = mulberry32(4242);
    this.ps = Array.from({ length: 320 }, () => ({
      r: R * (0.25 + rnd() * 0.95),
      a: rnd() * TAU,
      s: 0.6 + rnd() * 0.8,
      hue: 250 + rnd() * 60,
      size: 0.7 + rnd() * 1.9,
    }));
    this.debris = Array.from({ length: 7 }, (_, i) => this.spawnDebris(R, rnd, i / 7));
  }

  private spawnDebris(R: number, rnd: () => number, phase = rnd()): Debris {
    return {
      r: R * (0.75 + phase * 0.75),
      a: rnd() * TAU,
      size: 2.2 + rnd() * 5,
      hue: [35, 190, 55][Math.floor(rnd() * 3)],
      spin: (0.5 + rnd()) * (rnd() > 0.5 ? 1 : -1),
      kind: Math.floor(rnd() * 3) as 0 | 1 | 2,
    };
  }

  background(rc: RenderCtx): void {
    const { ctx, w, h, t } = rc;
    if (!this.stars.length) {
      const rnd = mulberry32(77);
      this.stars = Array.from({ length: 200 }, () => ({ x: rnd() * w, y: rnd() * h, s: 0.4 + rnd() * 1.4 }));
    }
    ctx.fillStyle = '#020104';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2, cy = h / 2;
    const pull = 0.25 + rc.progress * 0.8 + this.collapse * 2;

    for (const s of this.stars) {
      const dx = s.x - cx, dy = s.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      const warp = clamp(1 - d / (Math.max(w, h) * 0.7)) * pull;
      const x = s.x - (dx / d) * warp * 60;
      const y = s.y - (dy / d) * warp * 60;
      const len = warp * 26 * rc.intensity;
      ctx.strokeStyle = `rgba(200,215,255,${clamp(0.25 + warp * 0.6, 0, 0.9)})`;
      ctx.lineWidth = s.s * 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - (dx / d) * len, y - (dy / d) * len);
      ctx.stroke();
    }

    // halo violeta pulsante
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.55);
    const beat = rc.reduceMotion ? 0.5 : 0.5 + Math.sin(t * 0.9) * 0.12;
    halo.addColorStop(0, `rgba(90,40,160,${(0.22 + rc.progress * 0.22) * beat * rc.intensity})`);
    halo.addColorStop(0.5, `rgba(40,15,80,${0.12 * rc.intensity})`);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);

    // vinheta que fecha conforme o tempo passa
    const vig = ctx.createRadialGradient(cx, cy, Math.min(w, h) * (0.55 - rc.progress * 0.28), cx, cy, Math.max(w, h) * 0.8);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, `rgba(0,0,0,${0.55 + rc.progress * 0.35})`);
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }

  stage(rc: RenderCtx): void {
    const { ctx, w, h, t, progress } = rc;
    const R = Math.min(w, h) / 2;
    if (!this.ps.length) this.init(R);

    this.collapse = Math.max(0, this.collapse - rc.dt * 0.55);
    this.flash = Math.max(0, this.flash - rc.dt * 1.6);
    this.shake = Math.max(0, this.shake - rc.dt * 2.2);

    const jitter = this.shake * 9 * rc.intensity;
    const cx = w / 2 + (Math.random() - 0.5) * jitter;
    const cy = h / 2 + (Math.random() - 0.5) * jitter;

    const L = look(rc.level);
    const horizon = R * (0.13 * L.horizon + progress * 0.14 + this.collapse * 0.35);

    // disco de acreção
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rc.reduceMotion ? 0.5 : t * 0.12);
    ctx.scale(1, 0.34);
    const rings = 26;
    for (let i = rings; i > 0; i--) {
      const rr = horizon * 1.15 + (i / rings) * R * 0.85 * (0.85 + L.disk * 0.18);
      const heat = 1 - i / rings;
      const alpha = (0.05 + heat * 0.20) * (0.75 + progress * 0.75) * rc.intensity * (0.8 + L.disk * 0.25);
      ctx.strokeStyle = `hsla(${lerp(L.cold, L.hot, heat)}, 95%, ${lerp(45, 72 + (L.disk - 1) * 12, heat)}%, ${alpha + this.flash * 0.3})`;
      ctx.lineWidth = (2 + heat * 5) * (0.8 + L.disk * 0.3);
      ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke();
    }
    ctx.restore();

    // partículas em espiral
    const pullBase = (0.06 + progress * 0.30 + this.collapse * 3.2) * (rc.running ? 1 : 0.35);
    for (const p of this.ps) {
      const near = clamp(1 - p.r / (R * 1.2));
      if (!rc.reduceMotion) {
        p.a += (0.25 + near * 2.4) * p.s * rc.dt * (rc.running ? 1 : 0.3);
        p.r -= pullBase * (12 + near * 55) * rc.dt;
      }
      if (p.r <= horizon * 0.92) {
        p.r = R * (1.0 + Math.random() * 0.35);
        p.a = Math.random() * TAU;
      }
      const x = cx + Math.cos(p.a) * p.r;
      const y = cy + Math.sin(p.a) * p.r * 0.34;
      const tail = near * 16 * rc.intensity;
      ctx.strokeStyle = `hsla(${p.hue + near * 90}, 100%, ${55 + near * 25}%, ${clamp(0.15 + near, 0, 0.95)})`;
      ctx.lineWidth = p.size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - Math.cos(p.a + 0.35) * tail, y - Math.sin(p.a + 0.35) * tail * 0.34);
      ctx.stroke();
    }

    // nível 4+: arcos de lente gravitacional acima e abaixo do disco
    if (rc.level >= 4) {
      for (const dir of [-1, 1]) {
        ctx.strokeStyle = `rgba(${L.ring},${(0.16 + progress * 0.22) * rc.intensity})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(cx, cy + dir * horizon * 0.30, horizon * 1.9, horizon * 0.55, 0,
          dir > 0 ? 0 : Math.PI, dir > 0 ? Math.PI : TAU);
        ctx.stroke();
      }
    }

    // jatos relativísticos (nível 3+), cegantes no estágio de quasar
    if (rc.level >= 3) {
      const quasar = rc.level >= 5;
      const jet = (0.2 + progress * 0.6) * rc.intensity * (quasar ? 2.1 : 1);
      for (const dir of [-1, 1]) {
        const g = ctx.createLinearGradient(cx, cy, cx, cy + dir * R * (quasar ? 1.5 : 1.1));
        g.addColorStop(0, `rgba(${quasar ? '235,250,255' : '180,220,255'},${0.5 * jet})`);
        g.addColorStop(1, quasar ? 'rgba(120,220,255,0)' : 'rgba(120,80,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(cx - horizon * 0.16, cy);
        ctx.lineTo(cx + horizon * 0.16, cy);
        ctx.lineTo(cx + horizon * 0.7, cy + dir * R * (quasar ? 1.5 : 1.1));
        ctx.lineTo(cx - horizon * 0.7, cy + dir * R * (quasar ? 1.5 : 1.1));
        ctx.closePath(); ctx.fill();
      }
      if (quasar) {   // o quasar ilumina a cena inteira
        const flare = ctx.createRadialGradient(cx, cy, horizon, cx, cy, R * 1.6);
        flare.addColorStop(0, `rgba(150,230,255,${(0.10 + progress * 0.14) * rc.intensity})`);
        flare.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = flare;
        ctx.fillRect(0, 0, w, h);
      }
    }

    // ---- corpos sendo devorados, esticados pela maré ----
    for (const d of this.debris) {
      const near = clamp(1 - (d.r - horizon) / (R * 1.1));
      if (!rc.reduceMotion) {
        d.a += (0.30 + near * 2.2) * rc.dt * (rc.running ? 1 : 0.3);
        d.r -= (pullBase * (18 + near * 70) + 4) * rc.dt;
      }
      if (d.r <= horizon) {
        this.eaten.push({ a: d.a, life: 1 });
        Object.assign(d, this.spawnDebris(R, Math.random, 1));
        continue;
      }
      const x = cx + Math.cos(d.a) * d.r;
      const y = cy + Math.sin(d.a) * d.r * 0.34;

      // quanto mais perto, mais o corpo vira um fio de matéria
      const stretch = Math.pow(near, 1.6);
      const arcLen = 0.05 + stretch * 1.5;
      const light = 55 + near * 35;

      ctx.strokeStyle = `hsla(${d.hue}, 95%, ${light}%, ${0.30 + near * 0.6})`;
      ctx.lineWidth = d.size * (1 - stretch * 0.55);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.ellipse(cx, cy, d.r, d.r * 0.34, 0, d.a - arcLen, d.a);
      ctx.stroke();
      ctx.lineCap = 'butt';

      // cabeça ainda sólida do corpo
      if (stretch < 0.85) {
        const bodyR = d.size * (1 - stretch);
        const bg = ctx.createRadialGradient(x, y, 0, x, y, bodyR * 2.4);
        bg.addColorStop(0, `hsla(${d.hue}, 95%, 82%, ${0.9 - stretch * 0.5})`);
        bg.addColorStop(0.35, `hsla(${d.hue}, 95%, 55%, ${0.55 - stretch * 0.4})`);
        bg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.arc(x, y, bodyR * 2.4, 0, TAU); ctx.fill();

        if (d.kind === 1) {   // cometa: cauda apontando para fora
          const g = ctx.createLinearGradient(x, y, cx + Math.cos(d.a) * (d.r + R * 0.3), cy + Math.sin(d.a) * (d.r + R * 0.3) * 0.34);
          g.addColorStop(0, `hsla(${d.hue}, 95%, 75%, ${0.5 * rc.intensity})`);
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.strokeStyle = g;
          ctx.lineWidth = d.size * 0.7;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(cx + Math.cos(d.a) * (d.r + R * 0.3), cy + Math.sin(d.a) * (d.r + R * 0.3) * 0.34);
          ctx.stroke();
        }
      }
    }

    // clarão de cada corpo cruzando o horizonte
    for (const e of this.eaten) e.life -= rc.dt * 1.6;
    this.eaten = this.eaten.filter((e) => e.life > 0);
    for (const e of this.eaten) {
      const ex = cx + Math.cos(e.a) * horizon * 1.05;
      const ey = cy + Math.sin(e.a) * horizon * 1.05 * 0.34;
      const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, R * 0.22 * (1.2 - e.life));
      g.addColorStop(0, `rgba(255,240,220,${e.life * 0.9})`);
      g.addColorStop(0.4, `rgba(255,170,90,${e.life * 0.45})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(ex, ey, R * 0.22 * (1.2 - e.life), 0, TAU); ctx.fill();
    }

    // anel de fótons
    const ringA = 0.55 + progress * 0.4 + this.flash;
    ctx.strokeStyle = `rgba(${L.ring},${clamp(ringA, 0, 1)})`;
    ctx.lineWidth = 2.5 + progress * 2;
    ctx.shadowBlur = 30 * rc.intensity;
    ctx.shadowColor = `rgb(${L.ring})`;
    ctx.beginPath(); ctx.arc(cx, cy, horizon * 1.06, 0, TAU); ctx.stroke();
    ctx.shadowBlur = 0;

    // nível 2+: anel de fótons secundário, mais fino e externo
    if (rc.level >= 2) {
      ctx.strokeStyle = `rgba(${L.ring},${clamp(ringA * 0.35, 0, 0.6)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(cx, cy, horizon * 1.22, 0, TAU); ctx.stroke();
    }

    // horizonte de eventos
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(cx, cy, horizon, 0, TAU); ctx.fill();

    // clarão do colapso
    if (this.flash > 0.01) {
      const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.4);
      fg.addColorStop(0, `rgba(255,255,255,${this.flash * 0.85})`);
      fg.addColorStop(0.3, `rgba(190,140,255,${this.flash * 0.5})`);
      fg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fg;
      ctx.fillRect(0, 0, w, h);
    }
  }

  event(e: SceneEvent): void {
    if (e === 'complete') { this.collapse = 1; this.flash = 1; this.shake = 1; }
    if (e === 'reset') { this.ps.length = 0; this.debris.length = 0; this.eaten.length = 0; }
  }
}

const cur = (c: number): Tier => [...STAGES].reverse().find((s) => c >= s.at) ?? STAGES[0];
const nxt = (c: number): Tier => STAGES.find((s) => s.at > c) ?? STAGES[STAGES.length - 1];

const fmtMass = (m: number): string =>
  m >= 1e6 ? `${(m / 1e6).toFixed(2)}M` : m >= 1000 ? `${(m / 1000).toFixed(2)}k` : m.toFixed(0);

export const blackholeTheme: ThemeModule = {
  id: 'blackhole',
  name: 'Horizonte de Eventos',
  family: 'cosmic',
  tagline: 'A gravidade puxa tudo. No fim, colapsa e recomeça.',
  swatch: ['#020104', '#b07bff', '#ffb877'],
  vars: {
    '--bg': '#020104',
    '--bg-soft': '#0a0413',
    '--panel': 'rgba(18, 8, 34, 0.55)',
    '--panel-solid': '#100722',
    '--border': 'rgba(176, 123, 255, 0.22)',
    '--border-strong': 'rgba(255, 184, 119, 0.5)',
    '--text': '#f0e8ff',
    '--text-dim': '#9c8cc0',
    '--accent': '#b07bff',
    '--accent-2': '#ffb877',
    '--accent-ink': '#0a0212',
    '--glow': 'rgba(176, 123, 255, 0.6)',
    '--danger': '#ff5d7a',
    '--ok': '#8affd4',
    '--font-ui': "'Inter', system-ui, sans-serif",
    '--font-mono': "ui-monospace, 'SF Mono', monospace",
    '--font-display': "'Inter', system-ui, sans-serif",
    '--radius': '999px',
    '--radius-card': '26px',
    '--radius-sm': '14px',
    '--letter': '0.08em',
    '--panel-blur': '18px',
    '--ui-transform': 'none',
  },
  createScene: () => new BlackHoleScene(),
  // Sub grave com batimento: a gravidade "aperta" conforme o tempo passa.
  ambience(k) {
    const sub = k.drone({ freq: 36, type: 'sine', gain: 0.22 });
    const beat = k.drone({ freq: 36.55, type: 'sine', gain: 0.16 });   // batimento lento contra o sub
    const body = k.drone({ freq: 73, type: 'triangle', gain: 0.05, filter: { type: 'lowpass', freq: 260, q: 3 } });
    const tension = k.drone({ freq: 110, type: 'sawtooth', gain: 0.0001, filter: { type: 'lowpass', freq: 200, q: 6 } });
    const wind = k.bed({ gain: 0.05, type: 'lowpass', freq: 320, q: 0.8 });

    k.lfo(wind.gainParam, 0.035, 0.022);
    if (body.detune) k.lfo(body.detune, 0.07, 12);

    // rangidos distantes de matéria sendo esticada
    k.every(12, 26, (st) => {
      if (!st.running) return;
      audio.tone({ freq: 88 + Math.random() * 40, glideTo: 44, type: 'sine', dur: 3.4, gain: 0.05, attack: 0.6 });
      audio.noise({ dur: 2.6, gain: 0.018, type: 'lowpass', freq: 700, sweepTo: 120 });
    });

    k.onState(({ running, progress, phase }) => {
      const focus = phase === 'focus';
      const pull = running && focus ? progress : 0;
      sub.setGain(running ? 0.24 : 0.14);
      beat.setGain(running ? 0.18 : 0.09);
      beat.setFreq(36.55 + pull * 0.9);            // o batimento acelera junto com a queda
      body.setGain(running ? 0.05 + pull * 0.05 : 0.025);
      body.setFilter(260 + pull * 500);
      tension.setGain(pull > 0.35 ? (pull - 0.35) * 0.055 : 0.0001);   // dissonância só no fim
      wind.setGain(running ? 0.05 + pull * 0.06 : 0.028);
      wind.setFilter(320 + pull * 700);
    });
  },

  sounds: {
    start() {
      audio.tone({ freq: 55, glideTo: 82, type: 'sine', dur: 2.4, gain: 0.2 });
      audio.tone({ freq: 220, glideTo: 330, type: 'triangle', dur: 1.2, gain: 0.08, filter: { type: 'lowpass', freq: 900 } });
    },
    pause() { audio.tone({ freq: 110, glideTo: 40, type: 'sine', dur: 0.9, gain: 0.16 }); },
    complete(phase) {
      if (phase === 'focus') {
        audio.rumble(2.2, 0.28);
        audio.noise({ dur: 1.8, gain: 0.16, type: 'lowpass', freq: 4000, sweepTo: 60, delay: 0.05 });
        audio.tone({ freq: 1200, glideTo: 40, type: 'sine', dur: 2.0, gain: 0.14, delay: 0.1 });
        audio.chord([110, 164.81, 220], { type: 'sine', dur: 3.0, gain: 0.1, delay: 1.2, attack: 0.4 });
      } else {
        audio.tone({ freq: 174.61, glideTo: 261.63, type: 'sine', dur: 1.4, gain: 0.14 });
      }
    },
    tick() { audio.tone({ freq: 70, type: 'sine', dur: 0.08, gain: 0.05 }); },
    levelup() {
      audio.tone({ freq: 40, glideTo: 160, type: 'sawtooth', dur: 2.6, gain: 0.16, filter: { type: 'lowpass', freq: 700, q: 6 } });
      audio.chord([261.63, 311.13, 392, 466.16], { type: 'sine', dur: 2.4, gain: 0.11, delay: 0.4, attack: 0.3 });
    },
    ui() { audio.tone({ freq: 320, glideTo: 240, type: 'sine', dur: 0.09, gain: 0.06 }); },
    warn() { audio.tone({ freq: 60, glideTo: 45, type: 'sawtooth', dur: 0.8, gain: 0.14, filter: { type: 'lowpass', freq: 400 } }); },
  },
  stageVars(level) {
    const L = look(level);
    return {
      '--accent': L.accent,
      '--accent-2': L.a2,
      '--glow': `${L.accent}99`,
      '--border-strong': `${L.a2}80`,
    };
  },
  stageName: (level) => (STAGES[Math.min(STAGES.length, Math.max(1, level)) - 1] ?? STAGES[0]).name,
  progression: {
    unit: 'M☉',
    tiers: STAGES,
    gain: (minutes, phase) => (phase === 'focus' ? minutes * 2 : 0),
    view(p, level) {
      const worn = STAGES[Math.min(STAGES.length, Math.max(1, level)) - 1] ?? STAGES[0];
      const c = cur(p.counter), n = nxt(p.counter);
      const span = Math.max(1, n.at - c.at);
      const pct = n.at > p.counter ? clamp((p.counter - c.at) / span) * 100 : 100;
      return {
        title: worn.name,
        headline: `${fmtMass(p.counter)} M☉`,
        sub: `massa acumulada · estágio ${level} de ${STAGES.length}`,
        barPct: pct,
        barLabel: n.at > p.counter ? `${fmtMass(n.at - p.counter)} M☉ até ${n.name}` : 'Singularidade máxima',
        stats: [
          { label: 'Colapsos', value: `${p.sessions}` },
          { label: 'Horizonte', value: `${(2.95 * p.counter).toFixed(0)} km` },
          { label: 'Tempo consumido', value: `${Math.round(p.totalMinutes)} min` },
        ],
        collection: CONSUMED.map((o) => ({
          id: o.id, name: o.name, icon: o.icon, desc: o.desc, unlocked: p.counter >= o.at,
        })),
      };
    },
    completionMessage(p, minutes) {
      return `Colapso concluído: ${minutes.toFixed(0)} min consumidos, +${(minutes * 2).toFixed(0)} M☉. Estágio: ${cur(p.counter).name}.`;
    },
  },
  labels: {
    focus: 'Acreção', short: 'Deriva', long: 'Horizonte Frio',
    start: 'Iniciar colapso', pause: 'Suspender', resume: 'Retomar colapso',
    reset: 'Reiniciar', notes: 'Notas do observador', log: 'Telemetria',
  },
};

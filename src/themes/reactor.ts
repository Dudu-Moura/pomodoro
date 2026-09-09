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

/** Cada geração do reator muda a paleta, o chassi e o que existe no núcleo. */
const GEN_LOOK = [
  { neon: '255,45,149', alt: '0,240,255',   accent: '#ff2d95', a2: '#00f0ff', plates: false, rings: 1, emitters: 6,  ink: '#12001f' },
  { neon: '255,45,149', alt: '0,240,255',   accent: '#ff3da0', a2: '#3df0ff', plates: true,  rings: 1, emitters: 6,  ink: '#12001f' },
  { neon: '0,225,255',  alt: '255,45,149',  accent: '#00e1ff', a2: '#ff5bb0', plates: true,  rings: 2, emitters: 8,  ink: '#001a20' },
  { neon: '255,190,60', alt: '0,240,255',   accent: '#ffbe3c', a2: '#00f0ff', plates: true,  rings: 2, emitters: 12, ink: '#1f1200' },
  { neon: '215,170,255', alt: '235,250,255', accent: '#d7aaff', a2: '#ffffff', plates: true, rings: 3, emitters: 12, ink: '#150024' },
];
const look = (level: number) => GEN_LOOK[Math.min(GEN_LOOK.length, Math.max(1, level)) - 1];

interface Spark { x: number; y: number; vx: number; vy: number; life: number; }
interface Blob { a: number; r: number; sp: number; size: number; hue: number; }

class ReactorScene implements Scene {
  private sparks: Spark[] = [];
  private motes: { x: number; y: number; v: number; s: number }[] = [];
  private blobs: Blob[] = [];
  private overloadT = 0;
  private shake = 0;
  private beat = 0;
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

    for (const m of this.motes) {
      if (!rc.reduceMotion) { m.y -= m.v * rc.dt * (0.4 + rc.progress * 1.4); if (m.y < -6) { m.y = h + 6; m.x = Math.random() * w; } }
      ctx.fillStyle = `rgba(0, 240, 255, ${0.35 * rc.intensity})`;
      ctx.fillRect(m.x, m.y, m.s, m.s * 3);
    }

    // o ambiente inteiro pulsa junto com o núcleo
    const haze = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.6);
    const hot = rc.overload;
    const glow = (0.10 + rc.progress * 0.16 + this.beat * 0.10) * rc.intensity;
    haze.addColorStop(0, `rgba(255,${lerp(45, 200, hot)},${lerp(149, 60, hot)},${glow})`);
    haze.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, w, h);

    if (this.overloadT > 0) {
      ctx.fillStyle = `rgba(255, 200, 60, ${this.overloadT * 0.22})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  private poly(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, sides: number, rot: number): void {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = rot + (i / sides) * TAU;
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
      ctx.lineTo(lerp(x1, x2, p) + (Math.random() - 0.5) * amp, lerp(y1, y2, p) + (Math.random() - 0.5) * amp);
    }
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  /** Chassi de aço: octógono com bisel, faixas de perigo e parafusos. */
  private housing(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, rc: RenderCtx): void {
    const L = look(rc.level);
    const rot = Math.PI / 8;
    const steel = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
    steel.addColorStop(0, '#20182e');
    steel.addColorStop(0.45, '#2c2340');
    steel.addColorStop(0.55, '#171122');
    steel.addColorStop(1, '#0e0a17');
    ctx.fillStyle = steel;
    this.poly(ctx, cx, cy, R * 0.94, 8, rot); ctx.fill();

    ctx.strokeStyle = `rgba(${L.alt},0.30)`;
    ctx.lineWidth = 2;
    this.poly(ctx, cx, cy, R * 0.94, 8, rot); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    this.poly(ctx, cx, cy, R * 0.86, 8, rot); ctx.stroke();

    // faixas de perigo nas colunas dos dutos (fora da faixa onde ficam os dígitos)
    if (L.plates) for (const dir of [-1, 1]) {
      const bandY = cy + dir * R * 0.78;
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - R * 0.20, bandY - R * 0.045, R * 0.40, R * 0.09);
      ctx.clip();
      for (let i = -8; i < 14; i++) {
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,176,32,0.45)' : 'rgba(20,12,30,0.6)';
        ctx.save();
        ctx.translate(cx, bandY);
        ctx.rotate(-0.6);
        ctx.fillRect(-R * 0.3 + i * R * 0.05, -R * 0.2, R * 0.025, R * 0.4);
        ctx.restore();
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(0,240,255,0.22)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - R * 0.20, bandY - R * 0.045, R * 0.40, R * 0.09);
    }

    // grelhas de ventilação nos painéis laterais
    if (L.plates) for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        const yy = cy - R * 0.10 + i * R * 0.05;
        ctx.strokeStyle = 'rgba(160,180,230,0.13)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx + side * R * 0.70, yy);
        ctx.lineTo(cx + side * R * 0.84, yy);
        ctx.stroke();
      }
    }

    // parafusos do chassi
    for (let i = 0; i < 8; i++) {
      const a = rot + (i / 8) * TAU + TAU / 16;
      const bx = cx + Math.cos(a) * R * 0.90, by = cy + Math.sin(a) * R * 0.90;
      ctx.fillStyle = '#3b3050';
      ctx.beginPath(); ctx.arc(bx, by, R * 0.022, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,240,255,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(bx, by, R * 0.022, 0, TAU); ctx.stroke();
    }
  }

  /** Dutos de refrigeração alimentando a cápsula, com fluxo de energia visível. */
  private pipes(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, rc: RenderCtx, charge: number): void {
    const capR = R * 0.52;
    for (const dir of [-1, 1]) {
      const x0 = cx, y0 = cy + dir * R * 0.92, y1 = cy + dir * capR;
      ctx.strokeStyle = '#241a35';
      ctx.lineWidth = R * 0.115;
      ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,240,255,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0 - R * 0.058, y0); ctx.lineTo(x0 - R * 0.058, y1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x0 + R * 0.058, y0); ctx.lineTo(x0 + R * 0.058, y1); ctx.stroke();

      // anéis de reforço
      for (let i = 0; i < 3; i++) {
        const yy = lerp(y0, y1, 0.18 + i * 0.3);
        ctx.strokeStyle = 'rgba(150,170,220,0.18)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x0 - R * 0.068, yy); ctx.lineTo(x0 + R * 0.068, yy); ctx.stroke();
      }

      // combustível descendo para o núcleo
      const n = 5;
      for (let i = 0; i < n; i++) {
        const ph = rc.reduceMotion ? i / n : ((rc.t * (0.35 + charge * 0.9) + i / n) % 1);
        const yy = lerp(y0, y1, ph);
        const a = (1 - Math.abs(ph - 0.5) * 1.4) * (0.35 + charge * 0.65);
        ctx.fillStyle = `rgba(0,240,255,${clamp(a)})`;
        ctx.beginPath(); ctx.ellipse(x0, yy, R * 0.03, R * 0.012, 0, 0, TAU); ctx.fill();
      }
    }
  }

  stage(rc: RenderCtx): void {
    const { ctx, w, h, t, progress } = rc;
    this.overloadT = Math.max(0, this.overloadT - rc.dt * 0.7);
    this.shake = Math.max(0, this.shake - rc.dt * 1.8);

    // batimento do núcleo: acelera conforme a carga sobe
    const bpm = 1.1 + progress * 2.6 + this.overloadT * 4;
    this.beat = rc.reduceMotion ? 0.35 : Math.pow(Math.max(0, Math.sin(t * bpm * Math.PI)), 6);

    const jit = this.shake * 10 * rc.intensity + rc.overload * 2;
    const cx = w / 2 + (Math.random() - 0.5) * jit;
    const cy = h / 2 + (Math.random() - 0.5) * jit;
    const R = Math.min(w, h) / 2;

    const charge = clamp(progress + this.overloadT * 0.4);
    const isFocus = rc.phase === 'focus';
    const hot = rc.overload;
    const L = look(rc.level);
    const [nr, ng, nb] = L.neon.split(',').map(Number);
    const neon = this.overloadT > 0 ? '255,210,80'
      : isFocus ? `${nr},${lerp(ng, 190, hot)},${lerp(nb, 70, hot)}` : L.alt;

    if (!this.blobs.length) {
      const rnd = mulberry32(8823);
      this.blobs = Array.from({ length: 7 }, (_, i) => ({
        a: rnd() * TAU, r: 0.15 + rnd() * 0.5, sp: (0.25 + rnd() * 0.8) * (i % 2 ? 1 : -1),
        size: 0.30 + rnd() * 0.42, hue: rnd() * 60,
      }));
    }

    // ---- módulos construídos: trilhos estruturais externos ----
    const built = MODULES.filter((m) => rc.counter >= m.at).length;
    for (let i = 0; i < built; i++) {
      const rr = R * (0.99 - i * 0.032);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rc.reduceMotion ? 0 : t * (i % 2 === 0 ? 0.16 : -0.11));
      ctx.strokeStyle = `rgba(${L.alt},${0.14 + 0.20 * (i / Math.max(1, built))})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([R * 0.1, R * 0.05]);
      ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // ---- estrutura física ----
    this.housing(ctx, cx, cy, R, rc);
    this.pipes(ctx, cx, cy, R, rc, charge);

    const capR = R * 0.52;      // raio externo do bisel da cápsula
    const glassR = R * 0.44;    // vidro interno
    const ringR = R * 0.60;     // anel de contagem, em volta da cápsula

    // suportes diagonais segurando a cápsula
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i / 4) * TAU;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      const grad = ctx.createLinearGradient(capR, 0, R * 0.9, 0);
      grad.addColorStop(0, '#3a2f52');
      grad.addColorStop(1, '#181124');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(capR * 0.98, -R * 0.05);
      ctx.lineTo(R * 0.9, -R * 0.085);
      ctx.lineTo(R * 0.9, R * 0.085);
      ctx.lineTo(capR * 0.98, R * 0.05);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = `rgba(${neon},0.28)`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    // emissores nas bordas: acendem em sequência conforme a carga
    const emitters = L.emitters;
    for (let i = 0; i < emitters; i++) {
      const a = (i / emitters) * TAU - Math.PI / 2;
      const x = cx + Math.cos(a) * R * 0.80, y = cy + Math.sin(a) * R * 0.80;
      const lvl = clamp(charge * emitters - i);
      ctx.fillStyle = lvl > 0 ? `rgba(${neon},${0.30 + lvl * 0.65})` : 'rgba(80,90,120,0.35)';
      ctx.shadowBlur = lvl > 0 ? 16 * rc.intensity * lvl : 0;
      ctx.shadowColor = `rgba(${neon},1)`;
      ctx.beginPath(); ctx.arc(x, y, 5 + lvl * 4, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      if (lvl > 0.05 && !rc.reduceMotion && Math.random() < 0.20 * rc.intensity * (0.3 + charge)) {
        ctx.strokeStyle = `rgba(${neon},${0.30 + lvl * 0.45})`;
        ctx.lineWidth = 1.2;
        this.bolt(ctx, x, y, cx + Math.cos(a) * capR, cy + Math.sin(a) * capR, 12 * charge + 4);
      }
    }

    // ---- cápsula: bisel metálico ----
    const bezel = ctx.createRadialGradient(cx - capR * 0.4, cy - capR * 0.4, capR * 0.5, cx, cy, capR);
    bezel.addColorStop(0, '#4a3d66');
    bezel.addColorStop(0.7, '#2a2140');
    bezel.addColorStop(1, '#140e22');
    ctx.fillStyle = bezel;
    ctx.beginPath(); ctx.arc(cx, cy, capR, 0, TAU); ctx.fill();

    ctx.strokeStyle = `rgba(${neon},0.55)`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, capR, 0, TAU); ctx.stroke();

    // parafusos do bisel
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const bx = cx + Math.cos(a) * (capR + glassR) / 2;
      const by = cy + Math.sin(a) * (capR + glassR) / 2;
      ctx.fillStyle = 'rgba(180,200,240,0.20)';
      ctx.beginPath(); ctx.arc(bx, by, R * 0.014, 0, TAU); ctx.fill();
    }

    // vidro interno escuro
    ctx.fillStyle = 'rgba(6,2,14,0.92)';
    ctx.beginPath(); ctx.arc(cx, cy, glassR, 0, TAU); ctx.fill();

    // ---- núcleo de plasma pulsante ----
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, glassR, 0, TAU); ctx.clip();
    ctx.globalCompositeOperation = 'lighter';

    const pulse = 1 + this.beat * 0.14 + Math.sin(t * 1.7) * 0.03;
    const coreR = glassR * (0.46 + charge * 0.38) * pulse;

    for (const bl of this.blobs) {
      if (!rc.reduceMotion) bl.a += bl.sp * rc.dt * (0.4 + charge * 1.6);
      const br = coreR * bl.r * (1 + this.beat * 0.3);
      const bx = cx + Math.cos(bl.a) * br;
      const by = cy + Math.sin(bl.a) * br;
      const bs = coreR * bl.size;
      const bg = ctx.createRadialGradient(bx, by, 0, bx, by, bs);
      const alpha = (0.26 + charge * 0.32) * rc.intensity;
      bg.addColorStop(0, `rgba(${neon},${alpha})`);
      bg.addColorStop(0.5, `rgba(${neon},${alpha * 0.35})`);
      bg.addColorStop(1, `rgba(${neon},0)`);
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(bx, by, bs, 0, TAU); ctx.fill();
    }

    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    core.addColorStop(0, `rgba(255,255,255,${0.85 + this.beat * 0.15})`);
    core.addColorStop(0.28, `rgba(${neon},0.95)`);
    core.addColorStop(0.62, `rgba(${neon},0.35)`);
    core.addColorStop(1, `rgba(${neon},0)`);
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, TAU); ctx.fill();

    // geração final: o núcleo contém uma singularidade, não plasma
    if (rc.level >= 5) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(cx, cy, coreR * 0.34, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,255,255,${0.7 + this.beat * 0.3})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, coreR * 0.38, 0, TAU); ctx.stroke();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.5);
      ctx.scale(1, 0.28);
      ctx.strokeStyle = `rgba(${neon},0.75)`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, coreR * 0.62, 0, TAU); ctx.stroke();
      ctx.restore();
    }

    // descargas internas contidas pelo vidro
    if (!rc.reduceMotion && charge > 0.12) {
      const n = Math.round(1 + charge * 3);
      for (let i = 0; i < n; i++) {
        if (Math.random() > 0.35 * rc.intensity) continue;
        const a1 = Math.random() * TAU, a2 = a1 + 1.5 + Math.random() * 2;
        ctx.strokeStyle = `rgba(255,255,255,${0.10 + charge * 0.35})`;
        ctx.lineWidth = 1 + Math.random();
        this.bolt(ctx,
          cx + Math.cos(a1) * coreR * 0.7, cy + Math.sin(a1) * coreR * 0.7,
          cx + Math.cos(a2) * glassR * 0.9, cy + Math.sin(a2) * glassR * 0.9, 14);
      }
    }
    ctx.restore();

    // reflexo do vidro
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = R * 0.03;
    ctx.beginPath(); ctx.arc(cx, cy, glassR * 0.88, Math.PI * 1.08, Math.PI * 1.42); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = R * 0.016;
    ctx.beginPath(); ctx.arc(cx, cy, glassR * 0.93, Math.PI * 0.15, Math.PI * 0.34); ctx.stroke();

    // ---- anel de contagem neon em volta da cápsula ----
    ctx.strokeStyle = 'rgba(120,140,190,0.20)';
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(cx, cy, ringR, 0, TAU); ctx.stroke();

    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * TAU - Math.PI / 2;
      const major = i % 5 === 0;
      const passed = i / 60 <= progress;
      const len = major ? R * 0.045 : R * 0.024;
      ctx.strokeStyle = passed ? `rgba(${neon},${major ? 0.9 : 0.5})` : 'rgba(140,160,210,0.16)';
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (ringR + 7), cy + Math.sin(a) * (ringR + 7));
      ctx.lineTo(cx + Math.cos(a) * (ringR + 7 + len), cy + Math.sin(a) * (ringR + 7 + len));
      ctx.stroke();
    }

    const a0 = -Math.PI / 2;
    const a1 = a0 + progress * TAU;
    ctx.strokeStyle = `rgba(${neon},0.98)`;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.shadowBlur = (18 + this.beat * 22) * rc.intensity;
    ctx.shadowColor = `rgba(${neon},1)`;
    ctx.beginPath(); ctx.arc(cx, cy, ringR, a0, a1); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineCap = 'butt';

    // gerações avançadas ganham anéis de contagem concêntricos
    for (let extra = 1; extra < L.rings; extra++) {
      const rr = ringR + extra * R * 0.075;
      ctx.strokeStyle = 'rgba(120,140,190,0.14)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke();
      ctx.strokeStyle = `rgba(${L.alt},${0.55 - extra * 0.12})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, a0, a0 + progress * TAU * (extra === 1 ? 1 : 0.5));
      ctx.stroke();
    }

    // cabeça luminosa correndo na ponta do arco
    if (progress > 0.001) {
      const hx = cx + Math.cos(a1) * ringR, hy = cy + Math.sin(a1) * ringR;
      const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, R * 0.07);
      hg.addColorStop(0, 'rgba(255,255,255,0.95)');
      hg.addColorStop(0.4, `rgba(${neon},0.7)`);
      hg.addColorStop(1, `rgba(${neon},0)`);
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(hx, hy, R * 0.07, 0, TAU); ctx.fill();
    }

    // ---- alerta de sobrecarga ----
    if (hot > 0.02 && isFocus) {
      ctx.font = 'bold 13px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = Math.floor(t * 6) % 2 === 0 ? `rgba(255,210,80,${0.5 + hot * 0.5})` : 'rgba(255,120,60,0.5)';
      ctx.fillText('⚠ SOBRECARGA IMINENTE', cx, cy + R * 0.86);
      ctx.textAlign = 'left';
    }

    // ---- faíscas e descarga final ----
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
      // válvulas liberando vapor pelos dutos
      for (const dir of [-1, 1]) {
        const vg = ctx.createRadialGradient(cx, cy + dir * R * 0.75, 0, cx, cy + dir * R * 0.75, R * 0.4);
        vg.addColorStop(0, `rgba(255,255,255,${this.overloadT * 0.35})`);
        vg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = vg;
        ctx.beginPath(); ctx.arc(cx, cy + dir * R * 0.75, R * 0.4, 0, TAU); ctx.fill();
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
      for (let i = 0; i < 110; i++) {
        const a = Math.random() * TAU, sp = 60 + Math.random() * 340;
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
  // Reator ligado: zumbido da rede, bobina carregando e pulsação do núcleo.
  ambience(k) {
    const mains = k.drone({ freq: 50, type: 'sawtooth', gain: 0.045, filter: { type: 'lowpass', freq: 150, q: 5 } });
    const body = k.drone({ freq: 100, type: 'sine', gain: 0.022 });
    const coil = k.drone({ freq: 300, type: 'triangle', gain: 0.012, filter: { type: 'bandpass', freq: 700, q: 4 }, pan: -0.2 });
    const plasma = k.bed({ gain: 0.020, type: 'bandpass', freq: 1500, q: 0.9, pan: 0.2 });

    // o núcleo pulsa: o LFO acelera junto com a carga
    const throbRate = k.lfo(body.gainParam, 1.1, 0.016);
    k.lfo(plasma.gainParam, 0.5, 0.008);

    // estalos de arco elétrico
    k.every(5, 13, (st) => {
      if (!st.running) return;
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        audio.noise({ dur: 0.05 + Math.random() * 0.08, gain: 0.03 + st.progress * 0.04,
          type: 'bandpass', freq: 2200 + Math.random() * 2500, q: 2, delay: i * 0.07 });
      }
    });

    // alarme quando a contenção chega no limite
    k.every(2.5, 4.5, (st) => {
      if (!st.running || st.progress < 0.9 || st.phase !== 'focus') return;
      audio.tone({ freq: 880, type: 'square', dur: 0.09, gain: 0.05 });
      audio.tone({ freq: 880, type: 'square', dur: 0.09, gain: 0.05, delay: 0.16 });
    });

    // sistema em repouso: purga de pressão de vez em quando
    k.every(9, 20, (st) => {
      if (st.running) return;
      audio.noise({ dur: 0.7, gain: 0.022, type: 'lowpass', freq: 900, sweepTo: 250 });
    });

    k.onState(({ running, progress, phase }) => {
      const load = running && phase === 'focus' ? progress : 0;
      mains.setGain(running ? 0.055 : 0.032);
      body.setGain(running ? 0.028 + load * 0.020 : 0.016);
      // a bobina sobe de tom conforme o reator carrega
      coil.setFreq(300 + load * 620);
      coil.setFilter(700 + load * 1500);
      coil.setGain(running ? 0.014 + load * 0.040 : 0.006);
      plasma.setGain(running ? 0.024 + load * 0.045 : 0.010);
      plasma.setFilter(1500 + load * 1800);
      throbRate?.setTargetAtTime(1.1 + load * 2.4, 0, 0.5);
    });
  },

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
  stageVars(level) {
    const L = look(level);
    return {
      '--accent': L.accent,
      '--accent-2': L.a2,
      '--accent-ink': L.ink,
      '--glow': `rgba(${L.neon}, 0.6)`,
      '--border': `rgba(${L.alt}, 0.3)`,
      '--border-strong': `rgba(${L.neon}, 0.65)`,
    };
  },
  stageName: (level) => (GENS[Math.min(GENS.length, Math.max(1, level)) - 1] ?? GENS[0]).name,
  progression: {
    unit: 'MW',
    tiers: GENS,
    gain: (minutes, phase) => (phase === 'focus' ? minutes * 10 : minutes * 2),
    view(p, level) {
      const worn = GENS[Math.min(GENS.length, Math.max(1, level)) - 1] ?? GENS[0];
      const c = curGen(p.counter), n = nextGen(p.counter);
      const span = Math.max(1, n.at - c.at);
      const pct = n.at > p.counter ? clamp((p.counter - c.at) / span) * 100 : 100;
      return {
        title: worn.name,
        headline: fmtMW(p.counter),
        sub: `energia gerada · estágio ${level} de ${GENS.length}`,
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
    reset: 'Purgar', notes: 'Bloco técnico', log: 'Console',
  },
};

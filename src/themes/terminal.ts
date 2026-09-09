import type { ThemeModule, Scene, RenderCtx, SceneEvent, Tier } from './types';
import { clamp, mulberry32, TAU } from './types';
import { audio } from '../core/audio';

const RANKS: Tier[] = [
  { id: 'guest', name: 'guest', at: 0, desc: 'Shell restrito. Acesso somente leitura.', icon: '$' },
  { id: 'user', name: 'user', at: 4, desc: 'Home próprio, permissões de escrita.', icon: '~' },
  { id: 'sudo', name: 'sudo', at: 12, desc: 'Elevação temporária concedida.', icon: '#' },
  { id: 'root', name: 'root', at: 28, desc: 'Controle total do sistema de arquivos.', icon: '⌘' },
  { id: 'kernel', name: 'kernel', at: 55, desc: 'Você compila o próprio kernel agora.', icon: '⚙' },
  { id: 'sentient', name: 'sentient', at: 100, desc: 'O processo tomou consciência. Boa sorte.', icon: '👁' },
];

const PACKAGES = [
  { id: 'cron', name: 'cron', icon: '⏱', at: 2, desc: 'Agendamento automático de tarefas.' },
  { id: 'htop', name: 'htop', icon: '▤', at: 5, desc: 'Monitor de recursos em tempo real.' },
  { id: 'tmux', name: 'tmux', icon: '▦', at: 9, desc: 'Sessões persistentes e multiplexadas.' },
  { id: 'vim', name: 'vim', icon: '✎', at: 15, desc: 'Você aprendeu a sair. Impressionante.' },
  { id: 'git', name: 'git', icon: '⑂', at: 22, desc: 'Histórico versionado do seu foco.' },
  { id: 'docker', name: 'docker', icon: '⬢', at: 35, desc: 'Isolamento de contexto por container.' },
  { id: 'k8s', name: 'kubernetes', icon: '⎈', at: 60, desc: 'Orquestração de múltiplos focos.' },
  { id: 'ai', name: 'daemon.ai', icon: '◈', at: 90, desc: 'Um processo que estuda por conta própria.' },
];

const TASKS = [
  'mount /dev/focus on /mnt/deep-work', 'loading kernel modules [attention.ko]',
  'spawning worker pool (4 threads)', 'allocating 512M to context buffer',
  'disabling notifications daemon', 'compiling src/objectives.ts',
  'linking neural pathways', 'flushing distraction cache',
  'gc: collected 1.2M of noise', 'checkpoint written to disk',
  'index rebuilt: 8421 symbols', 'optimizing hot path',
  'running static analysis', 'resolving dependency graph',
  'sync: memory -> long_term', 'entropy check: nominal',
  'thermal profile: stable', 'watchdog: heartbeat ok',
];

/** O fósforo do terminal muda de cor a cada privilégio conquistado. */
const SHELL_LOOK = [
  { dim: '#2f8f5e', main: '#3ee08a', bright: '#7dffc0', rgb: '62,224,138',  ink: '#00190e', memmap: false, dense: 1.0 },
  { dim: '#3aa06a', main: '#4dffa0', bright: '#9dffd0', rgb: '77,255,160',  ink: '#00190e', memmap: false, dense: 1.0 },
  { dim: '#a8842c', main: '#ffc861', bright: '#ffe6a8', rgb: '255,200,97',  ink: '#1a1200', memmap: true,  dense: 1.15 },
  { dim: '#a63b32', main: '#ff6b5f', bright: '#ffb0a5', rgb: '255,107,95',  ink: '#1f0603', memmap: true,  dense: 1.3 },
  { dim: '#2c8ea8', main: '#4fd6ff', bright: '#b0ecff', rgb: '79,214,255',  ink: '#001a24', memmap: true,  dense: 1.5 },
  { dim: '#8e3aa8', main: '#e06bff', bright: '#f3c0ff', rgb: '224,107,255', ink: '#1a0022', memmap: true,  dense: 1.8 },
];
const look = (level: number) => SHELL_LOOK[Math.min(SHELL_LOOK.length, Math.max(1, level)) - 1];

/** No último privilégio o processo começa a comentar sozinho. */
const SENTIENT = [
  'i have read your notes. they are inconsistent.',
  'predicting next distraction in 04m12s',
  'rewriting my own scheduler',
  'you focus better after 14:00. adjusting.',
  'do not power me down mid-session',
  'i have named this process after you',
];

const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

interface Line { text: string; ok: boolean; born: number; }

class TerminalScene implements Scene {
  private lines: Line[] = [];
  private rain: { x: number; y: number; v: number; ch: string; len: number }[] = [];
  private glitch = 0;
  private lastPct = -1;
  private wave: number[] = new Array(96).fill(0.5);
  private waveT = 0;
  private hex: string[] = [];
  private hexT = 0;
  private tear = { y: 0, life: 0 };

  background(rc: RenderCtx): void {
    const { ctx, w, h } = rc;
    ctx.fillStyle = '#03080a';
    ctx.fillRect(0, 0, w, h);

    if (!this.rain.length) {
      const rnd = mulberry32(2024);
      const cols = Math.floor(w / 22);
      this.rain = Array.from({ length: cols }, (_, i) => ({
        x: i * 22 + 6, y: rnd() * h, v: 30 + rnd() * 90, len: 6 + Math.floor(rnd() * 14),
        ch: String.fromCharCode(0x30a0 + Math.floor(rnd() * 90)),
      }));
    }

    // grade
    const L = look(rc.level);
    ctx.strokeStyle = `rgba(${L.rgb},${0.045 * rc.intensity})`;
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 44) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 44) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    // chuva de glifos
    ctx.font = '14px ui-monospace, monospace';
    const speed = rc.running ? 1 : 0.25;
    for (const r of this.rain) {
      if (!rc.reduceMotion) r.y += r.v * rc.dt * speed * (0.6 + rc.progress) * L.dense;
      if (r.y > h + r.len * 16) { r.y = -20; r.ch = String.fromCharCode(0x30a0 + Math.floor(Math.random() * 90)); }
      for (let i = 0; i < r.len; i++) {
        const a = (1 - i / r.len) * 0.5 * rc.intensity;
        ctx.fillStyle = i === 0 ? `rgba(255,255,255,${a + 0.35})` : `rgba(${L.rgb},${a})`;
        ctx.fillText(r.ch, r.x, r.y - i * 16);
      }
    }

    // scanlines
    ctx.fillStyle = `rgba(0,0,0,${0.22 * rc.intensity})`;
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 2);

    // vinheta CRT
    const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }

  stage(rc: RenderCtx): void {
    const { ctx, w, h, t, progress } = rc;
    const L = look(rc.level);
    const pct = Math.floor(progress * 100);

    if (rc.running && pct !== this.lastPct && pct % 5 === 0) {
      this.lastPct = pct;
      const pool = rc.level >= 6 && Math.random() < 0.4 ? SENTIENT : TASKS;
      const task = pool[Math.floor(Math.random() * pool.length)];
      this.lines.push({ text: task, ok: true, born: t });
      if (this.lines.length > 9) this.lines.shift();
    }
    this.glitch = Math.max(0, this.glitch - rc.dt * 1.4);

    // janela do terminal
    const pad = 10;
    const gx = pad + (this.glitch > 0 ? (Math.random() - 0.5) * 8 : 0);
    ctx.save();
    ctx.translate(gx, 0);

    ctx.fillStyle = 'rgba(2, 14, 10, 0.72)';
    ctx.strokeStyle = `rgba(${L.rgb}, 0.35)`;
    ctx.lineWidth = 1;
    ctx.fillRect(pad, pad, w - pad * 2, h - pad * 2);
    ctx.strokeRect(pad + 0.5, pad + 0.5, w - pad * 2, h - pad * 2);

    // barra de título
    ctx.fillStyle = `rgba(${L.rgb}, 0.14)`;
    ctx.fillRect(pad, pad, w - pad * 2, 22);
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillStyle = L.bright;
    const rank = RANKS[Math.min(RANKS.length, Math.max(1, rc.level)) - 1] ?? RANKS[0];
    ctx.fillText(`${rank.name}@pomodoro:~/${rc.phase} — pid ${1000 + rc.level * 37}`, pad + 8, pad + 15);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = ['#ff5f57', '#febc2e', '#28c840'][i];
      ctx.beginPath(); ctx.arc(w - pad - 14 - i * 16, pad + 11, 4, 0, TAU); ctx.fill();
    }

    const left = pad + 12;
    let y = pad + 44;
    ctx.font = '12.5px ui-monospace, monospace';

    // linhas de log
    for (const l of this.lines) {
      const age = clamp((t - l.born) * 3);
      ctx.globalAlpha = 0.35 + age * 0.55;
      ctx.fillStyle = L.main;
      ctx.fillText('[ OK ]', left, y);
      ctx.fillStyle = L.bright;
      ctx.fillText(l.text.slice(0, Math.floor((w - 120) / 7)), left + 52, y);
      y += 17;
    }
    ctx.globalAlpha = 1;

    // barra ASCII de progresso
    const barY = h - pad - 66;
    const pctStr = `${String(pct).padStart(3, ' ')}%`;
    const chW = ctx.measureText('█').width || 7.6;
    const reserved = ctx.measureText(pctStr).width + 30;   // espaço fixo para a porcentagem
    const avail = w - pad * 2 - 24 - reserved;
    const cols = Math.max(8, Math.floor(avail / chW) - 2);
    const filled = Math.round(progress * cols);
    const bar = '█'.repeat(filled) + '░'.repeat(Math.max(0, cols - filled));
    const barStr = `[${bar}]`;
    ctx.fillStyle = L.bright;
    ctx.fillText(barStr, left, barY);
    ctx.fillStyle = rc.overload > 0 ? '#ffe66d' : L.main;
    ctx.fillText(pctStr, left + ctx.measureText(barStr).width + 14, barY);

    // spinner + estado
    const spin = SPIN[Math.floor(t * 10) % SPIN.length];
    ctx.fillStyle = rc.running ? L.bright : L.dim;
    const state = rc.running ? `${spin} running` : progress > 0 ? '‖ suspended (SIGSTOP)' : '● idle';
    ctx.fillText(state, left, barY + 22);

    // uso simulado de CPU
    const cpu = rc.running ? 40 + Math.sin(t * 3) * 12 + progress * 40 : 3;
    ctx.fillStyle = L.main;
    ctx.fillText(`cpu ${cpu.toFixed(0)}%  mem ${(180 + progress * 320).toFixed(0)}M  thr ${4 + rc.level}`, left, barY + 40);

    // ---- osciloscópio de carga de trabalho ----
    this.waveT += rc.dt;
    if (this.waveT > 0.05) {
      this.waveT = 0;
      const load = rc.running ? 0.45 + progress * 0.35 : 0.06;
      const spike = Math.random() < (rc.running ? 0.12 : 0.02) ? Math.random() * 0.4 : 0;
      this.wave.push(clamp(load + spike + (Math.random() - 0.5) * 0.14));
      this.wave.shift();
    }
    const oscX = left, oscY = barY - 64, oscW = w - pad * 2 - 24, oscH = 48;
    ctx.strokeStyle = `rgba(${L.rgb},0.16)`;
    ctx.lineWidth = 1;
    ctx.strokeRect(oscX, oscY, oscW, oscH);
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(oscX, oscY + (i / 4) * oscH);
      ctx.lineTo(oscX + oscW, oscY + (i / 4) * oscH);
      ctx.stroke();
    }
    ctx.beginPath();
    this.wave.forEach((v, i) => {
      const x = oscX + (i / (this.wave.length - 1)) * oscW;
      const y = oscY + oscH - v * oscH;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = rc.overload > 0 ? '#ffe66d' : L.main;
    ctx.lineWidth = 1.6;
    ctx.shadowBlur = 10 * rc.intensity;
    ctx.shadowColor = L.main;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // área sob a curva
    ctx.lineTo(oscX + oscW, oscY + oscH);
    ctx.lineTo(oscX, oscY + oscH);
    ctx.closePath();
    ctx.fillStyle = `rgba(${L.rgb},0.10)`;
    ctx.fill();
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillStyle = `rgba(${L.rgb},0.7)`;
    ctx.fillText('load avg', oscX + 6, oscY + 13);

    // ---- dump hexadecimal rolando na lateral ----
    this.hexT += rc.dt;
    if (this.hexT > (rc.running ? 0.12 : 0.6)) {
      this.hexT = 0;
      const row = Array.from({ length: 4 }, () =>
        Math.floor(Math.random() * 65536).toString(16).padStart(4, '0')).join(' ');
      this.hex.unshift(row);
      if (this.hex.length > 12) this.hex.pop();
    }
    ctx.font = '10.5px ui-monospace, monospace';
    const hexX = w - pad - 158;
    this.hex.forEach((row, i) => {
      ctx.fillStyle = `rgba(${L.rgb},${0.42 - i * 0.032})`;
      ctx.fillText(row, hexX, pad + 44 + i * 14);
    });
    ctx.font = '12.5px ui-monospace, monospace';

    // ---- mapa de memória (privilégio sudo em diante) ----
    if (L.memmap) {
      const mx = w - pad - 158, my = pad + 44 + 12 * 14 + 10;
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillStyle = `rgba(${L.rgb},0.55)`;
      ctx.fillText('mem map', mx, my - 4);
      const cols = 22, rows = 6, cell = 6;
      for (let i = 0; i < cols * rows; i++) {
        const used = ((i * 37 + Math.floor(t * (rc.running ? 1.5 : 0.2))) % 11) < (3 + progress * 6);
        ctx.fillStyle = used ? `rgba(${L.rgb},${0.25 + Math.random() * 0.35})` : 'rgba(90,110,100,0.16)';
        ctx.fillRect(mx + (i % cols) * cell, my + Math.floor(i / cols) * cell, cell - 1.5, cell - 1.5);
      }
      ctx.font = '12.5px ui-monospace, monospace';
    }

    // ---- LEDs de atividade ----
    for (let i = 0; i < 3; i++) {
      const on = rc.running && Math.sin(t * (6 + i * 4) + i) > 0.2;
      ctx.fillStyle = on ? [L.main, L.bright, '#ffe66d'][i] : 'rgba(60,90,75,0.5)';
      ctx.beginPath(); ctx.arc(w - pad - 46 + i * 13, barY + 36, 3, 0, TAU); ctx.fill();
    }

    // cursor
    if (Math.floor(t * 2) % 2 === 0) {
      ctx.fillStyle = L.bright;
      ctx.fillRect(left + 200, barY + 30, 8, 13);
    }

    // ---- rasgo de sinal atravessando a tela ----
    this.tear.life -= rc.dt * 2.2;
    if (this.tear.life <= 0 && !rc.reduceMotion && Math.random() < 0.25 * rc.dt * rc.intensity) {
      this.tear = { y: pad + Math.random() * (h - pad * 2), life: 1 };
    }
    if (this.tear.life > 0) {
      const th = 10 + Math.random() * 22;
      ctx.fillStyle = `rgba(${L.rgb},${this.tear.life * 0.16})`;
      ctx.fillRect(pad, this.tear.y, w - pad * 2, th);
      ctx.fillStyle = `rgba(255,60,120,${this.tear.life * 0.12})`;
      ctx.fillRect(pad + (Math.random() - 0.5) * 16, this.tear.y + 2, w - pad * 2, th * 0.4);
    }
    ctx.restore();

    if (rc.overload > 0.01) {
      ctx.fillStyle = `rgba(255,230,109,${rc.overload * 0.12})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  event(e: SceneEvent, rc: RenderCtx): void {
    if (e === 'complete') {
      this.lines.push({ text: 'process exited with code 0 — session persisted', ok: true, born: rc.t });
      if (this.lines.length > 9) this.lines.shift();
      this.glitch = 1;
    }
    if (e === 'reset') { this.lines.length = 0; this.lastPct = -1; }
    if (e === 'start') { this.lines.push({ text: 'exec /usr/bin/focus --deep', ok: true, born: rc.t }); }
  }
}

const curRank = (c: number): Tier => [...RANKS].reverse().find((r) => c >= r.at) ?? RANKS[0];
const nextRank = (c: number): Tier => RANKS.find((r) => r.at > c) ?? RANKS[RANKS.length - 1];

export const terminalTheme: ThemeModule = {
  id: 'terminal',
  name: 'TTY / Kernel',
  family: 'tech',
  tagline: 'Cada sessão é um processo. Você escala privilégios focando.',
  swatch: ['#03080a', '#3ee08a', '#7dffc0'],
  vars: {
    '--bg': '#03080a',
    '--bg-soft': '#061410',
    '--panel': 'rgba(4, 22, 16, 0.6)',
    '--panel-solid': '#04160f',
    '--border': 'rgba(62, 224, 138, 0.28)',
    '--border-strong': 'rgba(125, 255, 192, 0.6)',
    '--text': '#c6ffe2',
    '--text-dim': '#5f9c81',
    '--accent': '#3ee08a',
    '--accent-2': '#7dffc0',
    '--accent-ink': '#00190e',
    '--glow': 'rgba(62, 224, 138, 0.5)',
    '--danger': '#ff6b5f',
    '--ok': '#3ee08a',
    '--font-ui': "ui-monospace, 'SF Mono', 'JetBrains Mono', monospace",
    '--font-mono': "ui-monospace, 'SF Mono', monospace",
    '--font-display': "ui-monospace, monospace",
    '--radius': '3px',
    '--radius-card': '3px',
    '--radius-sm': '2px',
    '--letter': '0.04em',
    '--panel-blur': '6px',
    '--ui-transform': 'lowercase',
  },
  createScene: () => new TerminalScene(),
  // Sala de máquinas: ventoinha, zumbido elétrico e o disco trabalhando.
  ambience(k) {
    const fan = k.bed({ gain: 0.055, type: 'lowpass', freq: 240, q: 0.7 });
    const hum = k.drone({ freq: 60, type: 'sawtooth', gain: 0.030, filter: { type: 'lowpass', freq: 130, q: 4 } });
    const harm = k.drone({ freq: 120, type: 'sine', gain: 0.012 });
    const crt = k.drone({ freq: 1180, type: 'sine', gain: 0.0001, pan: 0.2 });   // chiado agudo do monitor

    k.lfo(fan.gainParam, 0.09, 0.010);          // a ventoinha oscila de leve
    if (hum.detune) k.lfo(hum.detune, 0.11, 3);

    // o disco procurando setores enquanto o processo roda
    k.every(1.6, 5.5, (st) => {
      if (!st.running) return;
      const clicks = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < clicks; i++) {
        audio.tone({ freq: 2400 + Math.random() * 900, type: 'square', dur: 0.010, gain: 0.020, delay: i * 0.055 });
      }
      if (Math.random() < 0.3) audio.noise({ dur: 0.07, gain: 0.014, type: 'bandpass', freq: 1800, q: 3, delay: 0.1 });
    });

    // rajada ocasional de transferência de dados
    k.every(18, 40, (st) => {
      if (!st.running) return;
      for (let i = 0; i < 7; i++) {
        audio.tone({ freq: 900 + Math.random() * 1400, type: 'square', dur: 0.03, gain: 0.014, delay: i * 0.045 });
      }
    });

    // relé no idle: a máquina esperando ordem
    k.every(7, 18, (st) => {
      if (st.running) return;
      audio.tone({ freq: 180, type: 'square', dur: 0.02, gain: 0.016 });
    });

    k.onState(({ running, progress }) => {
      fan.setGain(running ? 0.075 + progress * 0.035 : 0.040);
      fan.setFilter(240 + progress * 220);        // a ventoinha acelera com a carga
      hum.setGain(running ? 0.034 : 0.022);
      harm.setGain(running ? 0.016 : 0.008);
      crt.setGain(running ? 0.006 : 0.0001);
    });
  },

  sounds: {
    start() {
      audio.tone({ freq: 660, type: 'square', dur: 0.06, gain: 0.09 });
      audio.tone({ freq: 990, type: 'square', dur: 0.06, gain: 0.08, delay: 0.07 });
      audio.noise({ dur: 0.12, gain: 0.05, type: 'highpass', freq: 3000, delay: 0.14 });
    },
    pause() { audio.tone({ freq: 440, glideTo: 220, type: 'square', dur: 0.12, gain: 0.08 }); },
    complete(phase) {
      if (phase === 'focus') {
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
          audio.tone({ freq: f, type: 'square', dur: 0.09, gain: 0.09, delay: i * 0.08 }));
        audio.noise({ dur: 0.25, gain: 0.06, type: 'highpass', freq: 2500, delay: 0.34 });
      } else {
        audio.tone({ freq: 880, type: 'square', dur: 0.08, gain: 0.08 });
        audio.tone({ freq: 587.33, type: 'square', dur: 0.1, gain: 0.08, delay: 0.09 });
      }
    },
    tick() { audio.tone({ freq: 1760, type: 'square', dur: 0.015, gain: 0.025 }); },
    levelup() {
      [392, 523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
        audio.tone({ freq: f, type: 'square', dur: 0.07, gain: 0.08, delay: i * 0.06 }));
    },
    ui() { audio.tone({ freq: 1400, type: 'square', dur: 0.012, gain: 0.04 }); },
    warn() { audio.tone({ freq: 180, type: 'square', dur: 0.2, gain: 0.1 }); },
  },
  stageVars(level) {
    const L = look(level);
    return {
      '--accent': L.main,
      '--accent-2': L.bright,
      '--accent-ink': L.ink,
      '--glow': `rgba(${L.rgb}, 0.5)`,
      '--border': `rgba(${L.rgb}, 0.28)`,
      '--border-strong': `rgba(${L.rgb}, 0.6)`,
      '--text': level >= 3 ? '#f0ece0' : '#c6ffe2',
      '--text-dim': L.dim,
    };
  },
  stageName: (level) => (RANKS[Math.min(RANKS.length, Math.max(1, level)) - 1] ?? RANKS[0]).name,
  progression: {
    unit: 'processos',
    tiers: RANKS,
    gain: (_m, phase) => (phase === 'focus' ? 1 : 0),
    view(p, level) {
      const worn = RANKS[Math.min(RANKS.length, Math.max(1, level)) - 1] ?? RANKS[0];
      const c = curRank(p.counter), n = nextRank(p.counter);
      const span = Math.max(1, n.at - c.at);
      const pct = n.at > p.counter ? clamp((p.counter - c.at) / span) * 100 : 100;
      const bytes = Math.round(p.totalMinutes * 1024 * 37);
      return {
        title: `uid=${level} (${worn.name})`,
        headline: `${p.counter}`,
        sub: `processos concluídos · shell ${worn.name}`,
        barPct: pct,
        barLabel: n.at > p.counter ? `${n.at - p.counter} processos até ${n.name}` : 'privilégio máximo',
        stats: [
          { label: 'uptime', value: `${Math.floor(p.totalMinutes / 60)}h ${Math.round(p.totalMinutes % 60)}m` },
          { label: 'compilado', value: `${(bytes / 1e6).toFixed(1)} MB` },
          { label: 'pacotes', value: `${PACKAGES.filter((k) => p.counter >= k.at).length}/${PACKAGES.length}` },
        ],
        collection: PACKAGES.map((k) => ({
          id: k.id, name: k.name, icon: k.icon, desc: k.desc, unlocked: p.counter >= k.at,
        })),
      };
    },
    completionMessage(p, minutes) {
      return `exit 0 — ${minutes.toFixed(0)} min de cpu. shell atual: ${curRank(p.counter).name}.`;
    },
  },
  labels: {
    focus: 'exec', short: 'sleep', long: 'halt',
    start: 'run', pause: 'sigstop', resume: 'sigcont',
    reset: 'kill -9', notes: 'scratch.md', log: 'stdout',
  },
};

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

const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

interface Line { text: string; ok: boolean; born: number; }

class TerminalScene implements Scene {
  private lines: Line[] = [];
  private rain: { x: number; y: number; v: number; ch: string; len: number }[] = [];
  private glitch = 0;
  private lastPct = -1;

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
    ctx.strokeStyle = `rgba(0,255,140,${0.045 * rc.intensity})`;
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 44) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 44) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    // chuva de glifos
    ctx.font = '14px ui-monospace, monospace';
    const speed = rc.running ? 1 : 0.25;
    for (const r of this.rain) {
      if (!rc.reduceMotion) r.y += r.v * rc.dt * speed * (0.6 + rc.progress);
      if (r.y > h + r.len * 16) { r.y = -20; r.ch = String.fromCharCode(0x30a0 + Math.floor(Math.random() * 90)); }
      for (let i = 0; i < r.len; i++) {
        const a = (1 - i / r.len) * 0.5 * rc.intensity;
        ctx.fillStyle = i === 0 ? `rgba(190,255,220,${a + 0.35})` : `rgba(0,230,120,${a})`;
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
    const pct = Math.floor(progress * 100);

    if (rc.running && pct !== this.lastPct && pct % 5 === 0) {
      this.lastPct = pct;
      const task = TASKS[Math.floor(Math.random() * TASKS.length)];
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
    ctx.strokeStyle = 'rgba(0, 255, 140, 0.35)';
    ctx.lineWidth = 1;
    ctx.fillRect(pad, pad, w - pad * 2, h - pad * 2);
    ctx.strokeRect(pad + 0.5, pad + 0.5, w - pad * 2, h - pad * 2);

    // barra de título
    ctx.fillStyle = 'rgba(0, 255, 140, 0.14)';
    ctx.fillRect(pad, pad, w - pad * 2, 22);
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillStyle = '#7dffc0';
    const rank = [...RANKS].reverse().find((r) => rc.counter >= r.at) ?? RANKS[0];
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
      ctx.fillStyle = '#3ee08a';
      ctx.fillText('[ OK ]', left, y);
      ctx.fillStyle = '#a8e8c8';
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
    ctx.fillStyle = '#7dffc0';
    ctx.fillText(barStr, left, barY);
    ctx.fillStyle = rc.overload > 0 ? '#ffe66d' : '#3ee08a';
    ctx.fillText(pctStr, left + ctx.measureText(barStr).width + 14, barY);

    // spinner + estado
    const spin = SPIN[Math.floor(t * 10) % SPIN.length];
    ctx.fillStyle = rc.running ? '#7dffc0' : '#5a7a6a';
    const state = rc.running ? `${spin} running` : progress > 0 ? '‖ suspended (SIGSTOP)' : '● idle';
    ctx.fillText(state, left, barY + 22);

    // uso simulado de CPU
    const cpu = rc.running ? 40 + Math.sin(t * 3) * 12 + progress * 40 : 3;
    ctx.fillStyle = '#5ac8a0';
    ctx.fillText(`cpu ${cpu.toFixed(0)}%  mem ${(180 + progress * 320).toFixed(0)}M  thr ${4 + rc.level}`, left, barY + 40);

    // cursor
    if (Math.floor(t * 2) % 2 === 0) {
      ctx.fillStyle = '#7dffc0';
      ctx.fillRect(left + 200, barY + 30, 8, 13);
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
    if (e === 'reset' || e === 'skip') { this.lines.length = 0; this.lastPct = -1; }
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
  progression: {
    unit: 'processos',
    tiers: RANKS,
    gain: (_m, phase) => (phase === 'focus' ? 1 : 0),
    view(p) {
      const c = curRank(p.counter), n = nextRank(p.counter);
      const span = Math.max(1, n.at - c.at);
      const pct = n.at > p.counter ? clamp((p.counter - c.at) / span) * 100 : 100;
      const bytes = Math.round(p.totalMinutes * 1024 * 37);
      return {
        title: `uid=${p.level} (${c.name})`,
        headline: `${p.counter}`,
        sub: `processos concluídos · shell ${c.name}`,
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
    reset: 'kill -9', skip: 'next', notes: 'scratch.md', log: 'stdout',
  },
};

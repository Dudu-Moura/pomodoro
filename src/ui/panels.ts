import { store, todayKey } from '../core/store';
import { getTheme } from '../themes';
import { ACHIEVEMENTS } from '../core/gamification';
import type { FocusMark } from '../core/types';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const hhmm = (ts: number): string =>
  new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function renderTop(): void {
  const s = store.state;
  $('stat-streak').textContent = String(s.streak.count);
  const done = store.marksToday().filter((m) => m.completed).length;
  $('stat-today').textContent = `${done}/${s.settings.dailyGoal}`;
  const snd = $('btn-sound');
  snd.textContent = s.settings.soundOn ? '♪' : '✕';
  snd.classList.toggle('off', !s.settings.soundOn);
}

export function renderProgress(): void {
  const theme = getTheme(store.theme);
  const v = theme.progression.view(store.themeProgress, store.activeLevel());
  $('prog-title').textContent = v.title;
  $('prog-sub').textContent = v.sub;
  $('prog-headline').textContent = v.headline;
  $('prog-bar').style.width = `${v.barPct}%`;
  $('prog-bar-label').textContent = v.barLabel;
  $('prog-stats').innerHTML = v.stats
    .map((st) => `<div class="pstat"><b>${esc(st.value)}</b><span>${esc(st.label)}</span></div>`)
    .join('');
}

export function renderLog(): void {
  const list = $('log-list');
  const logs = store.state.logs.slice(0, 120);
  if (!logs.length) {
    list.innerHTML = `<li class="kind-system"><span class="log-time">--:--</span><span class="log-text" style="opacity:.6">nenhum registro ainda. inicie uma sessão.</span></li>`;
    return;
  }
  list.innerHTML = logs
    .map((l) => `<li class="kind-${l.kind}"><span class="log-time">${hhmm(l.ts)}</span><span class="log-text">${esc(l.text)}</span></li>`)
    .join('');
}

export function renderMarks(): void {
  const pane = $('pane-marks');
  const marks = store.state.marks.filter((m) => m.phase === 'focus').slice(0, 60);
  const totalToday = store.marksToday().reduce((a, m) => a + m.minutes, 0);
  const head = `<div class="section-title">marcas de foco · hoje ${Math.round(totalToday)} min</div>`;
  if (!marks.length) {
    pane.innerHTML = head + `<div class="hint" style="padding:8px 2px">Cada sessão de foco concluída vira uma marca aqui, com horário, duração e tarefa.</div>`;
    return;
  }
  pane.innerHTML = head + marks.map((m: FocusMark) => `
    <div class="mark ${m.completed ? '' : 'aborted'}">
      <div class="mark-bar"></div>
      <div class="mark-main">
        <div class="mark-task">${esc(m.task || 'sem tarefa definida')}</div>
        <div class="mark-meta">${hhmm(m.ts)}–${hhmm(m.end)} · ${getTheme(m.theme).name}${m.completed ? '' : ' · interrompida'}</div>
      </div>
      <div class="mark-min">${Math.round(m.minutes)}m</div>
    </div>`).join('');
}

export function renderCollection(): void {
  const theme = getTheme(store.theme);
  const p = store.themeProgress;
  const v = theme.progression.view(p, store.activeLevel());
  const tiers = theme.progression.tiers;

  const coll = v.collection.map((c) => `
    <div class="coll ${c.unlocked ? 'on' : 'locked'}">
      <div class="coll-icon">${c.unlocked ? c.icon : '?'}</div>
      <div><div class="coll-name">${c.unlocked ? esc(c.name) : '???'}</div><div class="coll-desc">${c.unlocked ? esc(c.desc) : 'bloqueado'}</div></div>
    </div>`).join('');

  const active = store.activeLevel();
  const auto = (p.stagePick ?? 0) === 0;
  const tierHtml = tiers.map((t, i) => {
    const level = i + 1;
    const on = level <= p.level;
    const isActive = on && level === active;
    return `<button type="button" class="coll stage ${on ? 'on' : 'locked'} ${isActive ? 'active' : ''}"
      ${on ? `data-stage="${level}"` : 'disabled'} title="${on ? 'Usar este estágio' : 'Ainda bloqueado'}">
      <div class="coll-icon">${t.icon}</div>
      <div><div class="coll-name">${esc(t.name)}${isActive ? ' <span class="chip">em uso</span>' : ''}</div>
      <div class="coll-desc">${on ? esc(t.desc) : `requer ${t.at} ${theme.progression.unit}`}</div></div>
    </button>`;
  }).join('');

  $('pane-collection').innerHTML =
    `<div class="section-title">estágios — ${esc(theme.name)}
       <button type="button" class="btn ghost xs stage-auto ${auto ? 'on' : ''}" data-stage="0">${auto ? '✓ ' : ''}automático</button>
     </div>
     <div class="hint" style="margin:-4px 0 8px">Clique num estágio desbloqueado para usar o visual dele. No automático, sempre o mais recente.</div>
     <div class="coll-grid">${tierHtml}</div>
     <div class="section-title" style="margin-top:14px">coleção (${v.collection.filter((c) => c.unlocked).length}/${v.collection.length})</div>
     <div class="coll-grid">${coll}</div>`;
}

export function renderStats(): void {
  const s = store.state;
  const days: { key: string; label: string; min: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    days.push({ key: todayKey(d), label: ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'][d.getDay()], min: 0 });
  }
  for (const m of s.marks) {
    if (m.phase !== 'focus') continue;
    const k = todayKey(new Date(m.ts));
    const d = days.find((x) => x.key === k);
    if (d) d.min += m.minutes;
  }
  const max = Math.max(25, ...days.map((d) => d.min));
  const spark = days.map((d) => `<i style="height:${Math.max(2, (d.min / max) * 100)}%" title="${Math.round(d.min)} min"></i>`).join('');
  const labels = days.map((d) => `<span>${d.label}</span>`).join('');

  const perTheme = (['orbit', 'blackhole', 'terminal', 'reactor'] as const)
    .map((id) => `<div class="pstat"><b>${Math.round(s.progress[id].totalMinutes)}m</b><span>${esc(getTheme(id).name)}</span></div>`).join('');

  const unlocked = ACHIEVEMENTS.filter((a) => a.test(s));
  const ach = ACHIEVEMENTS.map((a) => {
    const on = unlocked.includes(a);
    return `<div class="coll ${on ? 'on' : 'locked'}">
      <div class="coll-icon">${a.icon}</div>
      <div><div class="coll-name">${esc(a.name)}</div><div class="coll-desc">${esc(a.desc)}</div></div>
    </div>`;
  }).join('');

  const todayMin = Math.round(store.marksToday().reduce((a, m) => a + m.minutes, 0));
  const hours = Math.floor(s.totals.focusMinutes / 60);

  $('pane-stats').innerHTML = `
    <div class="section-title">últimos 7 dias</div>
    <div class="spark">${spark}</div>
    <div class="spark-labels">${labels}</div>
    <div class="stat-grid">
      <div class="pstat"><b>${todayMin} min</b><span>hoje</span></div>
      <div class="pstat"><b>${s.totals.sessions}</b><span>sessões totais</span></div>
      <div class="pstat"><b>${hours}h ${Math.round(s.totals.focusMinutes % 60)}m</b><span>foco acumulado</span></div>
      <div class="pstat"><b>${s.streak.count} dias</b><span>sequência</span></div>
    </div>
    <div class="section-title">tempo por tema</div>
    <div class="stat-grid">${perTheme}</div>
    <div class="section-title">conquistas (${unlocked.length}/${ACHIEVEMENTS.length})</div>
    <div class="coll-grid">${ach}</div>`;
}

export function renderAll(): void {
  renderTop();
  renderProgress();
  renderLog();
  renderMarks();
  renderCollection();
  renderStats();
}

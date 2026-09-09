import './styles/main.css';
import { store } from './core/store';
import { saveRemote } from './core/sync';
import { timer } from './core/timer';
import { audio } from './core/audio';
import { ambience } from './core/ambience';
import { applySession } from './core/gamification';
import { pushToPhone } from './core/push';
import { getTheme, themeList } from './themes';
import { Renderer } from './ui/renderer';
import { toast } from './ui/toasts';
import { buildSettings } from './ui/settings';
import { renderAll, renderLog, renderMarks, renderProgress, renderStats, renderTop, renderCollection } from './ui/panels';
import type { Phase, ThemeId } from './core/types';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;

const MARKS: Record<ThemeId, string> = { orbit: '☉', blackhole: '◍', terminal: '▮', reactor: '⬢' };

const renderer = new Renderer($<HTMLCanvasElement>('bg-canvas'), $<HTMLCanvasElement>('stage-canvas'));

let sessionStart = 0;
let sessionTask = '';

/* ---------------- tema ---------------- */

function applyTheme(id: ThemeId, announce = false): void {
  const theme = getTheme(id);
  store.setSettings({ theme: id });
  document.documentElement.dataset.theme = id;
  for (const [k, v] of Object.entries(theme.vars)) document.documentElement.style.setProperty(k, v);
  applyStageVars();

  $('brand-mark').textContent = MARKS[id];
  $('brand-tag').textContent = theme.name;
  $('notes-title').textContent = theme.labels.notes;
  ($('task-input') as HTMLInputElement).placeholder =
    id === 'terminal' ? 'defina o processo em execução…' : 'No que você está focando agora?';
  (document.querySelector('.tab[data-tab="log"]') as HTMLElement).textContent = theme.labels.log;

  renderer.setTheme(id);
  ambience.build(id, theme.ambience);
  ambience.update(timer.running, timer.progress, timer.phase);
  buildThemeSwitch();
  buildPhaseTabs();
  updateControls();
  updateReadout();
  renderProgress();
  renderCollection();
  renderStats();

  if (announce) {
    theme.sounds.ui();
    toast(MARKS[id], theme.name, theme.tagline, 4200);
    store.log(`tema alterado para ${theme.name}`);
    renderLog();
  }
}

/** Repinta a UI conforme o estágio desbloqueado no tema atual. */
function applyStageVars(): void {
  const theme = getTheme(store.theme);
  const vars = theme.stageVars(store.activeLevel());
  for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
}

/** Anúncio de evolução: a tela inteira reage à mudança de estágio. */
function celebrateStage(name: string): void {
  applyStageVars();
  const el = document.createElement('div');
  el.className = 'stage-up';
  el.innerHTML = `<div class="stage-up-inner"><span class="stage-up-kicker">novo estágio</span><strong></strong></div>`;
  (el.querySelector('strong') as HTMLElement).textContent = name;
  document.body.appendChild(el);
  window.setTimeout(() => el.classList.add('out'), 2600);
  window.setTimeout(() => el.remove(), 3400);
  renderer.event('levelup');
}

function buildThemeSwitch(): void {
  const host = $('theme-switch');
  host.innerHTML = '';
  for (const t of themeList) {
    const b = document.createElement('button');
    b.className = 'theme-btn' + (t.id === store.theme ? ' active' : '');
    b.title = t.tagline;
    b.innerHTML = `<span class="dots">${t.swatch.map((c) => `<span class="dot" style="background:${c}"></span>`).join('')}</span>
      <span>${t.name}</span><span class="fam">${t.family === 'cosmic' ? 'cosmos' : 'tech'}</span>`;
    b.addEventListener('click', () => { audio.unlock(); applyTheme(t.id, true); });
    host.append(b);
  }
}

/* ---------------- fases ---------------- */

function buildPhaseTabs(): void {
  const theme = getTheme(store.theme);
  const host = $('phase-tabs');
  host.innerHTML = '';
  const defs: { p: Phase; label: string }[] = [
    { p: 'focus', label: theme.labels.focus },
    { p: 'short', label: theme.labels.short },
    { p: 'long', label: theme.labels.long },
  ];
  for (const d of defs) {
    const b = document.createElement('button');
    b.className = 'phase-tab' + (timer.phase === d.p ? ' active' : '');
    b.textContent = d.label;
    b.addEventListener('click', () => {
      audio.unlock();
      if (timer.running && !confirm('Trocar de fase agora vai descartar a sessão em andamento. Continuar?')) return;
      closeSession(false);
      timer.setPhase(d.p);
      theme.sounds.ui();
    });
    host.append(b);
  }
}

/* ---------------- readout ---------------- */

const fmt = (ms: number): string => {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return store.state.settings.showSeconds
    ? `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m + (s > 0 ? 1 : 0)} min`;
};

function updateReadout(): void {
  const theme = getTheme(store.theme);
  const label = theme.labels[timer.phase];
  $('readout-phase').textContent = label;
  $('readout-time').textContent = fmt(timer.remaining);
  const every = store.state.settings.longEvery;
  const left = every - (timer.cycle % every);
  $('readout-sub').textContent =
    timer.phase === 'focus'
      ? `ciclo ${timer.cycle + 1} · pausa longa em ${left}`
      : `descanso · a seguir: ${theme.labels.focus}`;

  document.title = `${fmt(timer.remaining)} · ${label} — Pomodoro Cosmos`;

  const card = document.querySelector('.timer-card') as HTMLElement;
  card.classList.toggle('overload', timer.progress > 0.9 && timer.running);
  (document.querySelector('.readout') as HTMLElement).classList.toggle('zen', store.state.settings.hideTime);

  const dots = $('cycle-dots');
  if (dots.children.length !== every) {
    dots.innerHTML = Array.from({ length: every }, () => '<span class="cdot"></span>').join('');
  }
  Array.from(dots.children).forEach((c, i) => c.classList.toggle('on', i < timer.cycle % every || (timer.cycle > 0 && timer.cycle % every === 0)));
}

function updateControls(): void {
  const theme = getTheme(store.theme);
  const btn = $<HTMLButtonElement>('btn-toggle');
  btn.textContent = timer.running
    ? theme.labels.pause
    : timer.progress > 0 ? theme.labels.resume : theme.labels.start;
  $('btn-reset').textContent = theme.labels.reset;
  Array.from($('phase-tabs').children).forEach((el, i) => {
    el.classList.toggle('active', (['focus', 'short', 'long'] as Phase[])[i] === timer.phase);
  });
}

/* ---------------- sessões ---------------- */

function openSession(): void {
  sessionStart = Date.now();
  sessionTask = ($('task-input') as HTMLInputElement).value.trim();
  store.state.task = sessionTask;
}

/** Registra uma marca quando a fase termina (naturalmente ou não). */
function closeSession(completed: boolean): void {
  const minutes = timer.elapsedMinutes;
  if (!sessionStart || (!completed && minutes < 0.5)) { sessionStart = 0; return; }
  store.addMark({
    id: crypto.randomUUID(),
    ts: sessionStart,
    end: Date.now(),
    minutes,
    phase: timer.phase,
    theme: store.theme,
    task: sessionTask,
    completed,
  });
  if (!completed && timer.phase === 'focus') {
    store.log(`sessão interrompida após ${minutes.toFixed(0)} min`, 'system');
    applySession('focus', minutes, false);
  }
  sessionStart = 0;
  renderMarks(); renderStats(); renderTop(); renderProgress(); renderLog();
}

function notify(title: string, body: string): void {
  if (!store.state.settings.notifications) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try { new Notification(title, { body, silent: true }); } catch { /* ignora */ }
}

/* ---------------- eventos do timer ---------------- */

timer.on((e) => {
  const theme = getTheme(store.theme);

  switch (e.type) {
    case 'start':
      openSession();
      theme.sounds.start();
      renderer.event('start');
      store.log(`início · ${theme.labels[e.phase]}${sessionTask ? ` — ${sessionTask}` : ''}`);
      renderLog();
      break;

    case 'resume':
      theme.sounds.start();
      renderer.event('resume');
      break;

    case 'pause':
      theme.sounds.pause();
      renderer.event('pause');
      store.log(`pausado em ${fmt(timer.remaining)} restantes`);
      renderLog();
      break;

    case 'reset':
      renderer.event('reset');
      break;

    case 'tick': {
      updateReadout();
      const st = store.state.settings;
      if (st.tickSound && timer.running) theme.sounds.tick();
      const secs = Math.ceil(e.remaining / 1000);
      if (secs === 10 && timer.phase === 'focus') theme.sounds.warn();
      break;
    }

    case 'complete': {
      const minutes = e.minutes;
      closeSession(true);
      theme.sounds.complete(e.phase);
      renderer.event('complete');
      const card = document.querySelector('.timer-card') as HTMLElement;
      card.classList.add('shake');
      window.setTimeout(() => card.classList.remove('shake'), 600);

      const out = applySession(e.phase, minutes, true);

      if (e.phase === 'focus') {
        store.touchStreak();
        store.log(out.message, 'reward');
        toast(MARKS[store.theme], `Sessão concluída · ${theme.labels.focus}`, out.message, 6000);
        notify('Sessão concluída', out.message);
        void pushToPhone(
          `Foco concluído — ${minutes.toFixed(0)} min`,
          `${sessionTask || 'sem tarefa definida'}\n${out.message}`,
        ).then((r) => {
          if (!r.ok && r.error !== 'desligado') store.log(`falha ao avisar o celular: ${r.error}`, 'system');
        });
      } else {
        store.log(`pausa concluída — a seguir: ${theme.labels.focus}`);
        notify('Pausa concluída', `Hora de retomar: ${theme.labels.focus}.`);
      }

      if (out.levelUp) {
        const up = out.levelUp;
        store.state.progress[store.theme].stagePick = 0;   // mostra a novidade
        window.setTimeout(() => {
          theme.sounds.levelup();
          celebrateStage(up.name);
          toast('★', `Novo estágio: ${up.name}`, up.desc, 8000);
          store.log(`nível ${up.to} alcançado: ${up.name} — visual e efeitos atualizados`, 'reward');
          renderLog();
        }, 900);
      }
      out.unlocks.forEach((u, i) => {
        window.setTimeout(() => {
          toast(u.icon, `Desbloqueado: ${u.name}`, u.desc, 7000);
          store.log(`desbloqueado: ${u.name}`, 'reward');
          renderLog();
        }, 1500 + i * 700);
      });
      out.achievements.forEach((a, i) => {
        window.setTimeout(() => {
          toast(a.icon, `Conquista: ${a.name}`, a.desc, 7000);
          store.log(`conquista: ${a.name}`, 'reward');
          renderLog();
        }, 2200 + i * 800);
      });

      renderAll();
      break;
    }

    case 'phase':
      buildPhaseTabs();
      break;
  }

  ambience.update(timer.running, timer.progress, timer.phase);
  updateControls();
  updateReadout();
});

/* ---------------- controles ---------------- */

$('btn-toggle').addEventListener('click', () => { audio.unlock(); timer.toggle(); });
$('btn-reset').addEventListener('click', () => {
  audio.unlock();
  if (timer.progress > 0.02 && !confirm('Reiniciar a fase atual? O progresso desta sessão será descartado.')) return;
  closeSession(false);
  timer.reset();
  getTheme(store.theme).sounds.ui();
});

$('btn-sound').addEventListener('click', () => {
  const on = !store.state.settings.soundOn;
  store.setSettings({ soundOn: on });
  audio.applyVolumes();
  if (on) { audio.unlock(); getTheme(store.theme).sounds.ui(); }
  renderTop();
});

// qualquer mudança de volume/ambiente nas configurações reflete na hora
let volSig = '';
store.subscribe((st) => {
  const sig = `${st.settings.soundOn}|${st.settings.volume}|${st.settings.ambience}|${st.settings.ambienceVolume}`;
  if (sig === volSig) return;
  volSig = sig;
  audio.applyVolumes();
});

// o navegador só libera áudio depois de um gesto: o primeiro serve para tudo
const firstGesture = (): void => {
  audio.unlock();
  audio.applyVolumes();
  window.removeEventListener('pointerdown', firstGesture);
  window.removeEventListener('keydown', firstGesture);
};
window.addEventListener('pointerdown', firstGesture);
window.addEventListener('keydown', firstGesture);

($('task-input') as HTMLInputElement).addEventListener('input', (ev) => {
  store.state.task = (ev.target as HTMLInputElement).value;
  sessionTask = store.state.task.trim();
  store.emit();
});

/* ---------------- notas e log ---------------- */

const notes = $<HTMLTextAreaElement>('notes');
notes.value = store.state.notes;
const updateNotesCount = (): void => {
  $('notes-count').textContent = `${notes.value.length} caracteres`;
};
updateNotesCount();
notes.addEventListener('input', () => {
  store.state.notes = notes.value;
  updateNotesCount();
  store.emit();
});
$('btn-notes-clear').addEventListener('click', () => {
  if (!notes.value || !confirm('Apagar todas as anotações?')) return;
  notes.value = '';
  store.state.notes = '';
  updateNotesCount();
  store.emit();
});

const logInput = $<HTMLInputElement>('log-input');
const addLog = (): void => {
  const v = logInput.value.trim();
  if (!v) return;
  store.log(v, 'user');
  logInput.value = '';
  getTheme(store.theme).sounds.ui();
  renderLog();
  renderStats();
};
$('btn-log-add').addEventListener('click', addLog);
logInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addLog(); });

/* ---------------- abas ---------------- */

// escolher manualmente um estágio já desbloqueado
$('pane-collection').addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('[data-stage]') as HTMLElement | null;
  if (!btn) return;
  const level = Number(btn.dataset.stage);
  store.pickStage(level);
  applyStageVars();
  renderCollection();
  renderProgress();
  const theme = getTheme(store.theme);
  theme.sounds.ui();
  const active = store.activeLevel();
  toast(theme.progression.tiers[active - 1]?.icon ?? '★',
    level === 0 ? 'Estágio automático' : `Estágio: ${theme.stageName(active)}`,
    level === 0 ? 'Sempre o mais recente desbloqueado.' : 'Visual, efeitos e cores aplicados.', 3600);
});

$('tabbar').addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('.tab') as HTMLElement | null;
  if (!btn) return;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === btn));
  const id = btn.dataset.tab;
  document.querySelectorAll('.tab-pane').forEach((p) => p.classList.toggle('active', p.id === `pane-${id}`));
  getTheme(store.theme).sounds.ui();
});

/* ---------------- configurações ---------------- */

const modal = $<HTMLDialogElement>('settings-modal');
const openSettings = (): void => {
  buildSettings(
    (id) => applyTheme(id, true),
    () => { timer.syncDurations(); updateReadout(); },
  );
  modal.showModal();
};
$('btn-settings').addEventListener('click', () => { audio.unlock(); openSettings(); });

$('btn-export').addEventListener('click', () => {
  store.flush();
  const blob = new Blob([JSON.stringify(store.state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `pomodoro-cosmos-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('⤓', 'Backup exportado', 'Arquivo JSON salvo com todo o seu histórico.');
});

const importFile = $<HTMLInputElement>('import-file');
$('btn-import').addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async () => {
  const f = importFile.files?.[0];
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    data.savedAt = Date.now();                 // vence o arquivo atual no hydrate
    localStorage.setItem('pomodoro-cosmos:v1', JSON.stringify(data));
    await saveRemote(data);
    location.reload();
  } catch {
    toast('⚠', 'Falha ao importar', 'O arquivo não é um backup válido.');
  }
});

$('btn-reset-progress').addEventListener('click', async () => {
  if (!confirm(
    'Zerar a progressão de TODOS os temas: níveis, estágios, coleções, sequência de dias e marcas de foco.\n\n'
    + 'Suas anotações, o registro e as configurações são preservados.\n\nContinuar?')) return;
  store.resetProgress();
  await saveRemote(store.state);
  store.log('progressão reiniciada a pedido', 'system');
  applyStageVars();
  renderAll();
  getTheme(store.theme).sounds.ui();
  toast('↺', 'Progresso reiniciado', 'Todos os temas voltaram ao primeiro estágio.', 5000);
});

$('btn-wipe').addEventListener('click', async () => {
  if (!confirm('Isso apaga histórico, progresso, conquistas e anotações — inclusive o arquivo em disco. Não dá para desfazer. Continuar?')) return;
  store.reset();
  await saveRemote(store.state);
  location.reload();
});

/* ---------------- atalhos ---------------- */

document.addEventListener('keydown', (e) => {
  const el = document.activeElement;
  const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
  if (typing && e.key !== 'Escape') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  switch (e.key.toLowerCase()) {
    case ' ': e.preventDefault(); audio.unlock(); timer.toggle(); break;
    case 'r': $('btn-reset').click(); break;
    case 'n': e.preventDefault(); notes.focus(); break;
    case 'm': $('btn-sound').click(); break;
    case 'h': {
      const hide = !store.state.settings.hideTime;
      store.setSettings({ hideTime: hide });
      updateReadout();
      getTheme(store.theme).sounds.ui();
      toast(hide ? '◌' : '◉', hide ? 'Modo zen' : 'Relógio visível', hide ? 'Só a arte do tema. H para voltar.' : '', 2600);
      break;
    }
    case ',': e.preventDefault(); openSettings(); break;
    case '1': case '2': case '3': case '4': {
      const t = themeList[Number(e.key) - 1];
      if (t) { audio.unlock(); applyTheme(t.id, true); }
      break;
    }
    case 'escape': if (modal.open) modal.close(); else (el as HTMLElement)?.blur(); break;
  }
});

window.addEventListener('beforeunload', () => store.flush());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { store.flush(); return; }
  timer.sync();   // recupera o atraso acumulado enquanto a aba esteve oculta
  void store.remoteIsNewer().then((newer) => {
    if (newer) {
      toast('⟳', 'Progresso mais novo no disco', 'Outra aba gravou depois desta. Recarregue a página para carregar a versão do arquivo.', 12000);
    }
  });
});

/* ---------------- boot ---------------- */

function renderSyncBadge(): void {
  const el = $('stat-sync');
  const label = $('stat-sync-label');
  if (store.mode === 'disco') {
    label.textContent = 'disco';
    el.title = 'Progresso gravado em data/progress.json — sobrevive a limpar o navegador.';
    el.style.opacity = '1';
  } else {
    label.textContent = 'navegador';
    el.title = 'Sem servidor de arquivo: salvo só no localStorage desta origem. '
      + 'Rode com `npm run dev` para gravar em disco, ou exporte um backup.';
    el.style.opacity = '.6';
  }
}

// o arquivo em disco é a fonte da verdade: reconcilia antes de desenhar qualquer coisa
const mode = await store.hydrate();
timer.syncDurations();

($('task-input') as HTMLInputElement).value = store.state.task;
notes.value = store.state.notes;
updateNotesCount();
applyTheme(store.theme);
renderAll();
renderSyncBadge();
renderer.start();
updateReadout();

if (!store.state.logs.length) {
  store.log('sistema iniciado — escolha um tema e comece uma sessão');
  renderLog();
}
if (mode === 'navegador') {
  toast('⚠', 'Salvando só no navegador', 'Sem servidor de arquivo. Limpar os dados do navegador apaga o progresso — exporte um backup em Configurações.', 9000);
}

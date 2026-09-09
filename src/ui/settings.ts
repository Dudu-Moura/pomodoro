import { store } from '../core/store';
import { themeList } from '../themes';
import type { Settings, ThemeId } from '../core/types';
import { sendPush } from '../core/push';

type Row =
  | { kind: 'text'; key: keyof Settings; label: string; desc?: string; placeholder?: string }
  | { kind: 'choice'; key: keyof Settings; label: string; desc?: string; options: { value: string; label: string }[] }
  | { kind: 'action'; label: string; desc?: string; button: string; run: (feedback: (msg: string, ok: boolean) => void) => void }
  | { kind: 'num'; key: keyof Settings; label: string; desc?: string; min: number; max: number; step?: number; suffix?: string }
  | { kind: 'bool'; key: keyof Settings; label: string; desc?: string }
  | { kind: 'range'; key: keyof Settings; label: string; desc?: string; min: number; max: number; step: number }
  | { kind: 'theme'; label: string; desc?: string };

const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: 'Tempos',
    rows: [
      { kind: 'num', key: 'focusMin', label: 'Duração do foco', desc: 'Minutos por sessão de trabalho profundo.', min: 1, max: 180 },
      { kind: 'num', key: 'shortMin', label: 'Pausa curta', desc: 'Minutos de descanso entre focos.', min: 1, max: 60 },
      { kind: 'num', key: 'longMin', label: 'Pausa longa', desc: 'Descanso maior ao fechar o ciclo.', min: 1, max: 120 },
      { kind: 'num', key: 'longEvery', label: 'Focos até a pausa longa', desc: 'Quantas sessões formam um ciclo completo.', min: 1, max: 12 },
    ],
  },
  {
    title: 'Fluxo',
    rows: [
      { kind: 'bool', key: 'autoStartBreaks', label: 'Iniciar pausas automaticamente' },
      { kind: 'bool', key: 'autoStartFocus', label: 'Iniciar focos automaticamente', desc: 'Encadeia sessões sem clique. Use com cuidado.' },
      { kind: 'num', key: 'dailyGoal', label: 'Meta diária de sessões', min: 1, max: 24 },
      { kind: 'bool', key: 'showSeconds', label: 'Mostrar segundos no relógio' },
      { kind: 'bool', key: 'notifications', label: 'Notificações do sistema', desc: 'Avisa mesmo com a aba em segundo plano.' },
    ],
  },
  {
    title: 'Áudio',
    rows: [
      { kind: 'bool', key: 'soundOn', label: 'Efeitos sonoros', desc: 'Sons sintetizados, diferentes em cada tema.' },
      { kind: 'range', key: 'volume', label: 'Volume', min: 0, max: 1, step: 0.05 },
      { kind: 'bool', key: 'tickSound', label: 'Tique a cada segundo', desc: 'Pulso discreto enquanto o tempo corre.' },
      { kind: 'bool', key: 'ambience', label: 'Som ambiente', desc: 'Paisagem sonora contínua de cada tema, que muda entre repouso e sessão em andamento.' },
      { kind: 'range', key: 'ambienceVolume', label: 'Volume do ambiente', min: 0, max: 1, step: 0.05 },
    ],
  },
  {
    title: 'Avisar no celular',
    rows: [
      { kind: 'bool', key: 'notifyPhone', label: 'Avisar quando um foco terminar', desc: 'Manda um push para o celular ao fim de cada sessão de foco. Exige o app rodando por npm run dev / preview.' },
      {
        kind: 'choice', key: 'notifyProvider', label: 'Serviço',
        desc: 'ntfy é grátis e sem conta: instale o app ntfy, assine um tópico e use o mesmo nome aqui.',
        options: [{ value: 'ntfy', label: 'ntfy' }, { value: 'webhook', label: 'Webhook (Discord, Slack…)' }],
      },
      { kind: 'text', key: 'notifyTarget', label: 'Tópico ou URL', placeholder: 'pomodoro-eduardo-x7k2', desc: 'No ntfy, escolha um nome longo e difícil de adivinhar: quem souber o tópico recebe (e envia) suas mensagens.' },
      {
        kind: 'action', label: 'Enviar um teste agora', button: 'testar',
        desc: 'Dispara um aviso real para o destino configurado.',
        run: (feedback) => {
          void sendPush('Pomodoro Cosmos', 'Teste de aviso — se você leu isso no celular, está funcionando.')
            .then((r) => feedback(r.ok ? `enviado via ${r.host ?? 'destino'}` : `falhou: ${r.error}`, r.ok));
        },
      },
    ],
  },
  {
    title: 'Visual',
    rows: [
      { kind: 'theme', label: 'Tema ativo', desc: 'Muda cores, fontes, sons, efeitos e o sistema de progresso.' },
      { kind: 'bool', key: 'hideTime', label: 'Esconder o relógio (modo zen)', desc: 'Some com os dígitos e deixa só a arte do tema. Atalho: H.' },
      { kind: 'range', key: 'effects', label: 'Intensidade dos efeitos', desc: 'Brilho, partículas e pós-processamento.', min: 0, max: 1, step: 0.05 },
      { kind: 'bool', key: 'reduceMotion', label: 'Reduzir movimento', desc: 'Congela animações de fundo. Melhora desempenho.' },
    ],
  },
];

export function buildSettings(onThemeChange: (id: ThemeId) => void, onDurations: () => void): void {
  const body = document.getElementById('settings-body') as HTMLElement;
  body.innerHTML = '';

  for (const g of GROUPS) {
    const sec = document.createElement('div');
    sec.className = 'set-group';
    sec.innerHTML = `<h3>${g.title}</h3>`;

    for (const row of g.rows) {
      const el = document.createElement('div');
      el.className = 'set-row';
      const left = document.createElement('div');
      left.innerHTML = `<div class="set-label">${row.label}</div>${row.desc ? `<div class="set-desc">${row.desc}</div>` : ''}`;
      const ctl = document.createElement('div');
      ctl.className = 'set-ctl';

      if (row.kind === 'num') {
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.min = String(row.min); inp.max = String(row.max);
        inp.value = String(store.state.settings[row.key]);
        inp.addEventListener('change', () => {
          const v = Math.min(row.max, Math.max(row.min, Number(inp.value) || row.min));
          inp.value = String(v);
          store.setSettings({ [row.key]: v } as Partial<Settings>);
          onDurations();
        });
        ctl.append(inp);
      } else if (row.kind === 'bool') {
        const lab = document.createElement('label');
        lab.className = 'switch';
        const inp = document.createElement('input');
        inp.type = 'checkbox';
        inp.checked = Boolean(store.state.settings[row.key]);
        const track = document.createElement('span');
        track.className = 'track';
        inp.addEventListener('change', async () => {
          if (row.key === 'notifications' && inp.checked && 'Notification' in window) {
            const perm = await Notification.requestPermission();
            if (perm !== 'granted') inp.checked = false;
          }
          store.setSettings({ [row.key]: inp.checked } as Partial<Settings>);
        });
        lab.append(inp, track);
        ctl.append(lab);
      } else if (row.kind === 'range') {
        const inp = document.createElement('input');
        inp.type = 'range';
        inp.min = String(row.min); inp.max = String(row.max); inp.step = String(row.step);
        inp.value = String(store.state.settings[row.key]);
        const out = document.createElement('span');
        out.className = 'hint';
        const show = (): void => { out.textContent = `${Math.round(Number(inp.value) * 100)}%`; };
        show();
        inp.addEventListener('input', () => {
          show();
          store.setSettings({ [row.key]: Number(inp.value) } as Partial<Settings>);
        });
        ctl.append(inp, out);
      } else if (row.kind === 'text') {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'set-text';
        inp.placeholder = row.placeholder ?? '';
        inp.value = String(store.state.settings[row.key] ?? '');
        inp.addEventListener('change', () => {
          store.setSettings({ [row.key]: inp.value.trim() } as Partial<Settings>);
        });
        ctl.append(inp);
      } else if (row.kind === 'choice') {
        const sel = document.createElement('select');
        for (const o of row.options) {
          const opt = document.createElement('option');
          opt.value = o.value;
          opt.textContent = o.label;
          sel.append(opt);
        }
        sel.value = String(store.state.settings[row.key] ?? row.options[0].value);
        sel.addEventListener('change', () => {
          store.setSettings({ [row.key]: sel.value } as Partial<Settings>);
        });
        ctl.append(sel);
      } else if (row.kind === 'action') {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn ghost xs';
        btn.textContent = row.button;
        const out = document.createElement('span');
        out.className = 'hint';
        btn.addEventListener('click', () => {
          btn.disabled = true;
          out.textContent = 'enviando…';
          row.run((msg, ok) => {
            btn.disabled = false;
            out.textContent = msg;
            out.style.color = ok ? 'var(--ok)' : 'var(--danger)';
          });
        });
        ctl.append(btn, out);
      } else {
        const sel = document.createElement('select');
        for (const t of themeList) {
          const o = document.createElement('option');
          o.value = t.id;
          o.textContent = `${t.family === 'cosmic' ? '✧' : '▚'} ${t.name}`;
          sel.append(o);
        }
        sel.value = store.theme;
        sel.addEventListener('change', () => onThemeChange(sel.value as ThemeId));
        ctl.append(sel);
      }

      el.append(left, ctl);
      sec.append(el);
    }
    body.append(sec);
  }
}

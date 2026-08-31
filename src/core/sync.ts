import type { AppState } from './types';

const ROUTE = '/__progress';

export type SyncMode = 'disco' | 'navegador';

let warned = false;
const warnOnce = (err: unknown): void => {
  if (warned) return;
  warned = true;
  console.warn(
    '[progresso] sem servidor de arquivo — o progresso segue salvo apenas no navegador. ' +
    'Rode o app com `npm run dev` ou `npm run preview` para gravar em data/progress.json.',
    err,
  );
};

/** Lê o estado do arquivo em disco. `null` = arquivo ausente ou servidor indisponível. */
export async function loadRemote(): Promise<AppState | null> {
  try {
    const res = await fetch(ROUTE, { method: 'GET' });
    if (res.status === 204) return null;      // arquivo ainda não existe
    if (!res.ok) return null;
    return (await res.json()) as AppState;
  } catch (err) {
    warnOnce(err);
    return null;
  }
}

/** Grava o estado no arquivo em disco. Retorna false se o servidor não respondeu. */
export async function saveRemote(state: AppState): Promise<boolean> {
  try {
    const res = await fetch(ROUTE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    return res.ok || res.status === 204;
  } catch (err) {
    warnOnce(err);
    return false;
  }
}

/** Última gravação possível ao fechar a aba — sobrevive ao descarregamento da página. */
export function saveRemoteBeacon(state: AppState): void {
  try {
    const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
    navigator.sendBeacon?.(ROUTE, blob);
  } catch { /* nada a fazer se a aba já está morrendo */ }
}

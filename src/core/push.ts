import { store } from './store';

const ROUTE = '/__notify';

export interface PushResult { ok: boolean; error?: string; host?: string }

/**
 * Envia um aviso para o celular através do relay local (servidor Vite).
 * Silencioso quando desligado ou sem destino configurado.
 */
export async function pushToPhone(title: string, message: string): Promise<PushResult> {
  const s = store.state.settings;
  if (!s.notifyPhone || !s.notifyTarget.trim()) return { ok: false, error: 'desligado' };
  return sendPush(title, message);
}

/** Envia ignorando o interruptor — usado pelo botão de teste. */
export async function sendPush(title: string, message: string): Promise<PushResult> {
  const s = store.state.settings;
  try {
    const res = await fetch(ROUTE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: s.notifyProvider,
        target: s.notifyTarget.trim(),
        title,
        message,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as PushResult;
    return res.ok ? { ok: true, host: data.host } : { ok: false, error: data.error ?? `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'servidor local indisponível' };
  }
}

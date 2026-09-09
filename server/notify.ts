import type { Connect, Plugin, PreviewServer, ViteDevServer } from 'vite';

const ROUTE = '/__notify';
const MAX_BYTES = 64 * 1024;
const TIMEOUT_MS = 8000;

interface Payload {
  provider: 'ntfy' | 'webhook';
  target: string;          // tópico do ntfy ou URL do webhook
  title: string;
  message: string;
  tags?: string;
}

const readBody = (req: Connect.IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BYTES) { reject(new Error('payload grande demais')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

const httpUrl = (raw: string): URL => {
  const u = new URL(raw);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('apenas http/https');
  return u;
};

/**
 * Repassa avisos para um serviço de push, a partir do servidor local.
 * Fazer daqui em vez do navegador evita CORS e mantém o tópico/token fora
 * das requisições da página.
 */
export function notifyRelay(): Plugin {
  const attach = (server: ViteDevServer | PreviewServer): void => {
    server.middlewares.use(ROUTE, async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }

      const fail = (code: number, msg: string): void => {
        res.statusCode = code;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: msg }));
      };

      let p: Payload;
      try {
        p = JSON.parse(await readBody(req)) as Payload;
      } catch {
        return fail(400, 'corpo inválido');
      }
      if (!p?.target) return fail(400, 'destino não configurado');

      const title = String(p.title ?? 'Pomodoro Cosmos').slice(0, 200);
      const message = String(p.message ?? '').slice(0, 1000);

      try {
        let url: URL;
        let init: RequestInit;

        if (p.provider === 'ntfy') {
          const topic = p.target.trim().replace(/^\/+|\/+$/g, '');
          // aceita tanto "meu-topico" quanto uma URL completa de servidor próprio
          url = /^https?:\/\//.test(topic) ? httpUrl(topic) : httpUrl(`https://ntfy.sh/${topic}`);
          // cabeçalhos HTTP são ASCII: o título vai sem acentos no header e
          // o texto completo, com acentos, vai no corpo
          const asciiTitle = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, ' ').trim();
          init = {
            method: 'POST',
            headers: {
              Title: asciiTitle || 'Pomodoro Cosmos',
              Tags: p.tags ?? 'tomato',
              Priority: 'default',
            },
            body: message,
          };
        } else {
          url = httpUrl(p.target.trim());
          init = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // formatos redundantes de propósito: `content` serve Discord,
            // `text` serve Slack, `title`/`message` servem webhooks genéricos
            body: JSON.stringify({ title, message, content: `**${title}**\n${message}`, text: `${title}\n${message}` }),
          };
        }

        const upstream = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!upstream.ok) {
          const detail = (await upstream.text().catch(() => '')).slice(0, 300);
          server.config.logger.warn(`[aviso] ${url.host} respondeu ${upstream.status}: ${detail}`);
          return fail(502, `serviço respondeu ${upstream.status}`);
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true, host: url.host }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        server.config.logger.warn(`[aviso] falha ao enviar: ${msg}`);
        fail(502, msg);
      }
    });
  };

  return {
    name: 'pomodoro-notify-relay',
    configureServer: attach,
    configurePreviewServer: attach,
  };
}

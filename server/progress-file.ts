import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Connect, Plugin, PreviewServer, ViteDevServer } from 'vite';

const ROUTE = '/__progress';
const MAX_BYTES = 8 * 1024 * 1024;

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

/**
 * Guarda o estado do app num arquivo JSON do projeto, servido pelo próprio Vite.
 * O navegador continua com uma cópia em localStorage; o arquivo é a fonte da verdade
 * e sobrevive a limpar dados do navegador, trocar de navegador ou trocar de porta.
 */
export function progressFile(relative = 'data/progress.json'): Plugin {
  let target = '';
  let seq = 0;
  // gravações são serializadas: dois POSTs simultâneos (ex.: flush + beacon)
  // disputariam o mesmo arquivo temporário e um deles falharia
  let queue: Promise<void> = Promise.resolve();

  const writeAtomic = (data: unknown): Promise<void> => {
    const run = queue.then(async () => {
      await mkdir(path.dirname(target), { recursive: true });
      // nome único por gravação, não só por processo
      const tmp = `${target}.${process.pid}.${seq++}.tmp`;
      await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
      await rename(tmp, target);
    });
    // a fila continua mesmo se uma gravação falhar
    queue = run.catch(() => undefined);
    return run;
  };

  const attach = (server: ViteDevServer | PreviewServer): void => {
    server.middlewares.use(ROUTE, async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');

      if (req.method === 'GET') {
        try {
          const raw = await readFile(target, 'utf8');
          JSON.parse(raw);                       // recusa entregar arquivo corrompido
          res.setHeader('Content-Type', 'application/json');
          res.end(raw);
        } catch (err) {
          const code = (err as NodeJS.ErrnoException).code;
          if (code !== 'ENOENT') server.config.logger.warn(`[progresso] falha ao ler ${target}: ${String(err)}`);
          res.statusCode = 204;                  // ainda não existe: o cliente envia o que tiver
          res.end();
        }
        return;
      }

      if (req.method === 'POST') {
        try {
          const body = await readBody(req);
          const parsed: unknown = JSON.parse(body);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('corpo não é um objeto de estado');
          }
          // grava em temporário e renomeia: uma queda no meio não corrompe o arquivo bom
          await writeAtomic(parsed);
          res.statusCode = 204;
          res.end();
        } catch (err) {
          server.config.logger.warn(`[progresso] falha ao gravar ${target}: ${String(err)}`);
          res.statusCode = 400;
          res.end();
        }
        return;
      }

      res.statusCode = 405;
      res.end();
    });
  };

  return {
    name: 'pomodoro-progress-file',
    configResolved(cfg) {
      target = path.resolve(cfg.root, relative);
    },
    configureServer: attach,
    configurePreviewServer: attach,
  };
}

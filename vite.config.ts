import { defineConfig } from 'vite';
import { progressFile } from './server/progress-file';
import { notifyRelay } from './server/notify';

// dev e preview usam a MESMA porta de propósito: o localStorage é por origem,
// então portas diferentes seriam dois progressos separados.
const PORT = 5173;

export default defineConfig({
  base: './',
  plugins: [progressFile(process.env.POMODORO_DATA ?? 'data/progress.json'), notifyRelay()],
  server: { port: PORT, strictPort: true, open: true },
  preview: { port: PORT, strictPort: true },
  build: { outDir: 'dist', target: 'es2022' },
});

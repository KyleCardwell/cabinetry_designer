import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Logic tests (.test.js) share one module graph per worker, so the model isn't re-imported for every
// file. A test that mocks modules, spies, stubs globals or fakes timers would leak into its
// neighbours there, so it runs isolated, like every UI test (.test.jsx). Picked by scanning, so new
// tests need no config change.
const LEAKY = /\bvi\.(mock|doMock|spyOn|stubGlobal|stubEnv|useFakeTimers)\(|globalThis\.\w+\s*=/;
const SRC = fileURLToPath(new URL('./src/', import.meta.url));
const isolatedLogicTests = readdirSync(SRC, { recursive: true })
  .filter((file) => file.endsWith('.test.js'))
  .filter((file) => LEAKY.test(readFileSync(SRC + file, 'utf8')))
  .map((file) => [`src/${file.replaceAll('\\', '/')}`, 'forks']);

export default defineConfig({
  plugins: [react()],
  test: {
    pool: 'forks',
    poolMatchGlobs: [...isolatedLogicTests, ['**/*.test.js', 'threads']],
    poolOptions: { threads: { isolate: false } },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});

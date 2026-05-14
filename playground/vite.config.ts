import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: 'ctx-opt/scorers', replacement: resolve(__dirname, '../src/scorers/index.ts') },
      { find: 'ctx-opt', replacement: resolve(__dirname, '../src/index.ts') },
    ],
  },
  server: {
    port: 5173,
  },
});

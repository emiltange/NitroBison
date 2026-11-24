import { defineConfig } from 'vite';

export default defineConfig({
  server: { watch: { ignored: ['**/release/**'] } },
  build: { target: 'es2022', chunkSizeWarningLimit: 1600 },
});

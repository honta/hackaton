import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/background/index.ts'),
      output: {
        entryFileNames: 'assets/background.js',
        chunkFileNames: 'assets/chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});

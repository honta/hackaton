import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    process: JSON.stringify({
      env: {
        NODE_ENV: 'production',
      },
    }),
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    cssCodeSplit: false,
    lib: {
      entry: resolve(__dirname, 'src/content/index.tsx'),
      formats: ['iife'],
      name: 'StravaBuddyContent',
      fileName: () => 'assets/content.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});

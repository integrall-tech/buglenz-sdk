import { brandSourceMaps } from '@integrall/buglenz-react/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    react(),
    brandSourceMaps({
      url: process.env.SENTRY_URL!,
      authToken: process.env.SENTRY_AUTH_TOKEN!,
      project: process.env.SENTRY_PROJECT!,
      app: 'contract-web',
      version: '1.0.0',
    }),
  ],
  build: { sourcemap: true, minify: true },
});

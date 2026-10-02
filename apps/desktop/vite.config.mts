import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { DEV_CSP, PROD_CSP } from './electron/csp.ts';

function cspMetaPlugin(): Plugin {
  return {
    name: 'contextbridge-csp',
    transformIndexHtml(html, ctx) {
      void html;
      const csp = ctx.server ? DEV_CSP : PROD_CSP;
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: csp },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), cspMetaPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});

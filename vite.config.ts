import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';

/** Production only: a Content-Security-Policy (scripts only from this site + the one inline boot-diagnostics script, by hash). */
const csp = () => ({
  name: 'nc-csp',
  apply: 'build' as const,
  transformIndexHtml: { order: 'post' as const, handler(html: string) {
    const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
    const policy = ["default-src 'self'", `script-src 'self' ${hashes.join(' ')}`.trim(), "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob: https:", "font-src 'self' data:", "connect-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"].join('; ');
    return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`);
  } },
});

// Default build: relative asset paths + hash routing, so dist/ works from any folder, from file://, and with no server rules.
// `npm run build:clean` (mode "clean"): absolute paths + clean URLs (/hosting); needs the .htaccess rewrite and the site at the domain root.
export default defineConfig(({ mode }) => ({
  plugins: [react(), csp()],
  build: { target: 'es2018', cssTarget: 'chrome80' },
  // `npm run dev` only: proxy the API to a local PHP server (php -S localhost:8000 -t <folder containing api/>).
  server: { proxy: { '/api': 'http://localhost:8000' } },
  base: mode === 'clean' || mode === 'development' ? '/' : './',
}));

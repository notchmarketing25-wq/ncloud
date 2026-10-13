import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Default build: relative asset paths + hash routing, so dist/ works from any folder, from file://, and with no server rules.
// `npm run build:clean` (mode "clean"): absolute paths + clean URLs (/hosting); needs the .htaccess rewrite and the site at the domain root.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build: { target: 'es2018', cssTarget: 'chrome80' },
  base: mode === 'clean' || mode === 'development' ? '/' : './',
}));

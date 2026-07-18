import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const r = (p) => fileURLToPath(new URL(p, import.meta.url));

// The client lives in client/; build it to board/dist, which the Node server
// serves static. base: './' so it works behind any path. Two pages: the
// projector spectator (index.html) and the laptop cockpit (play.html).
export default defineConfig({
  root: 'client',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: { input: { main: r('client/index.html'), play: r('client/play.html') } },
  },
});

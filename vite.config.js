import { defineConfig } from 'vite';

export default defineConfig({
  // Relative assets work on both username.github.io and /repository/ Pages URLs.
  base: './',
  build: {
    sourcemap: false,
  },
});

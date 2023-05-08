import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    silent: true,
    coverage: {
      provider: 'c8',
    },
  },
  plugins: [swc.vite()],
});

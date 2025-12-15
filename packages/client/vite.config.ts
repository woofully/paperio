import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@paperio2/common': path.resolve(__dirname, '../common/src'),
    },
  },
  server: {
    port: 3000,
    fs: {
      allow: ['..'], // Allow access to parent directory for monorepo
    },
  },
});

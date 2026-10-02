import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@contextbridge/core': path.join(rootDir, 'packages', 'core', 'src', 'index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['packages/core/tests/**/*.test.ts', 'tests/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});

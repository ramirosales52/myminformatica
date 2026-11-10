import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
export default defineConfig({
  test: {
    environment: 'node',
    env: loadEnv('test', process.cwd(), ''),
    include: ['tests/**/*.test.ts'],
    testTimeout: 20000,
    hookTimeout: 40000,
    fileParallelism: false,
  },
})

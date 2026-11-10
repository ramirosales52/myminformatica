import { defineConfig } from '@playwright/test'
import { loadEnv } from 'vite'
import { existsSync } from 'node:fs'
Object.assign(process.env, loadEnv('test', process.cwd(), ''))
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  expect: { timeout: 12000 },
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1440, height: 1000 },
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'off',
    launchOptions: {
      executablePath:
        process.env.CHROMIUM_PATH ||
        (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})

import { defineConfig } from '@playwright/test'
import path from 'node:path'

const useManagedWebServers = process.env.PW_SKIP_WEBSERVER !== '1'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:3013',
    headless: true,
  },
  webServer: useManagedWebServers
    ? [
        {
          command: 'bun run dev',
          cwd: path.resolve(process.cwd(), '../backend'),
          url: 'http://localhost:5679/api/v1/health',
          reuseExistingServer: true,
          env: {
            ...process.env,
            HUOBAO_ADMIN_TOKEN: process.env.HUOBAO_ADMIN_TOKEN || 'huobao-local-admin',
          },
          timeout: 120_000,
        },
        {
          command: 'bun run dev',
          cwd: process.cwd(),
          url: 'http://localhost:3013',
          reuseExistingServer: true,
          env: {
            ...process.env,
            NUXT_PUBLIC_ADMIN_TOKEN: process.env.NUXT_PUBLIC_ADMIN_TOKEN || 'huobao-local-admin',
          },
          timeout: 120_000,
        },
      ]
    : undefined,
})

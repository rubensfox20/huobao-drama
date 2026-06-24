import { Hono } from 'hono'
import { spawnSync } from 'node:child_process'
import { success } from '../utils/response.js'
import { getRecentTaskLogs } from '../utils/task-logger.js'
import { listRecentProviderUsageEvents } from '../services/provider-usage.js'
import { getProviderGovernorState } from '../services/provider-governor.js'
import { requireAdminAuth } from '../middleware/admin-auth.js'

const app = new Hono()
app.use('*', requireAdminAuth)

function getCommandStatus(command: string) {
  const result = spawnSync(command, ['-version'], { encoding: 'utf8' })
  const stdout = typeof result.stdout === 'string' ? result.stdout : ''
  const stderr = typeof result.stderr === 'string' ? result.stderr : ''
  const error = result.error?.message || stderr.split(/\r?\n/)[0] || ''

  return {
    available: result.status === 0,
    version: stdout.split(/\r?\n/)[0] || '',
    error,
  }
}

app.get('/', (c) => {
  const ffmpeg = getCommandStatus('ffmpeg')
  const ffprobe = getCommandStatus('ffprobe')
  const recentLogs = getRecentTaskLogs(120)
  const providerUsage = listRecentProviderUsageEvents(40)
  const errorCount = recentLogs.filter((entry) => entry.level === 'ERROR').length

  return success(c, {
    status: 'ok',
    timestamp: new Date().toISOString(),
    ffmpeg,
    ffprobe,
    recent_error_count: errorCount,
    recent_logs: recentLogs,
    provider_governor: getProviderGovernorState(),
    provider_usage: providerUsage,
  })
})

export default app

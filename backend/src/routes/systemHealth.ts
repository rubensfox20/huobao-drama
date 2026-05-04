import { Hono } from 'hono'
import { spawnSync } from 'node:child_process'
import { success } from '../utils/response.js'
import { getRecentTaskLogs } from '../utils/task-logger.js'
import { listRecentProviderUsageEvents } from '../services/provider-usage.js'
import { getProviderGovernorState } from '../services/provider-governor.js'
import { requireAdminAuth } from '../middleware/admin-auth.js'

const app = new Hono()
app.use('*', requireAdminAuth)

app.get('/', (c) => {
  const ffmpeg = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' })
  const ffprobe = spawnSync('ffprobe', ['-version'], { encoding: 'utf8' })
  const recentLogs = getRecentTaskLogs(120)
  const providerUsage = listRecentProviderUsageEvents(40)
  const errorCount = recentLogs.filter((entry) => entry.level === 'ERROR').length

  return success(c, {
    status: 'ok',
    timestamp: new Date().toISOString(),
    ffmpeg: {
      available: ffmpeg.status === 0,
      version: ffmpeg.stdout.split(/\r?\n/)[0] || '',
    },
    ffprobe: {
      available: ffprobe.status === 0,
      version: ffprobe.stdout.split(/\r?\n/)[0] || '',
    },
    recent_error_count: errorCount,
    recent_logs: recentLogs,
    provider_governor: getProviderGovernorState(),
    provider_usage: providerUsage,
  })
})

export default app

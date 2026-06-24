import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import fs from 'fs'
import net from 'net'
import path from 'path'
import { fileURLToPath } from 'url'

import dramas from './routes/dramas.js'
import episodes from './routes/episodes.js'
import storyboards from './routes/storyboards.js'
import scenes from './routes/scenes.js'
import characters from './routes/characters.js'
import images from './routes/images.js'
import videos from './routes/videos.js'
import upload from './routes/upload.js'
import aiConfigs, { aiProviders } from './routes/aiConfigs.js'
import agentConfigs from './routes/agentConfigs.js'
import agent from './routes/agent.js'
import compose from './routes/compose.js'
import merge from './routes/merge.js'
import grid from './routes/grid.js'
import skills from './routes/skills.js'
import webhooks from './routes/webhooks.js'
import aiVoices from './routes/aiVoices.js'
import workflowJobs from './routes/workflowJobs.js'
import systemHealth from './routes/systemHealth.js'
import prompts from './routes/prompts.js'
import providerAvailability from './routes/providerAvailability.js'
import ideas from './routes/ideas.js'
import discovery from './routes/discovery.js'
import audioCues from './routes/audioCues.js'
import providerConnections from './routes/providerConnections.js'
import adminSession from './routes/adminSession.js'
import storyStudio from './routes/storyStudio.js'
import { requestLogger, errorHandler } from './middleware/logger.js'
import { ensurePromptTemplatesSeeded } from './services/prompt-templates.js'
import { recoverOrphanedGenerationRecords, recoverOrphanedWorkflowJobs } from './services/workflow-jobs.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../..')

function resolveFrontendPublicPath() {
  const candidates = [
    path.join(projectRoot, 'frontend', '.output', 'public'),
    path.join(projectRoot, 'frontend', 'dist'),
  ]

  return candidates.find(candidate => fs.existsSync(candidate)) || null
}

function ensurePortAvailable(port: number) {
  return new Promise<boolean>((resolve) => {
    const tester = net.createServer()
    tester.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Porta ${port} ja esta em uso. Pare a instancia antiga antes de subir outra.`)
        resolve(false)
        return
      }
      console.error(`Falha ao validar a porta ${port}: ${err.message}`)
      resolve(false)
    })
    tester.once('listening', () => {
      tester.close(() => resolve(true))
    })
    tester.listen(port)
  })
}

export function buildApp() {
  const app = new Hono()
  const frontendPublicPath = resolveFrontendPublicPath()

  ensurePromptTemplatesSeeded()
  const recoveredJobs = recoverOrphanedWorkflowJobs()
  if (recoveredJobs.recovered > 0) {
    console.warn(`Recuperados ${recoveredJobs.recovered} jobs orfaos: ${recoveredJobs.jobIds.join(', ')}`)
  }
  const recoveredGenerations = recoverOrphanedGenerationRecords()
  if (recoveredGenerations.recovered > 0) {
    console.warn(`Recuperados ${recoveredGenerations.recovered} registros de midia orfaos`)
  }

  // Middleware
  app.use('*', cors({
    origin: ['http://localhost:3013', 'http://localhost:5679'],
    credentials: true,
  }))
  app.use('*', requestLogger)
  app.use('*', errorHandler)

  // Health check
  app.get('/api/v1/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

  // API routes
  const api = new Hono()
  api.route('/dramas', dramas)
  api.route('/episodes', episodes)
  api.route('/storyboards', storyboards)
  api.route('/scenes', scenes)
  api.route('/characters', characters)
  api.route('/images', images)
  api.route('/videos', videos)
  api.route('/upload', upload)
  api.route('/ai-configs', aiConfigs)
  api.route('/ai-providers', aiProviders)
  api.route('/agent-configs', agentConfigs)
  api.route('/agent', agent)
  api.route('/compose', compose)
  api.route('/merge', merge)
  api.route('/grid', grid)
  api.route('/skills', skills)
  api.route('/ai-voices', aiVoices)
  api.route('/workflow-jobs', workflowJobs)
  api.route('/system-health', systemHealth)
  api.route('/prompts', prompts)
  api.route('/provider-availability', providerAvailability)
  api.route('/provider-connections', providerConnections)
  api.route('/admin/session', adminSession)
  api.route('/ideas', ideas)
  api.route('/discovery', discovery)
  api.route('/audio-cues', audioCues)
  api.route('/story-studio', storyStudio)

  app.route('/api/v1', api)

  // Webhook callbacks (Vidu, etc.) - outside /api/v1
  app.route('/webhooks', webhooks)

  // Serve static files (storage)
  app.use('/static/*', serveStatic({ root: path.join(projectRoot, 'data') }))

  // Serve frontend (production build)
  if (frontendPublicPath) {
    app.use('*', serveStatic({ root: frontendPublicPath }))
    app.get('*', serveStatic({ root: frontendPublicPath, path: 'index.html' }))
  } else {
    app.get('*', (c) => c.text('Frontend build nao encontrado. Rode o frontend em modo dev ou gere o build.', 404))
  }

  return app
}

export async function startServer(port = Number(process.env.PORT || 5679)) {
  const available = await ensurePortAvailable(port)
  if (!available) {
    process.exitCode = 1
    return null
  }

  const app = buildApp()
  console.log(`🚀 Huobao Drama TS server on http://localhost:${port}`)
  return serve({ fetch: app.fetch, port })
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMainModule) {
  void startServer()
}

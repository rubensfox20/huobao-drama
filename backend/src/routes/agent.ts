
import { Hono } from 'hono'
import { createAgent, validAgentTypes } from '../agents/index.js'
import { success, badRequest } from '../utils/response.js'
import { logTaskError, logTaskPayload, logTaskProgress, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { createWorkflowJob, startWorkflowJob, completeWorkflowJob, failWorkflowJob } from '../services/workflow-jobs.js'
import { validateEpisodeScript } from '../services/pipeline-validation.js'
import { cleanupCanonicalDramaEntities } from '../services/extraction-entities.js'
import { sanitizeEpisodeStoryboardCharacterLinks } from '../services/storyboard-grounding.js'
import { getResolvedTextConfig } from '../services/text-provider.js'
import {
  extractAgentErrorMessage,
  fallbackAssignVoices,
  fallbackExtractAndSaveMetadata,
  fallbackGenerateAndSaveStoryboards,
  fallbackRewriteAndSaveScript,
  normalizeToolName,
  normalizeToolResult,
} from '../services/agent-route-support.js'
import { requireAdminForWriteMethods } from '../middleware/admin-auth.js'

const app = new Hono()
app.use('*', requireAdminForWriteMethods())

app.post('/:type/chat', async (c) => {
  const agentType = c.req.param('type')
  if (!validAgentTypes.includes(agentType)) {
    return badRequest(c, `Invalid agent type: ${agentType}`)
  }

  const body = await c.req.json()
  const { message, drama_id, episode_id } = body

  logTaskStart('Agent', agentType, {
    dramaId: drama_id,
    episodeId: episode_id,
    message,
  })
  logTaskPayload('Agent', `${agentType} input`, body)

  if (!episode_id || !drama_id) {
    logTaskError('Agent', agentType, { reason: 'missing drama_id or episode_id' })
    return badRequest(c, 'drama_id and episode_id are required')
  }

  const agent = createAgent(agentType, episode_id, drama_id)
  if (!agent) {
    logTaskError('Agent', agentType, { reason: 'agent not found' })
    return badRequest(c, 'Agent not found')
  }

  const startTime = performance.now()
  const resolvedTextConfig = getResolvedTextConfig()
  const workflowJob = createWorkflowJob({
    kind: agentType,
    relatedEntityType: 'episode',
    relatedEntityId: episode_id,
    episodeId: episode_id,
    dramaId: drama_id,
    provider: resolvedTextConfig.provider,
    model: resolvedTextConfig.model,
    inputSummary: String(message || '').slice(0, 160),
    metadata: {
      authSource: resolvedTextConfig.authSource || null,
      accountLabel: resolvedTextConfig.accountLabel || null,
    },
  })
  startWorkflowJob(Number(workflowJob?.id), {
    provider: resolvedTextConfig.provider,
    model: resolvedTextConfig.model,
    metadata: {
      authSource: resolvedTextConfig.authSource || null,
      accountLabel: resolvedTextConfig.accountLabel || null,
    },
  })

  try {
    const result = await agent.generate(
      [{ role: 'user', content: message }],
      { maxSteps: 20 },
    )

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1)
    logTaskSuccess('Agent', agentType, { elapsedSeconds: elapsed })


    const toolCalls = result.toolCalls || []
    const toolResults = result.toolResults || []
    const normalizedToolCalls = toolCalls.map((tc: any) => ({
      toolName: normalizeToolName(tc),
      args: tc?.args ?? tc?.payload?.args ?? tc?.input ?? null,
    }))
    const normalizedToolResults = toolResults.map((tr: any) => ({
      toolName: normalizeToolName(tr),
      result: normalizeToolResult(tr),
    }))

    logTaskProgress('Agent', 'tool-summary', {
      agentType,
      toolCalls: normalizedToolCalls.map((tc: any) => tc.toolName),
      toolResults: normalizedToolResults.map((tr: any) => tr.toolName),
    })
    logTaskPayload('Agent', `${agentType} tool-results`, normalizedToolResults)

    if (agentType === 'script_rewriter') {
      const savedByTool = normalizedToolResults.some((tr: any) => tr.toolName === 'saveScript')
      if (!savedByTool) {
        logTaskProgress('Agent', 'rewrite-fallback-start', { episodeId: episode_id })
        const rewritten = await fallbackRewriteAndSaveScript(episode_id)
        normalizedToolCalls.push({
          toolName: 'serverFallbackRewrite',
          args: { episodeId: episode_id },
        })
        normalizedToolResults.push({
          toolName: 'serverFallbackRewrite',
          result: JSON.stringify({ message: 'Script saved by server fallback', word_count: rewritten.length }),
        })
      }
    }

    if (agentType === 'extractor') {
      const savedCharactersByTool = normalizedToolResults.some((tr: any) => ['saveDedupCharacters', 'save_dedup_characters'].includes(String(tr.toolName || '')))
      const savedScenesByTool = normalizedToolResults.some((tr: any) => ['saveDedupScenes', 'save_dedup_scenes'].includes(String(tr.toolName || '')))
      if (!savedCharactersByTool || !savedScenesByTool) {
        logTaskProgress('Agent', 'extract-fallback-start', { episodeId: episode_id, dramaId: drama_id })
        const extracted = fallbackExtractAndSaveMetadata(episode_id, drama_id)
        normalizedToolCalls.push({
          toolName: 'serverFallbackExtract',
          args: { episodeId: episode_id, dramaId: drama_id },
        })
        normalizedToolResults.push({
          toolName: 'serverFallbackExtract',
          result: JSON.stringify(extracted),
        })
      }
      const cleanup = cleanupCanonicalDramaEntities({ dramaId: drama_id, episodeId: episode_id })
      const storyboardBindingCleanup = sanitizeEpisodeStoryboardCharacterLinks(episode_id, drama_id)
      if (cleanup.moved > 0 || cleanup.removed > 0 || cleanup.mergedAliases > 0 || cleanup.propsRemoved > 0 || cleanup.duplicateCharacters > 0 || cleanup.duplicateScenes > 0 || cleanup.duplicateProps > 0) {
        normalizedToolCalls.push({
          toolName: 'serverCleanupExtract',
          args: { episodeId: episode_id, dramaId: drama_id },
        })
        normalizedToolResults.push({
          toolName: 'serverCleanupExtract',
          result: JSON.stringify({ ...cleanup, storyboardBindingsUpdated: storyboardBindingCleanup.updated }),
        })
      } else if (storyboardBindingCleanup.updated > 0) {
        normalizedToolCalls.push({
          toolName: 'serverCleanupStoryboardBindings',
          args: { episodeId: episode_id, dramaId: drama_id },
        })
        normalizedToolResults.push({
          toolName: 'serverCleanupStoryboardBindings',
          result: JSON.stringify(storyboardBindingCleanup),
        })
      }
    }

    if (agentType === 'voice_assigner') {
      const assignedByTool = normalizedToolResults.some((tr: any) => ['assignVoice', 'assign_voice'].includes(String(tr.toolName || '')))
      if (!assignedByTool) {
        logTaskProgress('Agent', 'voice-fallback-start', { episodeId: episode_id, dramaId: drama_id })
        const voiceAssignment = fallbackAssignVoices(episode_id, drama_id)
        normalizedToolCalls.push({
          toolName: 'serverFallbackVoiceAssign',
          args: { episodeId: episode_id, dramaId: drama_id },
        })
        normalizedToolResults.push({
          toolName: 'serverFallbackVoiceAssign',
          result: JSON.stringify(voiceAssignment),
        })
      }
    }

    if (agentType === 'storyboard_breaker') {
      const savedByTool = normalizedToolResults.some((tr: any) => ['saveStoryboards', 'save_storyboards'].includes(String(tr.toolName || '')))
      if (!savedByTool) {
        logTaskProgress('Agent', 'storyboard-fallback-start', { episodeId: episode_id, dramaId: drama_id })
        const saved = await fallbackGenerateAndSaveStoryboards(episode_id, drama_id, Number(workflowJob?.id))
        normalizedToolCalls.push({
          toolName: 'serverFallbackStoryboardBreak',
          args: { episodeId: episode_id, dramaId: drama_id },
        })
        normalizedToolResults.push({
          toolName: 'serverFallbackStoryboardBreak',
          result: JSON.stringify({ count: saved.count, total_duration: saved.totalDuration }),
        })
      }
    }

    const validation = agentType === 'script_rewriter'
      ? validateEpisodeScript(episode_id)
      : []
    completeWorkflowJob(Number(workflowJob?.id), {
      outputSummary: result.text?.slice(0, 160) || '',
      metadata: { agentType, toolCalls: normalizedToolCalls.map((tc: any) => tc.toolName) },
    })
    return success(c, {
      type: 'done',
      text: result.text || '',
      toolCalls: normalizedToolCalls,
      toolResults: normalizedToolResults,
      workflow_job_id: Number(workflowJob?.id),
      status: 'completed',
      validation,
    })
  } catch (err: any) {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1)
    const message = extractAgentErrorMessage(err)

    if (agentType === 'extractor') {
      try {
        logTaskProgress('Agent', 'extract-fallback-after-error', {
          episodeId: episode_id,
          dramaId: drama_id,
          error: message,
        })
        const extracted = fallbackExtractAndSaveMetadata(episode_id, drama_id)
        const cleanup = cleanupCanonicalDramaEntities({ dramaId: drama_id, episodeId: episode_id })
        const storyboardBindingCleanup = sanitizeEpisodeStoryboardCharacterLinks(episode_id, drama_id)
        completeWorkflowJob(Number(workflowJob?.id), {
          outputSummary: 'fallback extractor',
          metadata: { fallback: true, agentType },
        })
        return success(c, {
          type: 'done',
          text: '',
          toolCalls: [{
            toolName: 'serverFallbackExtract',
            args: { episodeId: episode_id, dramaId: drama_id },
          }],
          toolResults: [{
            toolName: 'serverFallbackExtract',
            result: JSON.stringify(extracted),
          }, ...(cleanup.moved > 0 || cleanup.removed > 0 || cleanup.mergedAliases > 0 || cleanup.propsRemoved > 0 || cleanup.duplicateCharacters > 0 || cleanup.duplicateScenes > 0 || cleanup.duplicateProps > 0 ? [{
            toolName: 'serverCleanupExtract',
            result: JSON.stringify({ ...cleanup, storyboardBindingsUpdated: storyboardBindingCleanup.updated }),
          }] : storyboardBindingCleanup.updated > 0 ? [{
            toolName: 'serverCleanupStoryboardBindings',
            result: JSON.stringify(storyboardBindingCleanup),
          }] : [])],
          workflow_job_id: Number(workflowJob?.id),
          status: 'completed',
        })
      } catch (fallbackErr: any) {
        const fallbackMessage = fallbackErr?.message || message
        logTaskError('Agent', agentType, { elapsedSeconds: elapsed, error: fallbackMessage })
        console.error(fallbackErr?.stack || fallbackErr)
        failWorkflowJob(Number(workflowJob?.id), fallbackMessage, { metadata: { agentType } })
        return badRequest(c, fallbackMessage)
      }
    }

    if (agentType === 'script_rewriter') {
      try {
        logTaskProgress('Agent', 'rewrite-fallback-after-error', {
          episodeId: episode_id,
          dramaId: drama_id,
          error: message,
        })
        const rewritten = await fallbackRewriteAndSaveScript(episode_id)
        const validation = validateEpisodeScript(episode_id)
        completeWorkflowJob(Number(workflowJob?.id), {
          outputSummary: rewritten.slice(0, 160),
          metadata: { fallback: true, agentType },
        })
        return success(c, {
          type: 'done',
          text: rewritten,
          toolCalls: [{
            toolName: 'serverFallbackRewrite',
            args: { episodeId: episode_id, dramaId: drama_id },
          }],
          toolResults: [{
            toolName: 'serverFallbackRewrite',
            result: JSON.stringify({ message: 'Script saved by server fallback', word_count: rewritten.length }),
          }],
          workflow_job_id: Number(workflowJob?.id),
          status: 'completed',
          validation,
        })
      } catch (fallbackErr: any) {
        const fallbackMessage = fallbackErr?.message || message
        logTaskError('Agent', agentType, { elapsedSeconds: elapsed, error: fallbackMessage })
        console.error(fallbackErr?.stack || fallbackErr)
        failWorkflowJob(Number(workflowJob?.id), fallbackMessage, { metadata: { agentType } })
        return badRequest(c, fallbackMessage)
      }
    }

    if (agentType === 'voice_assigner') {
      try {
        logTaskProgress('Agent', 'voice-fallback-after-error', {
          episodeId: episode_id,
          dramaId: drama_id,
          error: message,
        })
        const voiceAssignment = fallbackAssignVoices(episode_id, drama_id)
        completeWorkflowJob(Number(workflowJob?.id), {
          outputSummary: 'fallback voice assign',
          metadata: { fallback: true, agentType },
        })
        return success(c, {
          type: 'done',
          text: '',
          toolCalls: [{
            toolName: 'serverFallbackVoiceAssign',
            args: { episodeId: episode_id, dramaId: drama_id },
          }],
          toolResults: [{
            toolName: 'serverFallbackVoiceAssign',
            result: JSON.stringify(voiceAssignment),
          }],
          workflow_job_id: Number(workflowJob?.id),
          status: 'completed',
        })
      } catch (fallbackErr: any) {
        const fallbackMessage = fallbackErr?.message || message
        logTaskError('Agent', agentType, { elapsedSeconds: elapsed, error: fallbackMessage })
        console.error(fallbackErr?.stack || fallbackErr)
        failWorkflowJob(Number(workflowJob?.id), fallbackMessage, { metadata: { agentType } })
        return badRequest(c, fallbackMessage)
      }
    }

    if (agentType === 'storyboard_breaker') {
      try {
        logTaskProgress('Agent', 'storyboard-fallback-after-error', {
          episodeId: episode_id,
          dramaId: drama_id,
          error: message,
        })
        const saved = await fallbackGenerateAndSaveStoryboards(episode_id, drama_id, Number(workflowJob?.id))
        completeWorkflowJob(Number(workflowJob?.id), {
          outputSummary: `fallback storyboard count=${saved.count}`,
          metadata: { fallback: true, agentType, count: saved.count, totalDuration: saved.totalDuration },
        })
        return success(c, {
          type: 'done',
          text: '',
          toolCalls: [{
            toolName: 'serverFallbackStoryboardBreak',
            args: { episodeId: episode_id, dramaId: drama_id },
          }],
          toolResults: [{
            toolName: 'serverFallbackStoryboardBreak',
            result: JSON.stringify({ count: saved.count, total_duration: saved.totalDuration }),
          }],
          workflow_job_id: Number(workflowJob?.id),
          status: 'completed',
        })
      } catch (fallbackErr: any) {
        const fallbackMessage = fallbackErr?.message || message
        logTaskError('Agent', agentType, { elapsedSeconds: elapsed, error: fallbackMessage })
        console.error(fallbackErr?.stack || fallbackErr)
        failWorkflowJob(Number(workflowJob?.id), fallbackMessage, { metadata: { agentType } })
        return badRequest(c, fallbackMessage)
      }
    }

    logTaskError('Agent', agentType, { elapsedSeconds: elapsed, error: message })
    console.error(err.stack || err)
    failWorkflowJob(Number(workflowJob?.id), message, { metadata: { agentType } })
    return badRequest(c, message)
  }
})

// GET /agent/:type/debug
app.get('/:type/debug', async (c) => {
  const agentType = c.req.param('type')
  if (!validAgentTypes.includes(agentType)) return badRequest(c, 'Invalid agent type')
  return success(c, { agent_type: agentType, valid: true })
})

export default app

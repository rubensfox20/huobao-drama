
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { db, schema } from '../../db/index.js'
import { eq } from 'drizzle-orm'
import { now } from '../../utils/response.js'
import { buildAllowedSpeakerHint, sanitizeRewrittenScript } from '../../services/script-sanitizer.js'

export function createScriptTools(episodeId: number) {
  const readEpisodeScript = createTool({
    id: 'read_episode_script',
    description: 'Read the script content of the current episode.',
    inputSchema: z.object({}),
    execute: async () => {
      const [ep] = db.select().from(schema.episodes)
        .where(eq(schema.episodes.id, episodeId)).all()
      if (!ep) return { error: `Episode not found (id=${episodeId})` }
      const content = ep.content || ep.scriptContent
      if (!content) return { error: `Episode has no content (id=${episodeId})` }
      return { content, word_count: content.length, episode_id: episodeId }
    },
  })

  const rewriteToScreenplay = createTool({
    id: 'rewrite_to_screenplay',
    description: 'Read the original content for AI rewriting. Returns the source text with formatting instructions.',
    inputSchema: z.object({
      instructions: z.string().optional().describe('Additional rewrite instructions'),
    }),
    execute: async ({ instructions }) => {
      const [ep] = db.select().from(schema.episodes)
        .where(eq(schema.episodes.id, episodeId)).all()
      if (!ep) return { error: `Episode not found` }
      const source = ep.content || ep.scriptContent
      if (!source) return { error: `Episode has no content to rewrite` }

      return {
        source_content: source,
        instruction: `Rewrite the source below into a structured screenplay in Brazilian Portuguese.

Format:
- Scene header: ## S<number> | Interior/Exterior · Location | Time period
- Action: natural prose paragraphs, no camera jargon
- Dialogue: Character Name: (emotion/state) spoken line
- Each scene should roughly cover 30 to 60 seconds

Rules:
- Preserve canonical proper names and source facts exactly
- Do not invent new named characters
- Use dialogue only for source-grounded named characters who are clearly active in the scene
- If a person is unnamed in the source, keep that presence inside action prose only
- Do not create labels such as "Marinheiro", "Oficial 1", or "Voice of the Officer"
- Do not use markdown, bold text, bullet lists, or closing markers such as "FIM DO ROTEIRO"
- ${buildAllowedSpeakerHint(source)}
- When finished, call save_script with the complete final screenplay

${instructions || ''}

Source content:
${source}`,
      }
    },
  })

  const saveScript = createTool({
    id: 'save_script',
    description: 'Save the rewritten screenplay content to the current episode.',
    inputSchema: z.object({
      content: z.string().describe('The formatted screenplay content to save'),
    }),
    execute: async ({ content }) => {
      const [ep] = db.select().from(schema.episodes)
        .where(eq(schema.episodes.id, episodeId)).all()
      const source = ep?.content || ep?.scriptContent || ''
      const sanitizedContent = sanitizeRewrittenScript(content, source)
      db.update(schema.episodes)
        .set({ scriptContent: sanitizedContent, updatedAt: now() })
        .where(eq(schema.episodes.id, episodeId))
        .run()
      return { message: `Script saved`, word_count: sanitizedContent.length }
    },
  })

  return { readEpisodeScript, rewriteToScreenplay, saveScript }
}

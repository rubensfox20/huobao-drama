import type Database from 'better-sqlite3'

type Migration = {
  id: string
  up: (sqlite: Database.Database) => void
}

function ensureMigrationsTable(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `)
}

function hasMigration(sqlite: Database.Database, id: string) {
  const row = sqlite.prepare('SELECT id FROM schema_migrations WHERE id = ? LIMIT 1').get(id) as { id: string } | undefined
  return Boolean(row?.id)
}

function markApplied(sqlite: Database.Database, id: string) {
  sqlite.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(id, new Date().toISOString())
}

function addColumnIfMissing(sqlite: Database.Database, table: string, column: string, definition: string) {
  const tableExists = sqlite.prepare(
    `SELECT 1 as ok FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`,
  ).get(table) as { ok: number } | undefined
  if (!tableExists) return
  const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!columns.some(col => col.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

function createIndexIfMissing(sqlite: Database.Database, indexName: string, ddl: string) {
  const existing = sqlite.prepare(
    `SELECT 1 as ok FROM sqlite_master WHERE type='index' AND name=? LIMIT 1`,
  ).get(indexName) as { ok: number } | undefined
  if (!existing) {
    sqlite.exec(ddl)
  }
}

const migrations: Migration[] = [
  {
    id: '001_runtime_schema_alignment',
    up: (sqlite) => {
      addColumnIfMissing(sqlite, 'episodes', 'image_config_id', 'INTEGER')
      addColumnIfMissing(sqlite, 'episodes', 'video_config_id', 'INTEGER')
      addColumnIfMissing(sqlite, 'episodes', 'audio_config_id', 'INTEGER')
      addColumnIfMissing(sqlite, 'episodes', 'default_motion_preset', "TEXT DEFAULT 'drift'")
      addColumnIfMissing(sqlite, 'episodes', 'default_subtitle_mode', "TEXT DEFAULT 'dynamic'")
      addColumnIfMissing(sqlite, 'characters', 'visual_profile', 'TEXT')
      addColumnIfMissing(sqlite, 'scenes', 'visual_profile', 'TEXT')
      addColumnIfMissing(sqlite, 'storyboards', 'generation_spec', 'TEXT')
      addColumnIfMissing(sqlite, 'storyboards', 'review_status', 'TEXT')
      addColumnIfMissing(sqlite, 'storyboards', 'review_notes', 'TEXT')
      addColumnIfMissing(sqlite, 'storyboards', 'continuity_mode', "TEXT DEFAULT 'auto'")
      addColumnIfMissing(sqlite, 'storyboards', 'continuity_source_storyboard_id', 'INTEGER')
      addColumnIfMissing(sqlite, 'storyboards', 'motion_preset_override', 'TEXT')
      addColumnIfMissing(sqlite, 'storyboards', 'last_composed_motion_preset', 'TEXT')
      addColumnIfMissing(sqlite, 'storyboards', 'last_composed_subtitle_mode', 'TEXT')
      addColumnIfMissing(sqlite, 'image_generations', 'workflow_job_id', 'INTEGER')
      addColumnIfMissing(sqlite, 'video_generations', 'workflow_job_id', 'INTEGER')
      addColumnIfMissing(sqlite, 'video_merges', 'workflow_job_id', 'INTEGER')

      createIndexIfMissing(sqlite, 'idx_episodes_drama_id', 'CREATE INDEX idx_episodes_drama_id ON episodes (drama_id)')
      createIndexIfMissing(sqlite, 'idx_characters_drama_id', 'CREATE INDEX idx_characters_drama_id ON characters (drama_id)')
      createIndexIfMissing(sqlite, 'idx_scenes_drama_id', 'CREATE INDEX idx_scenes_drama_id ON scenes (drama_id)')
      createIndexIfMissing(sqlite, 'idx_props_drama_id', 'CREATE INDEX idx_props_drama_id ON props (drama_id)')
      createIndexIfMissing(sqlite, 'idx_storyboards_episode_id', 'CREATE INDEX idx_storyboards_episode_id ON storyboards (episode_id)')
      createIndexIfMissing(sqlite, 'idx_storyboards_scene_id', 'CREATE INDEX idx_storyboards_scene_id ON storyboards (scene_id)')
      createIndexIfMissing(sqlite, 'idx_storyboard_characters_character_id', 'CREATE INDEX idx_storyboard_characters_character_id ON storyboard_characters (character_id)')
    },
  },
  {
    id: '002_observability_query_indexes',
    up: (sqlite) => {
      createIndexIfMissing(sqlite, 'idx_workflow_jobs_episode_id_id', 'CREATE INDEX idx_workflow_jobs_episode_id_id ON workflow_jobs (episode_id, id DESC)')
      createIndexIfMissing(sqlite, 'idx_workflow_jobs_drama_id_id', 'CREATE INDEX idx_workflow_jobs_drama_id_id ON workflow_jobs (drama_id, id DESC)')
      createIndexIfMissing(sqlite, 'idx_workflow_jobs_kind_status_id', 'CREATE INDEX idx_workflow_jobs_kind_status_id ON workflow_jobs (kind, status, id DESC)')
      createIndexIfMissing(sqlite, 'idx_workflow_jobs_related_entity_id', 'CREATE INDEX idx_workflow_jobs_related_entity_id ON workflow_jobs (related_entity_type, related_entity_id, id DESC)')
      createIndexIfMissing(sqlite, 'idx_image_generations_drama_id_id', 'CREATE INDEX idx_image_generations_drama_id_id ON image_generations (drama_id, id DESC)')
      createIndexIfMissing(sqlite, 'idx_image_generations_storyboard_id_id', 'CREATE INDEX idx_image_generations_storyboard_id_id ON image_generations (storyboard_id, id DESC)')
      createIndexIfMissing(sqlite, 'idx_video_generations_drama_id_id', 'CREATE INDEX idx_video_generations_drama_id_id ON video_generations (drama_id, id DESC)')
      createIndexIfMissing(sqlite, 'idx_video_generations_storyboard_id_id', 'CREATE INDEX idx_video_generations_storyboard_id_id ON video_generations (storyboard_id, id DESC)')
      createIndexIfMissing(sqlite, 'idx_episode_characters_character_episode', 'CREATE INDEX idx_episode_characters_character_episode ON episode_characters (character_id, episode_id)')
      createIndexIfMissing(sqlite, 'idx_episode_scenes_scene_episode', 'CREATE INDEX idx_episode_scenes_scene_episode ON episode_scenes (scene_id, episode_id)')
    },
  },
  {
    id: '003_provider_usage_retention_index',
    up: (sqlite) => {
      createIndexIfMissing(sqlite, 'idx_provider_usage_events_created_at', 'CREATE INDEX idx_provider_usage_events_created_at ON provider_usage_events (created_at)')
    },
  },
]

export function runMigrations(sqlite: Database.Database) {
  ensureMigrationsTable(sqlite)

  for (const migration of migrations) {
    if (hasMigration(sqlite, migration.id)) continue
    const tx = sqlite.transaction(() => {
      migration.up(sqlite)
      markApplied(sqlite, migration.id)
    })
    tx()
  }
}

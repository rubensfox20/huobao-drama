import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { runMigrations } from './migrations/index.js'
import { protectPersistedSecrets } from '../utils/secrets.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../../../data/huobao_drama.db')
const DB_RUNTIME_STATE_KEY = Symbol.for('huobao-drama.sqliteRuntimeState')

type DbRuntimeState = {
  sqlite?: Database.Database
  cleanupRegistered?: boolean
}

const dbRuntimeState = (globalThis as typeof globalThis & {
  [DB_RUNTIME_STATE_KEY]?: DbRuntimeState
})[DB_RUNTIME_STATE_KEY] ??= {}

function closeSqliteConnection() {
  const activeSqlite = dbRuntimeState.sqlite
  if (!activeSqlite?.open) return
  try {
    activeSqlite.close()
  } catch {
    // best effort during hot reload or process shutdown
  }
}

function shutdownAfterClosingSqlite(exitCode: number) {
  closeSqliteConnection()
  process.exit(exitCode)
}

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

closeSqliteConnection()
const sqlite = new Database(DB_PATH, { timeout: 30000 })
dbRuntimeState.sqlite = sqlite
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('busy_timeout = 30000')

if (!dbRuntimeState.cleanupRegistered) {
  process.once('beforeExit', closeSqliteConnection)
  process.once('SIGTERM', () => shutdownAfterClosingSqlite(143))
  process.once('SIGINT', () => shutdownAfterClosingSqlite(130))
  dbRuntimeState.cleanupRegistered = true
}

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS dramas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    genre TEXT,
    style TEXT DEFAULT 'realistic',
    total_episodes INTEGER DEFAULT 1,
    total_duration INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft',
    thumbnail TEXT,
    tags TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drama_id INTEGER NOT NULL,
    episode_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    script_content TEXT,
    description TEXT,
    duration INTEGER DEFAULT 0,
    status TEXT DEFAULT 'draft',
    video_url TEXT,
    thumbnail TEXT,
    image_config_id INTEGER,
    video_config_id INTEGER,
    audio_config_id INTEGER,
    default_motion_preset TEXT DEFAULT 'drift',
    default_subtitle_mode TEXT DEFAULT 'dynamic',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drama_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    role TEXT,
    description TEXT,
    appearance TEXT,
    personality TEXT,
    visual_profile TEXT,
    voice_style TEXT,
    image_url TEXT,
    reference_images TEXT,
    seed_value TEXT,
    sort_order INTEGER,
    local_path TEXT,
    voice_sample_url TEXT,
    voice_provider TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS scenes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drama_id INTEGER NOT NULL,
    episode_id INTEGER,
    location TEXT NOT NULL,
    time TEXT NOT NULL,
    prompt TEXT NOT NULL,
    visual_profile TEXT,
    storyboard_count INTEGER DEFAULT 1,
    image_url TEXT,
    status TEXT DEFAULT 'pending',
    local_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS storyboards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER NOT NULL,
    scene_id INTEGER,
    storyboard_number INTEGER NOT NULL,
    title TEXT,
    location TEXT,
    time TEXT,
    shot_type TEXT,
    angle TEXT,
    movement TEXT,
    action TEXT,
    result TEXT,
    atmosphere TEXT,
    image_prompt TEXT,
    video_prompt TEXT,
    bgm_prompt TEXT,
    sound_effect TEXT,
    dialogue TEXT,
    description TEXT,
    duration INTEGER DEFAULT 0,
    generation_spec TEXT,
    review_status TEXT,
    review_notes TEXT,
    continuity_mode TEXT DEFAULT 'auto',
    continuity_source_storyboard_id INTEGER,
    motion_preset_override TEXT,
    last_composed_motion_preset TEXT,
    last_composed_subtitle_mode TEXT,
    composed_image TEXT,
    first_frame_image TEXT,
    last_frame_image TEXT,
    reference_images TEXT,
    video_url TEXT,
    tts_audio_url TEXT,
    subtitle_url TEXT,
    composed_video_url TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS episode_characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER NOT NULL,
    character_id INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_episode_characters_episode_id
    ON episode_characters (episode_id);
  CREATE INDEX IF NOT EXISTS idx_episode_characters_character_id
    ON episode_characters (character_id);

  CREATE TABLE IF NOT EXISTS episode_scenes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER NOT NULL,
    scene_id INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_episode_scenes_episode_id
    ON episode_scenes (episode_id);
  CREATE INDEX IF NOT EXISTS idx_episode_scenes_scene_id
    ON episode_scenes (scene_id);

  CREATE TABLE IF NOT EXISTS episode_props (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER NOT NULL,
    prop_id INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_episode_props_episode_id
    ON episode_props (episode_id);
  CREATE INDEX IF NOT EXISTS idx_episode_props_prop_id
    ON episode_props (prop_id);

  CREATE TABLE IF NOT EXISTS extraction_mentions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER NOT NULL,
    drama_id INTEGER NOT NULL,
    entity_type TEXT NOT NULL,
    entity_identity TEXT NOT NULL,
    entity_label TEXT,
    signal TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0,
    source_quote TEXT,
    source_span TEXT,
    scene_index INTEGER,
    location TEXT,
    time TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_extraction_mentions_episode_id
    ON extraction_mentions (episode_id);
  CREATE INDEX IF NOT EXISTS idx_extraction_mentions_entity_type
    ON extraction_mentions (episode_id, entity_type);
  CREATE INDEX IF NOT EXISTS idx_extraction_mentions_identity
    ON extraction_mentions (episode_id, entity_type, entity_identity);

  CREATE TABLE IF NOT EXISTS storyboard_characters (
    storyboard_id INTEGER NOT NULL,
    character_id INTEGER NOT NULL,
    PRIMARY KEY (storyboard_id, character_id)
  );
  CREATE INDEX IF NOT EXISTS idx_storyboard_characters_storyboard_id
    ON storyboard_characters (storyboard_id);
  CREATE INDEX IF NOT EXISTS idx_storyboard_characters_character_id
    ON storyboard_characters (character_id);

  CREATE TABLE IF NOT EXISTS ai_service_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_type TEXT NOT NULL,
    provider TEXT,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    model TEXT,
    endpoint TEXT,
    query_endpoint TEXT,
    priority INTEGER DEFAULT 0,
    is_default INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    settings TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_service_providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    display_name TEXT,
    service_type TEXT NOT NULL,
    provider TEXT NOT NULL,
    default_url TEXT,
    preset_models TEXT,
    description TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ai_voices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voice_id TEXT NOT NULL UNIQUE,
    voice_name TEXT NOT NULL,
    description TEXT,
    language TEXT,
    provider TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agent_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_type TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    model TEXT,
    system_prompt TEXT,
    temperature REAL,
    max_tokens INTEGER,
    max_iterations INTEGER,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS image_generations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    storyboard_id INTEGER,
    drama_id INTEGER,
    scene_id INTEGER,
    character_id INTEGER,
    prop_id INTEGER,
    image_type TEXT,
    frame_type TEXT,
    provider TEXT,
    prompt TEXT,
    negative_prompt TEXT,
    model TEXT,
    size TEXT,
    quality TEXT,
    style TEXT,
    steps INTEGER,
    cfg_scale REAL,
    seed INTEGER,
    image_url TEXT,
    minio_url TEXT,
    local_path TEXT,
    status TEXT DEFAULT 'pending',
    task_id TEXT,
    error_msg TEXT,
    width INTEGER,
    height INTEGER,
    reference_images TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS video_generations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    storyboard_id INTEGER,
    drama_id INTEGER,
    provider TEXT,
    prompt TEXT,
    model TEXT,
    image_gen_id INTEGER,
    reference_mode TEXT,
    image_url TEXT,
    first_frame_url TEXT,
    last_frame_url TEXT,
    reference_image_urls TEXT,
    duration INTEGER,
    fps INTEGER,
    resolution TEXT,
    aspect_ratio TEXT,
    style TEXT,
    motion_level INTEGER,
    camera_motion TEXT,
    seed INTEGER,
    video_url TEXT,
    minio_url TEXT,
    local_path TEXT,
    status TEXT DEFAULT 'pending',
    task_id TEXT,
    error_msg TEXT,
    width INTEGER,
    height INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS video_merges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    episode_id INTEGER,
    drama_id INTEGER,
    title TEXT,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    scenes TEXT,
    merged_url TEXT,
    duration INTEGER,
    task_id TEXT,
    error_msg TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS props (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drama_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT,
    description TEXT,
    prompt TEXT,
    image_url TEXT,
    reference_images TEXT,
    local_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drama_id INTEGER,
    episode_id INTEGER,
    storyboard_id INTEGER,
    storyboard_num INTEGER,
    name TEXT,
    description TEXT,
    type TEXT,
    category TEXT,
    url TEXT,
    thumbnail_url TEXT,
    local_path TEXT,
    file_size INTEGER,
    mime_type TEXT,
    width INTEGER,
    height INTEGER,
    duration INTEGER,
    format TEXT,
    image_gen_id INTEGER,
    video_gen_id INTEGER,
    is_favorite INTEGER DEFAULT 0,
    view_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS audio_cues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope_type TEXT NOT NULL,
    scope_id INTEGER NOT NULL,
    layer_type TEXT NOT NULL,
    asset_id INTEGER,
    prompt TEXT,
    start_ms INTEGER NOT NULL DEFAULT 0,
    target_duration_ms INTEGER,
    volume_db REAL NOT NULL DEFAULT 0,
    fade_in_ms INTEGER NOT NULL DEFAULT 0,
    fade_out_ms INTEGER NOT NULL DEFAULT 0,
    loop INTEGER DEFAULT 0,
    duck_dialogue INTEGER DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    metadata TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_audio_cues_scope
    ON audio_cues (scope_type, scope_id, sort_order, id);
  CREATE INDEX IF NOT EXISTS idx_audio_cues_asset_id
    ON audio_cues (asset_id);

  CREATE TABLE IF NOT EXISTS workflow_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    related_entity_type TEXT,
    related_entity_id INTEGER,
    drama_id INTEGER,
    episode_id INTEGER,
    provider TEXT,
    model TEXT,
    input_summary TEXT,
    output_summary TEXT,
    error_msg TEXT,
    metadata TEXT,
    retry_of_job_id INTEGER,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS provider_connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL UNIQUE,
    active_source TEXT,
    oauth_payload TEXT,
    ignored_auth_signature TEXT,
    account_label TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_connections_provider
    ON provider_connections (provider);
  CREATE INDEX IF NOT EXISTS idx_workflow_jobs_kind_status
    ON workflow_jobs (kind, status);
  CREATE INDEX IF NOT EXISTS idx_workflow_jobs_related_entity
    ON workflow_jobs (related_entity_type, related_entity_id);
  CREATE INDEX IF NOT EXISTS idx_workflow_jobs_episode_id
    ON workflow_jobs (episode_id);

  CREATE TABLE IF NOT EXISTS provider_usage_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_job_id INTEGER,
    service_type TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT,
    operation TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'started',
    request_hash TEXT,
    error_msg TEXT,
    latency_ms INTEGER,
    metadata TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_provider_usage_events_workflow_job_id
    ON provider_usage_events (workflow_job_id);
  CREATE INDEX IF NOT EXISTS idx_provider_usage_events_provider_status
    ON provider_usage_events (provider, status);
  CREATE INDEX IF NOT EXISTS idx_provider_usage_events_created_at
    ON provider_usage_events (created_at);

  CREATE TABLE IF NOT EXISTS prompt_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    content TEXT NOT NULL,
    variables TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    is_default INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS prompt_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt_template_id INTEGER,
    template_key TEXT NOT NULL,
    version INTEGER NOT NULL,
    action TEXT NOT NULL,
    content TEXT NOT NULL,
    variables TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_prompt_history_template_key
    ON prompt_history (template_key, version);

  CREATE TABLE IF NOT EXISTS ideas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    genre TEXT,
    tone TEXT,
    language TEXT DEFAULT 'pt-BR',
    status TEXT NOT NULL DEFAULT 'draft',
    seed_prompt TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS discovery_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    idea_id INTEGER,
    mode TEXT NOT NULL DEFAULT 'no-web',
    status TEXT NOT NULL DEFAULT 'queued',
    query TEXT,
    summary TEXT,
    provider TEXT,
    model TEXT,
    error_msg TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_discovery_runs_idea_id
    ON discovery_runs (idea_id);

  CREATE TABLE IF NOT EXISTS discovery_candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    summary TEXT,
    hook TEXT,
    premise TEXT,
    tags TEXT,
    score REAL,
    metadata TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_discovery_candidates_run_id
    ON discovery_candidates (run_id);

  CREATE TABLE IF NOT EXISTS source_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL,
    source_type TEXT NOT NULL,
    title TEXT,
    url TEXT,
    content TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_source_snapshots_run_id
    ON source_snapshots (run_id);

  CREATE TABLE IF NOT EXISTS asset_generation_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_type TEXT NOT NULL,
    cache_key TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL,
    model TEXT,
    prompt TEXT NOT NULL,
    reference_mode TEXT,
    source_image_generation_id INTEGER,
    source_video_generation_id INTEGER,
    image_url TEXT,
    video_url TEXT,
    local_path TEXT,
    metadata TEXT,
    status TEXT NOT NULL DEFAULT 'completed',
    hit_count INTEGER NOT NULL DEFAULT 0,
    last_hit_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_asset_generation_cache_asset_type
    ON asset_generation_cache (asset_type);
`)
runMigrations(sqlite)
protectPersistedSecrets(sqlite)

export const db = drizzle(sqlite, { schema })
export { schema }
export type DB = typeof db

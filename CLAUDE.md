# AGENTS.md

## Project Overview

Huobao Drama — AI-powered drama/video production tool. Full TypeScript stack.

## Structure

```
backend/   — Hono + Drizzle ORM + Mastra (AI agents) + better-sqlite3
frontend/  — Vue 3 + TypeScript + Vite (pure CSS, no UI framework)
configs/   — config.yaml
data/      — SQLite database + static files
skills/    — Agent SKILL.md definitions
```

## Commands

### Package Manager: Bun
Use `bun install` instead of `npm install`. Use `bun run <script>` to run scripts.
Backend runs on Node.js via tsx (better-sqlite3 requires Node's native addon system).

### Backend (`backend/`)
- `bun run dev` — Start dev server with tsx watch (port 5679)
- `bun start` — Start production server
- `bun run typecheck` — TypeScript type checking

### Frontend (`frontend/`)
- `bun run dev` — Nuxt dev server (port 3013, proxies /api to 5679)
- `bun run build` — Production build

## Architecture

### Backend
- **HTTP**: Hono framework with CORS, logger middleware
- **Database**: Drizzle ORM + better-sqlite3, WAL mode, schema in `src/db/schema.ts`
- **AI Agents**: Mastra framework with AI SDK (OpenAI compatible providers)
- **Agent Types**: script_rewriter, extractor, storyboard_breaker
- **SSE Streaming**: Hono streamSSE for agent chat responses
- **File Storage**: Local filesystem under `data/static/`

### Frontend
- **Vue 3** + TypeScript + Vite
- **Routing**: Vue Router (4 routes: list, detail, workbench, settings)
- **State**: Single composable `useWorkbench.ts` for workbench page
- **API**: Unified fetch client in `src/api/index.ts` with SSE async generator
- **Styling**: Pure CSS with CSS variables (dark theme)

## Database
SQLite at `data/drama_generator.db`. Schema matches existing GORM-created tables.
Auto-WAL mode. No migrations needed — reads existing DB directly.

## Key Config
- `configs/config.yaml` — AI provider defaults
- AI service configs stored in DB (`ai_service_configs` table)
- Agent configs stored in DB (`agent_configs` table)

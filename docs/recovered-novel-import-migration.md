# Recovered Novel Import Migration Notes

Source branch: `origin/feature-grid-jiangzj`

The recovered branch implemented novel import in the old Go/Vue structure. The
full original implementation note is preserved in:

```text
docs/implementation-novel-parse.md
```

The current project uses Hono + Drizzle in `backend/` and Nuxt 3 in `frontend/`,
so the Go files were not restored directly.

## Behavior To Recover In The Current Stack

- Upload a `.txt`, `.docx`, or `.pdf` novel file.
- Create a parse task linked to a drama/project.
- Track task status: `pending`, `running`, `completed`, `failed`, `cancelled`.
- Track parse progress from `0` to `100`.
- Extract episode candidates with AI.
- Save created episodes into the project.
- Let the user cancel a running task.
- Show progress in the frontend with upload, analysis, extraction, and save steps.

## Suggested Current Backend Shape

- Add a Drizzle migration for a `novel_parse_tasks` table.
- Add a Hono route module under `backend/src/routes/`.
- Add parser helpers under `backend/src/services/` or `backend/src/utils/`.
- Use existing text provider/agent infrastructure instead of the old Go AI call.
- Prefer SSE or current workflow job polling instead of ad hoc polling.

## Suggested Current Frontend Shape

- Add a Nuxt composable for task API calls.
- Add a dialog component inside `frontend/app/components/`.
- Integrate the entry point into the existing drama/project screen.
- Keep styling consistent with current pure CSS patterns.

## Original Legacy Endpoints

```text
POST /api/v1/novel-parse/tasks
POST /api/v1/novel-parse/tasks/:task_id/start
GET  /api/v1/novel-parse/tasks/:task_id
POST /api/v1/novel-parse/tasks/:task_id/cancel
```

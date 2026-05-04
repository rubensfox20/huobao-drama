<template>
  <div class="page">
    <!-- Page Header -->
    <div class="page-head">
      <div class="head-left">
        <h1 class="page-title">{{ messages.home.title }}</h1>
        <p class="page-desc">{{ t('home.projectCount', { count: dramas.length }) }}</p>
      </div>
      <button class="btn btn-primary" @click="showCreate = true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        {{ messages.home.newProject }}
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="loading-state">
      <div class="loading-grid">
        <div v-for="i in 3" :key="i" class="skeleton-card card"></div>
      </div>
    </div>

    <!-- Grid -->
    <div v-else class="grid">
      <div
        v-for="(d, i) in dramas"
        :key="d.id"
        class="card project-card"
        :style="{ animationDelay: `${i * 0.06}s` }"
        @click="navigateTo(`/drama/${d.id}`)"
      >
        <!-- Card film strip decoration -->
        <div class="card-film-strip">
          <span v-for="j in 5" :key="j" class="film-hole"></span>
        </div>

        <div class="card-body">
          <div class="card-header">
            <div class="episode-badge">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>
              {{ t('home.episodeCount', { count: d.episodes?.length || 0 }) }}
            </div>
            <button class="btn btn-ghost btn-icon card-delete" @click.stop="requestDeleteDrama(d)" :title="messages.home.deleteTitle">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
            </button>
          </div>

          <h3 class="project-title">{{ d.title }}</h3>

          <div class="project-meta">
            <span v-if="d.style" class="style-tag">{{ d.style }}</span>
            <span class="meta-item">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              {{ d.characters?.length || 0 }}
            </span>
            <span class="meta-item">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg>
              {{ d.scenes?.length || 0 }}
            </span>
          </div>
        </div>

        <div class="card-footer">
          <div class="progress-mini">
            <div class="progress-mini-track">
              <div class="progress-mini-fill" :style="{ width: getProgress(d) + '%' }"></div>
            </div>
          </div>
          <span class="card-date">{{ fmtDate(d.updated_at || d.updatedAt) }}</span>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="!dramas.length" class="card empty-card" @click="showCreate = true">
        <div class="empty-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
            <rect x="3" y="3" width="18" height="18" rx="3"/>
            <line x1="12" y1="8" x2="12" y2="16"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
          </svg>
        </div>
        <p class="empty-title">{{ messages.home.emptyTitle }}</p>
        <p class="empty-desc">{{ messages.home.emptyDescription }}</p>
      </div>
    </div>

    <!-- Create Dialog -->
    <div v-if="showCreate" class="overlay" @click.self="showCreate = false">
      <div class="modal card">
        <div class="modal-header">
          <div class="modal-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
              <rect x="3" y="3" width="18" height="18" rx="3"/>
              <line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
          </div>
          <h2 class="modal-title">{{ messages.home.modalTitle }}</h2>
          <p class="modal-desc">{{ messages.home.modalDescription }}</p>
        </div>
        <form @submit.prevent="create" class="modal-form">
          <label class="field">
            <span class="field-label">{{ messages.home.nameLabel }} <span class="required">*</span></span>
            <input v-model="form.title" class="input" :placeholder="messages.home.namePlaceholder" required autofocus />
          </label>
          <div class="field-row">
            <label class="field">
              <span class="field-label">{{ messages.home.episodesLabel }}</span>
              <input v-model.number="form.total_episodes" class="input" type="number" min="1" max="100" />
            </label>
            <label class="field">
              <span class="field-label">{{ messages.home.visualStyleLabel }}</span>
              <BaseSelect v-model="form.style" :options="styleSelectOptions" :placeholder="messages.home.visualStylePlaceholder" searchable />
            </label>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn" @click="showCreate = false">{{ messages.common.cancel }}</button>
            <button type="submit" class="btn btn-primary">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              {{ messages.home.createProject }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Delete Dialog -->
    <Teleport to="body">
      <div v-if="pendingDeleteDrama" class="overlay" @click.self="closeDeleteDialog">
        <div class="modal delete-modal card" role="dialog" aria-modal="true" :aria-labelledby="'delete-drama-title'">
          <div class="delete-modal-head">
            <div class="delete-modal-icon">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
            </div>
            <div class="delete-modal-copy">
              <h2 id="delete-drama-title" class="modal-title">{{ messages.home.deleteDialogTitle }}</h2>
              <p class="modal-desc">{{ messages.home.deleteDialogDescription }}</p>
            </div>
          </div>

          <div class="delete-target">
            <span class="delete-target-label">{{ messages.home.deleteDialogProjectLabel }}</span>
            <strong class="delete-target-title">{{ pendingDeleteDrama.title }}</strong>
            <span class="delete-target-meta">{{ t('home.episodeCount', { count: pendingDeleteDrama.episodes?.length || 0 }) }}</span>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn" :disabled="deletingDrama" @click="closeDeleteDialog">{{ messages.common.cancel }}</button>
            <button type="button" class="btn btn-danger" :disabled="deletingDrama" @click="confirmDeleteDrama">
              <svg v-if="!deletingDrama" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
              {{ deletingDrama ? messages.home.deleteDialogDeleting : messages.home.deleteDialogConfirm }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { toast } from 'vue-sonner'
import { dramaAPI } from '~/composables/useApi'
import { formatRelativeDate, useAppI18n } from '~/composables/useAppI18n'
import BaseSelect from '~/components/BaseSelect.vue'

const { messages, t } = useAppI18n()
const dramas = ref([])
const loading = ref(false)
const showCreate = ref(false)
const pendingDeleteDrama = ref(null)
const deletingDrama = ref(false)
const form = ref({ title: '', total_episodes: 1, style: '' })
const styleSelectOptions = computed(() => Object.entries(messages.home.styles).map(([value, label]) => ({ value, label })))

async function load() {
  loading.value = true
  try {
    const res = await dramaAPI.list()
    dramas.value = res.items || []
  } catch (e) {
    toast.error(e.message)
  } finally {
    loading.value = false
  }
}

async function create() {
  if (!form.value.title?.trim()) return
  try {
    const d = await dramaAPI.create(form.value)
    showCreate.value = false
    navigateTo(`/drama/${d.id}`)
  } catch (e) {
    toast.error(e.message)
  }
}

function requestDeleteDrama(d) {
  pendingDeleteDrama.value = d
}

function closeDeleteDialog() {
  if (deletingDrama.value) return
  pendingDeleteDrama.value = null
}

async function confirmDeleteDrama() {
  const d = pendingDeleteDrama.value
  if (!d) return
  deletingDrama.value = true
  try {
    await dramaAPI.del(d.id)
    toast.success(messages.home.projectDeleted)
    pendingDeleteDrama.value = null
    await load()
  } catch (e) {
    toast.error(e.message)
  } finally {
    deletingDrama.value = false
  }
}

function fmtDate(s) {
  if (!s) return ''
  return formatRelativeDate(s)
}

function getProgress(d) {
  // Rough progress based on episodes with scripts
  if (!d.episodes?.length) return 0
  const scripted = d.episodes.filter(e => e.script_content || e.scriptContent).length
  return Math.round((scripted / d.episodes.length) * 100)
}

onMounted(load)
</script>

<style scoped>
.page {
  padding: 28px 48px 40px;
  overflow-y: auto;
  height: 100%;
  animation: fadeUp 0.35s var(--ease-out) both;
}

/* Page Head */
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 28px;
}
.head-left { display: flex; flex-direction: column; gap: 4px; }
.page-title {
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-0);
}
.page-desc { font-size: 13px; color: var(--text-3); font-weight: 400; }

/* Grid */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

/* Project Card */
.project-card {
  padding: 0;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: fadeUp 0.4s var(--ease-out) both;
  transition: transform 0.22s var(--ease-out), box-shadow 0.22s var(--ease-out), border-color 0.2s;
}
.project-card:hover {
  border-color: var(--accent);
  box-shadow: var(--shadow-lg);
  transform: translateY(-3px);
}

/* Film strip decoration */
.card-film-strip {
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding: 6px 16px;
  background: var(--bg-2);
  border-bottom: 1px solid var(--border);
}
.film-hole {
  width: 10px; height: 8px;
  background: var(--bg-3);
  border-radius: 2px;
  transition: background 0.2s;
}
.project-card:hover .film-hole:nth-child(2) { background: var(--accent); }
.project-card:hover .film-hole:nth-child(4) { background: var(--accent); opacity: 0.5; }

.card-body { padding: 18px 18px 14px; flex: 1; display: flex; flex-direction: column; gap: 10px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.episode-badge {
  display: flex; align-items: center; gap: 5px;
  font-size: 11px; font-weight: 600;
  color: var(--text-3);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.episode-badge svg { color: var(--accent); }

.card-delete {
  opacity: 0;
  color: var(--text-3);
  transition: opacity 0.15s, color 0.15s, background 0.15s;
}
.project-card:hover .card-delete { opacity: 1; }
.card-delete:hover {
  background: var(--error-bg);
  color: var(--error);
}

.project-title {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--text-0);
}

.project-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.style-tag {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  background: var(--accent-bg);
  color: var(--accent-text);
  border-radius: 99px;
  border: 1px solid rgba(184,120,20,0.12);
}
.meta-item {
  display: flex; align-items: center; gap: 4px;
  font-size: 12px; color: var(--text-3);
}

.card-footer {
  padding: 10px 18px 14px;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 10px;
}
.progress-mini { flex: 1; }
.progress-mini-track {
  height: 3px; background: var(--bg-3);
  border-radius: 99px; overflow: hidden;
}
.progress-mini-fill {
  height: 100%;
  background: var(--accent-gradient);
  border-radius: 99px;
  transition: width 0.6s var(--ease-out);
}
.card-date { font-size: 11px; color: var(--text-3); white-space: nowrap; }

/* Loading Skeleton */
.loading-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}
.skeleton-card {
  height: 180px;
  background: linear-gradient(90deg, var(--bg-2) 25%, var(--bg-hover) 50%, var(--bg-2) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border: none;
}
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

/* Empty Card */
.empty-card {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; padding: 56px 32px;
  cursor: pointer;
  border-style: dashed; border-width: 1.5px;
  text-align: center;
  transition: all 0.2s var(--ease-out);
}
.empty-card:hover {
  border-color: var(--accent);
  background: var(--accent-bg);
  transform: translateY(-2px);
}
.empty-icon {
  width: 56px; height: 56px; border-radius: var(--radius-lg);
  background: var(--bg-2);
  display: flex; align-items: center; justify-content: center;
  color: var(--text-3);
  margin-bottom: 4px;
  transition: all 0.2s;
}
.empty-card:hover .empty-icon { background: var(--accent-bg); color: var(--accent); }
.empty-title { font-size: 14px; font-weight: 600; color: var(--text-1); }
.empty-desc { font-size: 12px; color: var(--text-3); max-width: 220px; line-height: 1.6; }

/* Modal */
.modal { padding: 32px; width: 460px; box-shadow: var(--shadow-elevated); animation: scaleIn 0.2s var(--ease-out); }
.modal-header { margin-bottom: 24px; display: flex; flex-direction: column; gap: 6px; }
.modal-icon {
  width: 44px; height: 44px; border-radius: var(--radius);
  background: var(--accent-bg); color: var(--accent);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 4px;
}
.modal-title { font-family: var(--font-display); font-size: 19px; font-weight: 700; }
.modal-desc { font-size: 13px; color: var(--text-3); }
.modal-form { display: flex; flex-direction: column; gap: 16px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-size: 12px; font-weight: 600; color: var(--text-1); }
.required { color: var(--error); }
.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 6px; }

.delete-modal {
  width: min(420px, calc(100vw - 32px));
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.delete-modal-head {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
.delete-modal-icon {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: var(--radius);
  background: var(--error-bg);
  color: var(--error);
  display: flex;
  align-items: center;
  justify-content: center;
}
.delete-modal-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.delete-target {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 4px 12px;
  padding: 12px 14px;
  border-radius: var(--radius);
  background: var(--bg-2);
  border: 1px solid var(--border);
}
.delete-target-label {
  grid-column: 1 / -1;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-3);
}
.delete-target-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-display);
  font-size: 14px;
  color: var(--text-0);
}
.delete-target-meta {
  align-self: center;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
  white-space: nowrap;
}
.btn-danger {
  background: var(--error);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 8px 20px rgba(210, 79, 102, 0.22), 0 2px 6px rgba(145, 42, 62, 0.16);
}
.btn-danger:hover {
  background: var(--error);
  color: #fff;
  filter: brightness(1.05);
  transform: translateY(-1px);
  box-shadow: 0 12px 24px rgba(210, 79, 102, 0.26), 0 4px 10px rgba(145, 42, 62, 0.18);
}

@media (max-width: 560px) {
  .page {
    padding: 22px 18px 32px;
  }

  .page-head,
  .modal-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .modal,
  .delete-modal {
    width: calc(100vw - 32px);
    padding: 24px;
  }

  .field-row {
    grid-template-columns: 1fr;
  }
}
</style>

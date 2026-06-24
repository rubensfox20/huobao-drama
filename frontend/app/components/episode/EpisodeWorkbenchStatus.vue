<template>
  <section class="workbench-status">
    <div class="status-card">
      <div class="status-head">
        <div>
          <div class="status-kicker">{{ title }}</div>
          <h3 class="status-title">{{ subtitle }}</h3>
        </div>
        <span class="status-pill" :class="runningJobs.length ? 'is-running' : 'is-idle'">
          {{ runningJobs.length ? t('episode.workbench.activeJobs', { count: runningJobs.length }) : t('episode.workbench.noActiveJobs') }}
        </span>
      </div>

      <div class="status-grid">
        <div class="status-block">
          <div class="status-block-head">{{ t('episode.workbench.effectiveModels') }}</div>
          <div class="badge-list">
            <div v-for="card in modelUsageCards" :key="card.key" class="badge-card">
              <span class="badge-label">{{ getServiceLabel(card.key) }}</span>
              <span class="badge-main">{{ getModelLabel(card) }}</span>
              <span class="badge-sub">{{ getJobLabel(card) }}</span>
            </div>
          </div>
        </div>

        <div class="status-block">
          <div class="status-block-head">{{ t('episode.workbench.providerHealth') }}</div>
          <div class="badge-list">
            <div v-for="card in serviceHealthCards" :key="card.key" class="badge-card">
              <div class="badge-row">
                <span class="badge-label">{{ getServiceLabel(card.key) }}</span>
                <span class="health-pill" :class="`is-${card.status}`">{{ getHealthLabel(card.status) }}</span>
              </div>
              <span class="badge-main">{{ card.label }}</span>
              <span class="badge-sub">{{ getProviderSummary(card) }}</span>
            </div>
          </div>
        </div>

        <div class="status-block">
          <div class="status-block-head">{{ t('episode.workbench.recentJobs') }}</div>
          <div v-if="recentJobs.length" class="job-list">
            <div v-for="job in recentJobs" :key="job.id" class="job-row">
              <div class="job-main">
                <span class="job-kind">{{ formatKind(job.kind) }}</span>
                <span class="job-meta">{{ formatJobMeta(job) }}</span>
              </div>
              <span class="health-pill" :class="`is-${job.status || 'queued'}`">{{ getJobStatusLabel(job.status) }}</span>
            </div>
          </div>
          <div v-else class="status-empty">{{ t('episode.workbench.noJobHistory') }}</div>
        </div>

        <div class="status-block">
          <div class="status-block-head">{{ t('episode.workbench.blockers') }}</div>
          <div v-if="blockingStages.length" class="blocker-list">
            <div v-for="item in blockingStages" :key="item.stage" class="blocker-row" :class="item.blocked ? 'is-error' : 'is-warning'">
              <span>{{ getStageLabel(item.stage) }}</span>
              <span>{{ item.issues.length }}</span>
            </div>
          </div>
          <div v-else class="status-empty">{{ t('episode.workbench.noBlockers') }}</div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { useAppI18n } from '~/composables/useAppI18n'

const props = defineProps({
  runningJobs: { type: Array, default: () => [] },
  recentJobs: { type: Array, default: () => [] },
  modelUsageCards: { type: Array, default: () => [] },
  serviceHealthCards: { type: Array, default: () => [] },
  blockingStages: { type: Array, default: () => [] },
})

const { t } = useAppI18n()
const title = t('episode.workbench.kicker')
const subtitle = t('episode.workbench.title')

function getServiceLabel(key) {
  return t(`episode.workbench.services.${key}`)
}

function getStageLabel(stage) {
  return t(`episode.workbench.stages.${stage}`)
}

function getHealthLabel(status) {
  return t(`episode.workbench.health.${status || 'unknown_error'}`)
}

function getJobStatusLabel(status) {
  const key = status || 'queued'
  if (key === 'completed') return t('episode.common.completed')
  if (key === 'failed') return t('episode.common.failed')
  if (key === 'running') return t('episode.common.generating')
  if (key === 'ready') return t('episode.workbench.health.ready')
  if (key === 'partial') return t('episode.workbench.health.partial')
  if (key === 'pending') return t('episode.common.pending')
  return t('episode.workbench.queued')
}

function getModelLabel(card) {
  if (card.model) return `${card.provider || 'provider'} · ${card.model}`
  if (card.provider) return card.provider
  return card.label
}

function getJobLabel(card) {
  if (!card.kind) return t('episode.workbench.pendingUsage')
  return `${formatKind(card.kind)}${card.jobId ? ` · #${card.jobId}` : ''}`
}

function getProviderSummary(card) {
  const services = Array.isArray(card.services) ? card.services : []
  if (!services.length) return t('episode.workbench.noProviderProbe')
  const first = services[0]
  return summarizeProviderMessage(first)
}

function formatKind(kind) {
  return String(kind || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

function formatJobMeta(job) {
  if (job.display_meta) return job.display_meta
  const provider = job.provider || ''
  const model = job.model || ''
  if (provider && model) return `${provider} · ${model}`
  if (provider) return provider
  if (job.output_summary) return job.output_summary
  return job.input_summary || t('episode.workbench.noDetails')
}

function summarizeProviderMessage(service) {
  const text = String(service?.message || '').replace(/\s+/g, ' ').trim()
  const label = service?.name || service?.provider || ''

  if (!text) return label || t('episode.workbench.noProviderProbe')
  if (text.startsWith('{') || text.startsWith('[')) {
    const model = service?.model ? ` · ${service.model}` : ''
    return `${label}${model}`.trim() || t('episode.workbench.noProviderProbe')
  }

  const normalizedText = normalizeProviderMessage(text)
  return normalizedText.length > 140 ? `${normalizedText.slice(0, 137)}...` : normalizedText
}

function normalizeProviderMessage(text) {
  if (text.replace(/[^a-z]/gi, '').toLowerCase() === 'okok') return 'OK'
  return text
}
</script>

<style scoped>
.workbench-status {
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  min-width: 0;
}

.status-card {
  padding: 0;
}

.status-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  flex-wrap: wrap;
  padding: 24px 24px 20px 24px;
}

.status-kicker {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-3);
}

.status-title {
  margin: 4px 0 0;
  font-size: 20px;
  color: var(--text-0);
}

.status-pill,
.health-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.status-pill.is-running,
.health-pill.is-running,
.health-pill.is-available,
.health-pill.is-completed {
  background: rgba(70, 126, 255, 0.12);
  color: var(--accent);
}

.status-pill.is-idle {
  background: rgba(89, 101, 126, 0.1);
  color: var(--text-2);
}

.health-pill.is-warning,
.health-pill.is-ready,
.health-pill.is-partial,
.health-pill.is-pending,
.health-pill.is-queued {
  background: rgba(255, 174, 51, 0.16);
  color: #8d5b00;
}

.health-pill.is-failed,
.health-pill.is-invalid_key,
.health-pill.is-quota_exceeded,
.health-pill.is-paid_plan_required,
.health-pill.is-unknown_error {
  background: rgba(235, 87, 87, 0.14);
  color: #b43b3b;
}

.health-pill.is-not_configured {
  background: rgba(89, 101, 126, 0.1);
  color: var(--text-2);
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;
  border-top: 1px solid var(--border);
}

.status-block {
  padding: 24px;
  min-width: 0;
}

.status-block:nth-child(odd) {
  border-right: 1px solid var(--border);
}
.status-block:nth-child(1), .status-block:nth-child(2) {
  border-bottom: 1px solid var(--border);
}

.status-block-head {
  margin-bottom: 14px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-1);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.badge-list,
.job-list,
.blocker-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.job-list {
  max-height: 280px;
  overflow-y: auto;
  padding-right: 4px;
}

.badge-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid var(--border);
  min-width: 0;
}

.badge-row,
.job-row,
.blocker-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.badge-label,
.job-kind {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-1);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.badge-main,
.job-meta {
  color: var(--text-0);
  font-size: 13px;
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.badge-sub {
  color: var(--text-2);
  font-size: 12px;
  line-height: 1.45;
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.job-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.blocker-row {
  padding: 10px 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid var(--border);
  font-size: 13px;
  color: var(--text-0);
}

.blocker-row.is-error {
  border-color: rgba(235, 87, 87, 0.18);
}

.blocker-row.is-warning {
  border-color: rgba(255, 174, 51, 0.18);
}

.status-empty {
  font-size: 13px;
  color: var(--text-2);
}

@media (max-width: 980px) {
  .status-grid {
    grid-template-columns: 1fr;
  }
}
</style>

<template>
  <section class="episode-orchestrator">
    <div class="episode-orchestrator-head">
      <div>
        <div class="episode-orchestrator-kicker">{{ episodeMessages.workbench.orchestrator.title }}</div>
        <div class="episode-orchestrator-title">{{ episodeMessages.workbench.orchestrator.subtitle }}</div>
      </div>
      <span :class="['episode-orchestrator-pill', `is-${reviewStageState}`]">{{ reviewStageLabel }}</span>
    </div>

    <div class="episode-orchestrator-meta">
      <span v-if="nextActionLabel">{{ t('episode.workbench.orchestrator.nextAction', { label: nextActionLabel }) }}</span>
      <span v-else>{{ episodeMessages.workbench.orchestrator.noNextAction }}</span>
      <span v-if="reviewPendingCount">{{ t('episode.workbench.orchestrator.pendingShots', { count: reviewPendingCount }) }}</span>
      <span v-else-if="reviewableStoryboardCount">{{ t('episode.workbench.orchestrator.readyShots', { count: reviewableStoryboardCount }) }}</span>
      <span v-if="isRunning">{{ episodeMessages.workbench.orchestrator.running }}</span>
    </div>

    <div class="episode-orchestrator-actions">
      <button class="btn" :disabled="!canStart" @click="$emit('prepare')">
        {{ episodeMessages.workbench.orchestrator.prepare }}
      </button>
      <button class="btn btn-primary" :disabled="!canStart" @click="$emit('export')">
        {{ episodeMessages.workbench.orchestrator.export }}
      </button>
    </div>
  </section>
</template>

<script setup>
import { useAppI18n } from '~/composables/useAppI18n'

defineProps({
  reviewStageState: { type: String, required: true },
  reviewStageLabel: { type: String, required: true },
  nextActionLabel: { type: String, default: '' },
  reviewPendingCount: { type: Number, default: 0 },
  reviewableStoryboardCount: { type: Number, default: 0 },
  isRunning: { type: Boolean, default: false },
  canStart: { type: Boolean, default: false },
})

defineEmits(['prepare', 'export'])

const { messages, t } = useAppI18n()
const episodeMessages = messages.episode
</script>

<style scoped>
.episode-orchestrator {
  margin-bottom: 24px;
  padding: 24px;
}

.episode-orchestrator-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.episode-orchestrator-kicker {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-3);
}

.episode-orchestrator-title {
  margin-top: 4px;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-0);
}

.episode-orchestrator-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  background: rgba(89, 101, 126, 0.1);
  color: var(--text-2);
}

.episode-orchestrator-pill.is-complete {
  background: rgba(56, 178, 112, 0.12);
  color: var(--success);
}

.episode-orchestrator-pill.is-needs_review,
.episode-orchestrator-pill.is-in_progress {
  background: rgba(255, 174, 51, 0.18);
  color: #8d5b00;
}

.episode-orchestrator-pill.is-blocked {
  background: rgba(235, 87, 87, 0.14);
  color: #b43b3b;
}

.episode-orchestrator-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  margin-top: 14px;
  font-size: 13px;
  color: var(--text-2);
}

.episode-orchestrator-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 20px;
}
</style>

<template>
  <div v-if="issues.length" class="validation-banner" :class="blocked ? 'is-blocked' : 'is-warning'">
    <div class="validation-head">
      <div>
        <div class="validation-kicker">{{ blocked ? t('episode.workbench.blockedStage') : t('episode.workbench.attentionStage') }}</div>
        <div class="validation-title">{{ title }}</div>
      </div>
      <span class="validation-pill">{{ issues.length }}</span>
    </div>
    <div class="validation-list">
      <div v-for="issue in issues" :key="`${issue.code}-${issue.entity_id || 0}`" class="validation-item">
        <span class="validation-item-severity">{{ issue.severity }}</span>
        <span>{{ issue.message }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAppI18n } from '~/composables/useAppI18n'

const props = defineProps({
  stage: { type: String, required: true },
  issues: { type: Array, default: () => [] },
  blocked: { type: Boolean, default: false },
})

const { t } = useAppI18n()
const title = computed(() => t(`episode.workbench.stages.${props.stage}`))
</script>

<style scoped>
.validation-banner {
  margin-bottom: 12px;
  padding: 20px 24px;
  border-radius: var(--radius-lg);
  border: 1px solid transparent;
}

.validation-banner.is-blocked {
  background: rgba(255, 243, 243, 0.92);
  border-color: rgba(235, 87, 87, 0.2);
}

.validation-banner.is-warning {
  background: rgba(255, 249, 236, 0.92);
  border-color: rgba(255, 174, 51, 0.22);
}

.validation-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.validation-kicker {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-3);
}

.validation-title {
  margin-top: 4px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-0);
}

.validation-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(27, 41, 64, 0.08);
  color: var(--text-1);
  font-size: 12px;
  font-weight: 600;
}

.validation-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.validation-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  border-radius: var(--radius);
  background: rgba(255, 255, 255, 0.7);
  color: var(--text-1);
  font-size: 13px;
  line-height: 1.45;
}

.validation-item-severity {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  height: 22px;
  border-radius: 999px;
  background: rgba(27, 41, 64, 0.08);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
</style>

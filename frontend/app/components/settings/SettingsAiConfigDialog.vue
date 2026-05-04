<template>
  <div v-if="open" class="overlay" @click.self="$emit('close')">
    <form class="modal card config-modal" @submit.prevent="$emit('save')">
      <div class="config-modal-head">
        <div>
          <div class="setup-kicker">{{ editId ? settings.ai.modal.kickerEdit : settings.ai.modal.kickerNew }}</div>
          <h2 class="modal-title">
            {{ editId ? settings.ai.modal.titleEdit : titleNew }}
          </h2>
          <div class="modal-note">{{ settings.ai.modal.note }}</div>
        </div>
        <span class="tag tag-accent">{{ currentServiceLabel }}</span>
      </div>

      <div class="preset-picker">
        <button
          v-for="preset in presetsByType(cfgForm.service_type)"
          :key="`${cfgForm.service_type}-${preset.provider}`"
          type="button"
          class="preset-pill"
          @click="applyProviderPreset(cfgForm.service_type, preset.provider)"
        >
          {{ preset.label }}
        </button>
      </div>

      <label class="field">
        <span class="field-label">{{ settings.ai.modal.nameLabel }}</span>
        <input v-model="cfgForm.name" class="input" :placeholder="settings.ai.modal.namePlaceholder" />
      </label>

      <label class="field">
        <span class="field-label">{{ settings.ai.modal.providerLabel }}</span>
        <BaseSelect
          v-model="cfgForm.provider"
          :options="providerSelectOptions"
          :placeholder="settings.ai.modal.providerPlaceholder"
          searchable
        />
      </label>

      <label class="field">
        <span class="field-label">{{ settings.ai.modal.priorityLabel }}</span>
        <input v-model.number="cfgForm.priority" class="input" type="number" min="0" max="999" />
        <span class="field-hint">{{ settings.ai.modal.priorityHint }}</span>
      </label>

      <div v-if="isConnectionBackedDraft" class="endpoint-hint connection-hint-card">
        <div class="connection-row">
          <span class="field-label">{{ settings.ai.modal.connectionLabel }}</span>
          <span :class="['tag', connectionStateClass(draftConnectionPayload)]">{{ connectionStateLabel(draftConnectionPayload) }}</span>
        </div>
        <div class="section-subtitle">{{ settings.ai.modal.connectionHint }}</div>
        <div v-if="draftConnectionPayload?.account_label" class="mono">{{ draftConnectionPayload.account_label }}</div>
      </div>

      <label v-else class="field">
        <span class="field-label">{{ settings.ai.modal.apiKeyLabel }}</span>
        <input v-model="cfgForm.api_key" class="input" type="password" :placeholder="cfgApiKeyPlaceholder" />
      </label>

      <label class="field">
        <span class="field-label">{{ settings.ai.modal.baseUrlLabel }}</span>
        <input v-model="cfgForm.base_url" class="input" placeholder="https://..." />
      </label>

      <div class="endpoint-hint">
        <span class="dim">{{ settings.ai.endpointPrefix }}</span>
        <span class="mono">{{ endpointHint }}</span>
      </div>

      <label class="field">
        <span class="field-label">{{ settings.ai.modal.modelLabel }}</span>
        <input v-model="cfgForm.modelStr" class="input" placeholder="model-name" />
      </label>

      <div v-if="cfgTestResult" class="test-result" :class="{ ok: cfgTestResult.reachable, bad: !cfgTestResult.reachable }">
        <div class="test-result-head">
          <span class="tag" :class="cfgTestResult.reachable ? 'tag-success' : 'tag-error'">{{ cfgTestResult.status || 'ERROR' }}</span>
          <span>{{ getCfgTestResultMessage(cfgTestResult) }}</span>
        </div>
        <div class="mono test-result-url">{{ cfgTestResult.method }} {{ cfgTestResult.url }}</div>
        <div v-if="getCfgTestResultPreview(cfgTestResult)" class="mono test-result-preview">{{ getCfgTestResultPreview(cfgTestResult) }}</div>
      </div>

      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" :disabled="cfgTesting" @click="$emit('test')">
          <Loader2 v-if="cfgTesting" :size="12" class="animate-spin" />
          <span v-else>{{ settings.ai.modal.test }}</span>
        </button>
        <button type="button" class="btn" @click="$emit('close')">{{ messages.common.cancel }}</button>
        <button type="submit" class="btn btn-primary">{{ messages.common.save }}</button>
      </div>
    </form>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Loader2 } from 'lucide-vue-next'
import BaseSelect from '~/components/BaseSelect.vue'
import { useAppI18n } from '~/composables/useAppI18n'

const props = defineProps({
  open: { type: Boolean, default: false },
  editId: { type: Number, default: null },
  settings: { type: Object, required: true },
  messages: { type: Object, required: true },
  serviceMeta: { type: Object, required: true },
  cfgForm: { type: Object, required: true },
  providerSelectOptions: { type: Array, default: () => [] },
  cfgApiKeyPlaceholder: { type: String, default: 'sk-...' },
  endpointHint: { type: String, default: '' },
  isConnectionBackedDraft: { type: Boolean, default: false },
  draftConnectionPayload: { type: Object, default: null },
  cfgTestResult: { type: Object, default: null },
  cfgTesting: { type: Boolean, default: false },
  presetsByType: { type: Function, required: true },
  applyProviderPreset: { type: Function, required: true },
  connectionStateClass: { type: Function, required: true },
  connectionStateLabel: { type: Function, required: true },
  getCfgTestResultMessage: { type: Function, required: true },
  getCfgTestResultPreview: { type: Function, required: true },
})

defineEmits(['close', 'save', 'test'])

const { t } = useAppI18n()
const currentServiceLabel = computed(() => props.serviceMeta?.[props.cfgForm.service_type]?.label || '')
const titleNew = computed(() => t('settings.ai.modal.titleNew', { service: currentServiceLabel.value.toLowerCase() }))
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(34, 45, 66, 0.32);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  animation: fadeIn 0.18s var(--ease-out);
}

.modal {
  padding: 28px;
  width: 420px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: var(--shadow-elevated);
}

.config-modal {
  width: min(720px, calc(100vw - 40px));
  max-height: calc(100vh - 48px);
  overflow-y: auto;
}

.config-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.setup-kicker {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-3);
  margin-bottom: 4px;
}

.modal-title {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
}

.modal-note {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-2);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 6px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.field-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-1);
}

.field-hint {
  font-size: 11px;
  color: var(--text-3);
  margin-top: 2px;
}

.section-subtitle {
  font-size: 11px;
  color: var(--text-3);
  margin-top: 2px;
}

.preset-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.preset-pill {
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.72);
  color: var(--text-1);
  border-radius: 999px;
  padding: 8px 11px;
  font-size: 12px;
  cursor: pointer;
}

.preset-pill:hover {
  border-color: var(--accent);
  background: var(--accent-bg);
  color: var(--accent-text);
}

.endpoint-hint {
  margin-top: -4px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px dashed var(--border);
  background: rgba(244, 248, 255, 0.72);
  font-size: 12px;
}

.connection-hint-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.connection-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.connection-row > :last-child {
  min-width: 0;
  text-align: right;
  color: var(--text-1);
}

.test-result {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-radius: 14px;
  padding: 12px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.72);
}

.test-result.ok {
  border-color: rgba(74, 167, 92, 0.28);
}

.test-result.bad {
  border-color: rgba(201, 88, 68, 0.28);
}

.test-result-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-1);
}

.test-result-url,
.test-result-preview {
  font-size: 11px;
  color: var(--text-3);
  word-break: break-all;
}

@media (max-width: 900px) {
  .config-modal {
    width: min(720px, calc(100vw - 24px));
  }
}
</style>

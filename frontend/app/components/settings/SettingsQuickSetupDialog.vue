<template>
  <div v-if="open" class="overlay" @click.self="$emit('close')">
    <form class="modal card config-modal" @submit.prevent="$emit('submit')">
      <div class="config-modal-head">
        <div>
          <div class="setup-kicker">{{ settings.ai.huobaoModal.kicker }}</div>
          <h2 class="modal-title">{{ settings.ai.huobaoModal.title }}</h2>
          <div class="modal-note">{{ settings.ai.huobaoModal.note }}</div>
        </div>
        <span class="tag tag-success">{{ settings.ai.huobaoModal.recommended }}</span>
      </div>

      <div class="preset-grid compact">
        <article v-for="preset in presets" :key="`${preset.serviceType}-${preset.provider}`" class="preset-card">
          <div class="preset-card-top">
            <span class="preset-service">{{ preset.label }}</span>
            <span class="tag tag-accent">{{ preset.provider }}</span>
          </div>
          <div class="preset-model mono">{{ preset.model }}</div>
          <div class="preset-base mono">{{ preset.baseUrl }}</div>
          <label class="field preset-card-field">
            <span class="field-label">
              {{ settings.ai.huobaoModal.apiKeyLabel }}
              <span class="dim">({{ settings.ai.huobaoModal.apiKeyHint }})</span>
            </span>
            <input v-model="preset.apiKey" class="input" type="password" :placeholder="settings.ai.huobaoModal.apiKeyPlaceholder" />
          </label>
        </article>
      </div>

      <div class="modal-actions">
        <button type="button" class="btn" @click="$emit('close')">{{ messages.common.cancel }}</button>
        <button type="submit" class="btn btn-primary">{{ settings.ai.huobaoModal.submit }}</button>
      </div>
    </form>
  </div>
</template>

<script setup>
defineProps({
  open: { type: Boolean, default: false },
  settings: { type: Object, required: true },
  messages: { type: Object, required: true },
  presets: { type: Array, default: () => [] },
})

defineEmits(['close', 'submit'])
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

.preset-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.preset-grid.compact {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 8px;
}

.preset-card {
  border: 1px solid var(--border);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.82);
  padding: 12px 13px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.preset-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.preset-service {
  font-size: 12px;
  font-weight: 600;
}

.preset-model {
  font-size: 12px;
  color: var(--text-1);
}

.preset-base {
  font-size: 11px;
  color: var(--text-3);
}

.preset-card-field {
  margin-top: 8px;
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

@media (max-width: 900px) {
  .preset-grid,
  .preset-grid.compact {
    grid-template-columns: 1fr;
  }

  .config-modal {
    width: min(720px, calc(100vw - 24px));
  }
}
</style>

<template>
  <Teleport to="body">
    <div v-if="config" class="overlay" @click.self="$emit('close')">
      <div class="modal delete-modal card" role="dialog" aria-modal="true" aria-labelledby="delete-config-title">
        <div class="delete-modal-head">
          <div class="delete-modal-icon">
            <Trash2 :size="18" />
          </div>
          <div class="delete-modal-copy">
            <h2 id="delete-config-title" class="modal-title">Excluir configuracao?</h2>
            <p class="modal-desc">Essa acao remove a configuracao selecionada. Nao e possivel desfazer.</p>
          </div>
        </div>

        <div class="delete-target">
          <span class="delete-target-label">Configuracao selecionada</span>
          <strong class="delete-target-title">{{ config.name || `${config.provider}-${config.service_type}` }}</strong>
          <span class="delete-target-meta">{{ config.provider }} · {{ config.service_type }}</span>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn" :disabled="deleting" @click="$emit('close')">{{ messages.common.cancel }}</button>
          <button type="button" class="btn btn-danger" :disabled="deleting" @click="$emit('confirm')">
            {{ deleting ? 'Excluindo...' : 'Excluir configuracao' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { Trash2 } from 'lucide-vue-next'

defineProps({
  config: { type: Object, default: null },
  deleting: { type: Boolean, default: false },
  messages: { type: Object, required: true },
})

defineEmits(['close', 'confirm'])
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

.modal-title {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
}

.modal-desc {
  font-size: 13px;
  color: var(--text-3);
  line-height: 1.6;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 6px;
}

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
</style>

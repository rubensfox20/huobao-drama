<template>
  <div class="settings-head">
    <div class="settings-brand">
      <div class="settings-brand-mark">
        <img
          v-if="showBrandImage"
          :src="brandLogo"
          :alt="brand?.alt || title"
          class="settings-brand-logo"
          @error="showBrandImage = false"
        />
        <span v-else class="settings-brand-fallback">{{ brand?.fallback || 'H' }}</span>
      </div>
      <div class="settings-brand-copy">
        <div class="settings-brand-kicker">{{ brand?.kicker || '' }}</div>
        <div class="settings-brand-name">{{ brand?.name || '' }}</div>
      </div>
    </div>
    <h2 class="settings-title">{{ title }}</h2>
    <p class="settings-desc">{{ description }}</p>
    <div v-if="$slots.actions" class="settings-head-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import brandLogo from '~/assets/huobao-logo.png'

defineProps({
  brand: { type: Object, default: () => ({}) },
  title: { type: String, required: true },
  description: { type: String, default: '' },
})

const showBrandImage = ref(true)
</script>

<style scoped>
.settings-head {
  margin-bottom: 24px;
}

.settings-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.settings-brand-mark {
  width: 42px;
  height: 42px;
  border-radius: 15px;
  border: 1px solid var(--border);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(242, 247, 255, 0.9));
  box-shadow: var(--shadow-sm);
  display: flex;
  align-items: center;
  justify-content: center;
}

.settings-brand-logo {
  width: 26px;
  height: 26px;
  object-fit: contain;
  display: block;
}

.settings-brand-fallback {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 600;
  color: var(--accent-text);
  line-height: 1;
}

.settings-brand-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
  line-height: 1;
}

.settings-brand-kicker {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-3);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.settings-brand-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-1);
  font-family: var(--font-display);
}

.settings-title {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 0;
}

.settings-desc {
  margin-top: 4px;
  font-size: 13px;
  color: var(--text-2);
}

.settings-head-actions {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>

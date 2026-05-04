<template>
  <Teleport to="body">
    <div v-if="open && src" class="overlay image-viewer-overlay" @click.self="emit('close')">
      <div class="card image-viewer-dialog">
        <div class="image-viewer-head">
          <div class="image-viewer-title">{{ displayTitle }}</div>
          <button class="btn btn-ghost btn-icon" type="button" aria-label="Fechar" @click="emit('close')">
            <X :size="14" />
          </button>
        </div>
        <div class="image-viewer-body">
          <img :src="src" :alt="displayTitle" class="image-viewer-img" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { X } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  open: boolean
  src: string
  title?: string
  defaultTitle?: string
}>(), {
  title: '',
  defaultTitle: '',
})

const emit = defineEmits<{
  close: []
}>()

const displayTitle = computed(() => props.title || props.defaultTitle)
</script>

<style scoped>
.image-viewer-overlay {
  z-index: 120;
  padding: clamp(16px, 3vw, 32px);
  background: rgba(18, 24, 34, 0.68);
  backdrop-filter: blur(10px);
}

.image-viewer-dialog {
  width: min(1040px, calc(100vw - 96px));
  max-width: 100%;
  max-height: calc(100vh - 64px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: var(--radius-xl);
  background: var(--bg-0);
}

.image-viewer-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
}

.image-viewer-title {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-1);
  font-family: var(--font-display);
}

.image-viewer-body {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  overflow: auto;
  min-height: 0;
}

.image-viewer-img {
  display: block;
  max-width: 100%;
  width: auto;
  height: auto;
  max-height: calc(100vh - 168px);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-elevated);
  background: var(--bg-0);
}

@media (max-width: 700px) {
  .image-viewer-overlay {
    padding: 16px;
  }

  .image-viewer-dialog {
    width: calc(100vw - 32px);
    max-height: calc(100vh - 32px);
  }
}
</style>

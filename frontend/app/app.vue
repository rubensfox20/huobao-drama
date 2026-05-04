<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <Toaster
    position="top-right"
    :duration="3000"
    class="app-toaster"
    offset="24px"
    :style="{ top: '72px', right: '20px' }"
  />
</template>

<script setup>
import { Toaster } from 'vue-sonner'
</script>

<style>
@import url('./assets/studio.css');

.app-toaster[data-y-position='top'][data-x-position='right'] {
  top: 72px !important;
  right: 20px !important;
}

.app-toaster [data-sonner-toast][data-styled='true'] {
  padding: 14px 16px !important;
}

@media (max-width: 600px) {
.app-toaster[data-y-position='top'][data-x-position='right'] {
    top: 32px !important;
    right: 12px !important;
  }
}
</style>

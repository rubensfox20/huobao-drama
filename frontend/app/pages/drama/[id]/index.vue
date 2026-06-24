<template>
  <div></div>
</template>

<script setup>
definePageMeta({ layout: false })

const route = useRoute()

await navigateTo(
  { path: '/', query: { project: String(route.params.id) } },
  { replace: true },
)
</script>

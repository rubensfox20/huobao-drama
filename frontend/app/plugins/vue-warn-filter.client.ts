const SUSPENSE_EXPERIMENTAL_WARNING = '<Suspense> is an experimental feature and its API will likely change.'

export default defineNuxtPlugin((nuxtApp) => {
  const previousWarnHandler = nuxtApp.vueApp.config.warnHandler

  nuxtApp.vueApp.config.warnHandler = (message, instance, trace) => {
    if (message.includes(SUSPENSE_EXPERIMENTAL_WARNING)) return

    if (previousWarnHandler) {
      previousWarnHandler(message, instance, trace)
      return
    }

    console.warn(`[Vue warn]: ${message}${trace || ''}`)
  }
})

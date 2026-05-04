const backendOrigin = process.env.NUXT_DEV_BACKEND_URL || 'http://localhost:5679'

export default defineNuxtConfig({
  srcDir: 'app/',
  ssr: false,
  devtools: { enabled: false },
  experimental: {
    appManifest: false,
  },
  app: {
    head: {
      title: 'Huobao Drama',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
      link: [
        { rel: 'icon', type: 'image/png', href: '/favicon.png' },
        { rel: 'shortcut icon', type: 'image/png', href: '/favicon.png' },
      ],
    },
  },
  vite: {
    server: {
      proxy: {
        '/api': { target: backendOrigin, changeOrigin: true },
        '/static': { target: backendOrigin, changeOrigin: true },
      },
    },
  },
  nitro: {
    routeRules: {
      '/api/**': { proxy: `${backendOrigin}/api/**` },
      '/static/**': { proxy: `${backendOrigin}/static/**` },
    },
  },
  compatibilityDate: '2025-05-15',
})

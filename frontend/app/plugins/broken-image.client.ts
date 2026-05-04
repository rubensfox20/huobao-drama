/**
 * broken-image.client.ts
 *
 * Global client plugin that replaces broken / 404 images with an elegant
 * inline SVG placeholder that matches the HuoBao Studio design system.
 *
 * Works by listening to `error` events on all `<img>` elements via
 * event delegation on the document body.
 */

export default defineNuxtPlugin(() => {
  const HANDLED_ATTR = 'data-broken-handled'

  function applyPlaceholder(element: HTMLElement, type: 'image' | 'video' | 'audio') {
    // Prevent re-processing
    if (element.hasAttribute(HANDLED_ATTR)) return
    element.setAttribute(HANDLED_ATTR, '1')

    // Create wrapper that inherits the element's position in the layout
    const wrapper = document.createElement('div')
    wrapper.className = 'broken-image-placeholder'

    // Copy relevant sizing from the element
    const computed = window.getComputedStyle(element)
    wrapper.style.width = computed.width
    wrapper.style.height = computed.height
    // Ensure a minimum reasonable height for audio elements which are typically thin
    if (type === 'audio') {
      wrapper.style.height = '42px'
      wrapper.style.minHeight = '42px'
      wrapper.style.flexDirection = 'row'
      wrapper.style.gap = '8px'
    }

    if (type === 'video') {
      wrapper.innerHTML = `
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="4" width="20" height="16" rx="3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          <path d="M10 9L15 12L10 15V9Z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          <line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" opacity="0.35"/>
        </svg>
        <span>Vídeo indisponível</span>
      `
    } else if (type === 'audio') {
      wrapper.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink: 0;">
          <path d="M11 5L6 9H2V15H6L11 19V5Z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          <line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" opacity="0.35"/>
        </svg>
        <span>Áudio indisponível</span>
      `
    } else {
      wrapper.innerHTML = `
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="2" width="20" height="20" rx="3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          <circle cx="8.5" cy="8.5" r="2" stroke="currentColor" stroke-width="1.3"/>
          <path d="M2 17l5-5 3 3 4-4 8 8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>
          <line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" opacity="0.35"/>
        </svg>
        <span>Imagem indisponível</span>
      `
    }

    // Replace the broken element with the placeholder
    element.parentElement?.replaceChild(wrapper, element)
  }

  // Use capture phase so we catch errors before they bubble
  document.addEventListener(
    'error',
    (e: Event) => {
      const target = e.target as HTMLElement
      if (!target) return

      if (target.tagName === 'IMG') {
        applyPlaceholder(target as HTMLImageElement, 'image')
      } else if (target.tagName === 'VIDEO') {
        applyPlaceholder(target as HTMLVideoElement, 'video')
      } else if (target.tagName === 'AUDIO') {
        applyPlaceholder(target as HTMLAudioElement, 'audio')
      } else if (target.tagName === 'SOURCE') {
        if (target.parentElement?.tagName === 'VIDEO') {
          applyPlaceholder(target.parentElement as HTMLVideoElement, 'video')
        } else if (target.parentElement?.tagName === 'AUDIO') {
          applyPlaceholder(target.parentElement as HTMLAudioElement, 'audio')
        }
      }
    },
    true // capture phase
  )
})

import { joinProviderUrl } from './adapters/url.js'

function bearerHeaders(apiKey?: string, withJson = false) {
  const headers: Record<string, string> = {}
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  if (withJson) headers['Content-Type'] = 'application/json'
  return headers
}

function geminiHeaders(apiKey?: string, withJson = false) {
  const headers: Record<string, string> = {}
  if (apiKey) headers['x-goog-api-key'] = apiKey
  if (withJson) headers['Content-Type'] = 'application/json'
  return headers
}

function viduHeaders(apiKey?: string, withJson = false) {
  const headers: Record<string, string> = {}
  if (apiKey) headers.Authorization = `Token ${apiKey}`
  if (withJson) headers['Content-Type'] = 'application/json'
  return headers
}

export function buildProviderProbe(serviceType: string, provider: string, baseUrl: string, model?: string, apiKey?: string) {
  const p = provider.toLowerCase()
  const m = model || ''

  if (p === 'gemini') {
    const defaultModel = serviceType === 'audio'
      ? 'gemini-2.5-flash-preview-tts'
      : serviceType === 'image'
        ? 'gemini-2.5-flash-image'
        : 'gemini-2.5-flash'

    if (serviceType === 'text') {
      return {
        method: 'GET',
        url: joinProviderUrl(baseUrl, '/v1beta/openai', '/models'),
        headers: bearerHeaders(apiKey),
        body: undefined,
      }
    }

    return {
      method: 'GET',
      url: joinProviderUrl(baseUrl, '/v1beta', `/models/${m || defaultModel}`),
      headers: geminiHeaders(apiKey),
      body: undefined,
    }
  }

  if (p === 'openai' || p === 'openrouter' || p === 'chatfire') {
    return {
      method: 'GET',
      url: joinProviderUrl(baseUrl, '/v1', '/models'),
      headers: bearerHeaders(apiKey),
      body: undefined,
    }
  }

  if (p === 'ali') {
    return {
      method: 'POST',
      url: joinProviderUrl(baseUrl, '/api/v1', serviceType === 'video'
        ? '/services/aigc/video-generation/video-synthesis'
        : '/services/aigc/image-generation/generation'),
      headers: bearerHeaders(apiKey, true),
      body: {},
    }
  }

  if (p === 'volcengine') {
    const path = serviceType === 'video'
      ? '/contents/generations/tasks'
      : '/images/generations'
    return {
      method: 'POST',
      url: joinProviderUrl(baseUrl, '/api/v1', path),
      headers: bearerHeaders(apiKey, true),
      body: {},
    }
  }

  if (p === 'minimax') {
    if (serviceType === 'audio') {
      return {
        method: 'POST',
        url: joinProviderUrl(baseUrl, '/v1', '/get_voice'),
        headers: bearerHeaders(apiKey, true),
        body: { voice_type: 'all' },
      }
    }

    const path = serviceType === 'video'
      ? '/video_generation'
      : serviceType === 'image'
        ? '/image_generation'
        : '/t2a_v2'
    return {
      method: 'POST',
      url: joinProviderUrl(baseUrl, '/v1', path),
      headers: bearerHeaders(apiKey, true),
      body: {},
    }
  }

  if (p === 'vidu') {
    return {
      method: 'POST',
      url: joinProviderUrl(baseUrl, '', '/ent/v2/img2video'),
      headers: viduHeaders(apiKey, true),
      body: {},
    }
  }

  if (p === 'huggingface') {
    return {
      method: 'GET',
      url: 'https://huggingface.co/api/whoami-v2',
      headers: bearerHeaders(apiKey),
      body: undefined,
    }
  }

  if (p === 'leonardo') {
    return {
      method: 'GET',
      url: joinProviderUrl(baseUrl, '/api/rest/v1', '/platformModels'),
      headers: {
        ...bearerHeaders(apiKey),
        Accept: 'application/json',
      },
      body: undefined,
    }
  }

  return {
    method: 'GET',
    url: joinProviderUrl(baseUrl, '', m ? `/${m}` : '/'),
    headers: bearerHeaders(apiKey),
    body: undefined,
  }
}

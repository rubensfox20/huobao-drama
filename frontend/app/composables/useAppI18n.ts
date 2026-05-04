import { ptBR } from '~/i18n/locales/pt-BR'

export const DEFAULT_LOCALE = 'pt-BR' as const

const locales = {
  'pt-BR': ptBR,
} as const

type AppLocale = keyof typeof locales

function getByPath(source: Record<string, any>, path: string) {
  return path.split('.').reduce<any>((current, segment) => current?.[segment], source)
}

function interpolate(template: string, params: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`))
}

export function useAppI18n() {
  const locale = DEFAULT_LOCALE satisfies AppLocale
  const messages = locales[locale]

  function t(path: string, params?: Record<string, string | number>) {
    const value = getByPath(messages, path)
    if (typeof value !== 'string') {
      throw new Error(`Missing i18n key: ${path}`)
    }
    return params ? interpolate(value, params) : value
  }

  return { locale, messages, t }
}

export function formatRelativeDate(value: string | number | Date) {
  const date = new Date(value)
  const diff = Date.now() - date.getTime()

  if (diff < 60_000) return 'Agora mesmo'
  if (diff < 3_600_000) return `Ha ${Math.floor(diff / 60_000)} min`
  if (diff < 86_400_000) return `Ha ${Math.floor(diff / 3_600_000)} h`
  if (diff < 604_800_000) return `Ha ${Math.floor(diff / 86_400_000)} d`

  return date.toLocaleDateString(DEFAULT_LOCALE, { day: '2-digit', month: 'short' })
}

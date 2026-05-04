import { ref } from 'vue'
import { toast } from 'vue-sonner'
import { useAppI18n } from './useAppI18n'
import { providerAvailabilityAPI, systemHealthAPI, workflowJobsAPI } from './useApi'

const OBSERVABILITY_PROVIDERS = ['ali', 'chatfire', 'gemini', 'github-copilot', 'huggingface', 'leonardo', 'minimax', 'openai', 'openai-codex', 'openrouter', 'vidu', 'volcengine']

export function useSettingsObservability() {
  const { messages } = useAppI18n()
  const settings = messages.settings

  const providers = OBSERVABILITY_PROVIDERS
  const observability = ref<Record<string, any>>({})
  const workflowJobs = ref<any[]>([])
  const providerSnapshot = ref<any>(null)

  async function refreshObservability() {
    try {
      observability.value = await systemHealthAPI.get()
      workflowJobs.value = await workflowJobsAPI.list()
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  async function checkProvider(provider: string) {
    try {
      providerSnapshot.value = await providerAvailabilityAPI.get(provider)
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  return {
    settings,
    providers,
    observability,
    workflowJobs,
    providerSnapshot,
    refreshObservability,
    checkProvider,
  }
}

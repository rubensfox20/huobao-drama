import { reactive, ref } from 'vue'
import { toast } from 'vue-sonner'
import { useAppI18n } from './useAppI18n'
import { discoveryAPI, ideasAPI } from './useApi'

export function useSettingsIdeasLab() {
  const { messages } = useAppI18n()
  const settings = messages.settings

  const ideas = ref<any[]>([])
  const selectedIdeaId = ref<number | null>(null)
  const discoveryRun = ref<any>(null)
  const discoveryIdeaId = ref<number | null>(null)
  const ideaForm = reactive({
    title: '',
    description: '',
    genre: '',
    tone: '',
  })
  const discoveryForm = reactive({
    query: '',
  })

  async function loadIdeas() {
    try {
      ideas.value = await ideasAPI.list()
      if (!selectedIdeaId.value && ideas.value.length) {
        selectedIdeaId.value = ideas.value[0].id
      }
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  async function createIdea() {
    try {
      await ideasAPI.create(ideaForm)
      ideaForm.title = ''
      ideaForm.description = ''
      ideaForm.genre = ''
      ideaForm.tone = ''
      await loadIdeas()
      toast.success(settings.ideasLab.createSuccess)
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  async function deleteIdea(id: number) {
    try {
      await ideasAPI.del(id)
      if (selectedIdeaId.value === id) selectedIdeaId.value = null
      await loadIdeas()
      toast.success(settings.ideasLab.deleteSuccess)
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  async function runDiscoveryForIdea(id: number, mode: string) {
    try {
      discoveryIdeaId.value = id
      discoveryRun.value = await discoveryAPI.run({
        idea_id: id,
        mode,
        query: discoveryForm.query,
      })
      toast.success(settings.ideasLab.discoverySuccess)
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  async function applyDiscoveryCandidate(candidateId: number) {
    if (!discoveryRun.value?.id) return

    try {
      const drama = await discoveryAPI.apply(discoveryRun.value.id, { candidate_id: candidateId, total_episodes: 3 })
      toast.success(settings.ideasLab.applySuccess)
      await navigateTo(`/drama/${drama.id}`)
    } catch (error: any) {
      toast.error(error.message)
    }
  }

  return {
    settings,
    ideas,
    selectedIdeaId,
    discoveryRun,
    discoveryIdeaId,
    ideaForm,
    discoveryForm,
    loadIdeas,
    createIdea,
    deleteIdea,
    runDiscoveryForIdea,
    applyDiscoveryCandidate,
  }
}

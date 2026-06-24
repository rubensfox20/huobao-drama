
<template>
  <div class="settings-layout">
    <aside class="settings-nav">
      <div class="nav-group">
        <div class="nav-group-label">{{ settings.nav.basic }}</div>
        <button v-for="item in baseTabs" :key="item.id" :class="['nav-item', { active: tab === item.id }]" @click="tab = item.id">
          <component :is="item.icon" :size="14" />
          {{ item.label }}
        </button>
      </div>
      <div class="nav-advanced">
        <label class="advanced-toggle">
          <span>{{ settings.nav.advancedToggle }}</span>
          <input type="checkbox" v-model="showAdvanced" />
          <span class="advanced-slider"></span>
        </label>
        <p class="advanced-note">{{ settings.nav.advancedNote }}</p>
      </div>
      <div v-if="showAdvanced" class="nav-group">
        <div class="nav-group-label">{{ settings.nav.advanced }}</div>
        <button v-for="item in advancedTabs" :key="item.id" :class="['nav-item', { active: tab === item.id }]" @click="tab = item.id">
          <component :is="item.icon" :size="14" />
          {{ item.label }}
        </button>
      </div>
    </aside>

    <div class="settings-content">
      <section class="card admin-session-panel">
        <div class="admin-session-copy">
          <div class="setup-title">{{ settings.adminSession.title }}</div>
          <div class="setup-desc">
            {{ isLocalAdminMode ? settings.adminSession.localDescription : adminSessionAuthenticated ? settings.adminSession.connectedDescription : settings.adminSession.description }}
          </div>
        </div>
        <div class="admin-session-actions">
          <span :class="['tag', canAccessAdminSections ? 'tag-accent' : '']">{{ adminSessionStatusLabel }}</span>
          <div v-if="!isLocalAdminMode" class="admin-session-form">
            <input
              v-model="adminTokenInput"
              class="input admin-session-input"
              type="password"
              :placeholder="settings.adminSession.tokenPlaceholder"
              @keyup.enter="saveAdminSession"
            />
            <button class="btn btn-primary btn-sm" :disabled="adminSessionBusy || !adminTokenInput.trim()" @click="saveAdminSession">
              {{ adminSessionBusy ? settings.adminSession.checking : settings.adminSession.save }}
            </button>
            <button class="btn btn-ghost btn-sm" :disabled="adminSessionBusy" @click="reloadAdminSession">
              {{ settings.adminSession.refresh }}
            </button>
            <button v-if="adminSessionAuthenticated" class="btn btn-ghost btn-sm" :disabled="adminSessionBusy" @click="clearAdminSession">
              <LogOut :size="12" /> {{ settings.adminSession.clear }}
            </button>
          </div>
        </div>
      </section>

      <div v-if="canAccessAdminSections" class="settings-admin-sections">
      <div v-if="tab === 'ai'" class="settings-scroll">
        <SettingsPageHeader :brand="settings.brand" :title="settings.ai.title" :description="settings.ai.description" />
        <section class="setup-panel card">
          <div class="setup-panel-head">
            <div>
              <div class="setup-kicker">{{ settings.ai.quickSetupKicker }}</div>
              <div class="setup-title">{{ settings.ai.quickSetupTitle }}</div>
              <div class="setup-desc">{{ settings.ai.quickSetupDescription }}</div>
            </div>
            <button class="btn btn-primary" @click="openQuickSetupDialog">
              <Sparkles :size="14" /> {{ settings.ai.quickSetupButton }}
            </button>
          </div>
          <div class="preset-grid">
            <article v-for="preset in quickSetupPresetCards" :key="`${preset.serviceType}-${preset.provider}`" class="preset-card">
              <div class="preset-card-top">
                <span class="preset-service">{{ preset.label }}</span>
                <span class="tag tag-accent">{{ preset.provider }}</span>
              </div>
              <div class="preset-model mono">{{ preset.model }}</div>
              <div class="preset-base mono">{{ preset.baseUrl }}</div>
            </article>
          </div>
        </section>
        <section class="setup-panel card">
          <div class="setup-panel-head compact">
            <div>
              <div class="setup-title">{{ settings.ai.templatesTitle }}</div>
              <div class="setup-desc">{{ settings.ai.templatesDescription }}</div>
            </div>
          </div>
          <div class="template-row">
            <button
              v-for="service in serviceTypes"
              :key="service.type"
              class="template-type-chip"
              @click="startAddCfg(service.type)"
            >
              {{ service.label }}
            </button>
          </div>
        </section>
        <div class="sections">
          <section v-for="service in serviceTypes" :key="service.type">
            <div class="section-head">
              <div>
                <span class="section-title">{{ service.label }}</span>
                <div class="section-subtitle">{{ serviceMeta[service.type].desc }}</div>
              </div>
              <span v-if="countActive(service.type)" class="tag tag-accent">{{ t('settings.ai.activeCount', { count: countActive(service.type) }) }}</span>
              <button class="btn btn-ghost btn-sm ml-auto" @click="startAddCfg(service.type)"><Plus :size="13" /> {{ settings.ai.add }}</button>
            </div>
            <div class="config-list">
              <div v-for="config in byType(service.type)" :key="config.id" class="card config-row">
                <div class="config-info">
                  <div class="config-main">
                    <div class="config-line">
                      <span class="config-provider">{{ config.provider }}</span>
                      <span class="config-name">{{ config.name || `${config.provider}-${config.service_type}` }}</span>
                    </div>
                    <span class="config-model mono truncate">{{ fmtModel(config.model) }}</span>
                    <span class="config-base mono truncate">{{ config.base_url || settings.ai.unsetBaseUrl }}</span>
                  </div>
                </div>
                <span :class="['tag', configConnectionTagClass(config)]">{{ configConnectionTagLabel(config) }}</span>
                <button class="btn btn-ghost btn-sm" @click="testExistingCfg(config)">{{ settings.ai.test }}</button>
                <label class="toggle"><input type="checkbox" :checked="config.is_active" @change="toggleCfg(config)"><span /></label>
                <button class="btn btn-ghost btn-icon" @click="startEditCfg(config)"><Pencil :size="13" /></button>
                <button class="btn btn-ghost btn-icon" @click="requestDeleteCfg(config)"><Trash2 :size="13" /></button>
              </div>
              <p v-if="!byType(service.type).length" class="config-empty">{{ settings.ai.empty }}</p>
            </div>
          </section>
        </div>
      </div>
      <div v-else-if="tab === 'connections'" class="settings-scroll">
        <SettingsPageHeader :brand="settings.brand" :title="settings.connections.title" :description="settings.connections.description">
          <template #actions>
            <button class="btn btn-primary btn-sm" :disabled="connectionsRefreshing" @click="loadProviderConnectionsStatus()">
              <RefreshCw v-if="connectionsRefreshing" :size="12" class="animate-spin" />
              <span v-else>{{ settings.connections.refresh }}</span>
            </button>
          </template>
        </SettingsPageHeader>

        <div class="connections-grid">
          <section class="card connection-card">
            <div class="section-head">
              <div class="connection-card-copy">
                <span class="section-title">{{ settings.connections.codexTitle }}</span>
                <div class="section-subtitle">{{ settings.connections.codexDescription }}</div>
              </div>
              <span :class="['tag', connectionStateClass(codexConnection)]">{{ connectionStateLabel(codexConnection) }}</span>
            </div>

            <div class="connection-card-main">
              <div class="connection-summary">
                <div class="connection-row">
                  <span class="field-label">{{ settings.connections.accountLabel }}</span>
                  <span class="connection-value">{{ codexConnection?.account_label || '-' }}</span>
                </div>
                <div class="connection-row">
                  <span class="field-label">{{ settings.connections.sourceLabel }}</span>
                  <span class="connection-value mono">{{ codexConnection?.active_source || '-' }}</span>
                </div>
                <div class="connection-row">
                  <span class="field-label">{{ settings.connections.modelsLabel }}</span>
                  <div class="connection-model-list">
                    <span v-for="model in getConnectionModels('openai-codex', codexConnection)" :key="`codex-${model}`" class="connection-model-chip mono">{{ model }}</span>
                  </div>
                </div>
              </div>

              <div v-if="codexConnection?.connected && !connectionBusy(codexConnection)" class="connection-actions connection-actions-primary">
                <button class="btn btn-ghost btn-sm" :disabled="connectionBusy(codexConnection)" @click="syncCodexConnection">{{ settings.connections.sync }}</button>
                <button class="btn btn-ghost btn-sm" :disabled="connectionBusy(codexConnection)" @click="disconnectCodexConnection">{{ settings.connections.disconnect }}</button>
              </div>
              <div v-else-if="connectionBusy(codexConnection)" class="connection-actions connection-actions-primary">
                <button class="btn btn-ghost btn-sm" @click="cancelCodexConnection">{{ settings.connections.cancel }}</button>
              </div>
              <div v-else class="connection-actions">
                <button class="btn btn-ghost btn-sm" :disabled="connectionBusy(codexConnection)" @click="startCodexConnection('local')">{{ settings.connections.codexLocal }}</button>
                <button class="btn btn-ghost btn-sm" :disabled="connectionBusy(codexConnection)" @click="startCodexConnection('login')">{{ settings.connections.codexLogin }}</button>
                <button class="btn btn-ghost btn-sm" :disabled="connectionBusy(codexConnection)" @click="startCodexConnection('code')">{{ settings.connections.codexCode }}</button>
              </div>
            </div>

            <div class="connection-session card">
              <div class="setup-title">{{ settings.connections.sessionTitle }}</div>
              <div class="connection-summary">
                <div class="connection-row">
                  <span class="field-label">Status</span>
                  <span class="connection-value">{{ connectionStateLabel(codexConnection) }}</span>
                </div>
                <div v-if="connectionVerificationVisible(codexConnection) && codexConnection?.verification_uri" class="connection-row">
                  <span class="field-label">Link</span>
                  <div class="connection-copy-group">
                    <span class="mono connection-copy-value" :title="codexConnection.verification_uri">{{ codexConnection.verification_uri }}</span>
                    <button class="btn btn-ghost btn-icon connection-copy-btn" :title="settings.connections.copyUrl" @click="copyConnectionValue(codexConnection.verification_uri)"><Copy :size="12" /></button>
                  </div>
                </div>
                <div v-if="connectionVerificationVisible(codexConnection) && codexConnection?.user_code" class="connection-row">
                  <span class="field-label">{{ settings.connections.userCode }}</span>
                  <div class="connection-copy-group">
                    <span class="mono connection-copy-value" :title="codexConnection.user_code">{{ codexConnection.user_code }}</span>
                    <button class="btn btn-ghost btn-icon connection-copy-btn" :title="settings.connections.copyCode" @click="copyConnectionValue(codexConnection.user_code)"><Copy :size="12" /></button>
                  </div>
                </div>
                <div class="connection-note">{{ getConnectionSessionMessage(codexConnection) }}</div>
              </div>
            </div>
          </section>

          <section class="card connection-card">
            <div class="section-head">
              <div class="connection-card-copy">
                <span class="section-title">{{ settings.connections.copilotTitle }}</span>
                <div class="section-subtitle">{{ settings.connections.copilotDescription }}</div>
              </div>
              <span :class="['tag', connectionStateClass(copilotConnection)]">{{ connectionStateLabel(copilotConnection) }}</span>
            </div>

            <div class="connection-card-main">
              <div class="connection-summary">
                <div class="connection-row">
                  <span class="field-label">{{ settings.connections.accountLabel }}</span>
                  <span class="connection-value">{{ copilotConnection?.account_label || '-' }}</span>
                </div>
                <div class="connection-row">
                  <span class="field-label">{{ settings.connections.sourceLabel }}</span>
                  <span class="connection-value mono">{{ copilotConnection?.active_source || '-' }}</span>
                </div>
                <div class="connection-row">
                  <span class="field-label">{{ settings.connections.modelsLabel }}</span>
                  <div class="connection-model-list">
                    <span v-for="model in getConnectionModels('github-copilot', copilotConnection)" :key="`copilot-${model}`" class="connection-model-chip mono">{{ model }}</span>
                  </div>
                </div>
              </div>

              <div v-if="copilotConnection?.connected && !connectionBusy(copilotConnection)" class="connection-actions connection-actions-primary">
                <button class="btn btn-ghost btn-sm" :disabled="connectionBusy(copilotConnection)" @click="syncCopilotConnection">{{ settings.connections.sync }}</button>
                <button class="btn btn-ghost btn-sm" :disabled="connectionBusy(copilotConnection)" @click="disconnectCopilotConnection">{{ settings.connections.disconnect }}</button>
              </div>
              <div v-else-if="connectionBusy(copilotConnection)" class="connection-actions connection-actions-primary">
                <button class="btn btn-ghost btn-sm" @click="cancelCopilotConnection">{{ settings.connections.cancel }}</button>
              </div>
              <div v-else class="connection-actions">
                <button class="btn btn-ghost btn-sm" :disabled="connectionBusy(copilotConnection)" @click="startCopilotConnection('local')">{{ settings.connections.copilotLocal }}</button>
                <button class="btn btn-ghost btn-sm" :disabled="connectionBusy(copilotConnection)" @click="startCopilotConnection('code')">{{ settings.connections.copilotCode }}</button>
              </div>
            </div>

            <div class="connection-session card">
              <div class="setup-title">{{ settings.connections.sessionTitle }}</div>
              <div class="connection-summary">
                <div class="connection-row">
                  <span class="field-label">Status</span>
                  <span class="connection-value">{{ connectionStateLabel(copilotConnection) }}</span>
                </div>
                <div v-if="connectionVerificationVisible(copilotConnection) && copilotConnection?.verification_uri" class="connection-row">
                  <span class="field-label">Link</span>
                  <div class="connection-copy-group">
                    <span class="mono connection-copy-value" :title="copilotConnection.verification_uri">{{ copilotConnection.verification_uri }}</span>
                    <button class="btn btn-ghost btn-icon connection-copy-btn" :title="settings.connections.copyUrl" @click="copyConnectionValue(copilotConnection.verification_uri)"><Copy :size="12" /></button>
                  </div>
                </div>
                <div v-if="connectionVerificationVisible(copilotConnection) && copilotConnection?.user_code" class="connection-row">
                  <span class="field-label">{{ settings.connections.userCode }}</span>
                  <div class="connection-copy-group">
                    <span class="mono connection-copy-value" :title="copilotConnection.user_code">{{ copilotConnection.user_code }}</span>
                    <button class="btn btn-ghost btn-icon connection-copy-btn" :title="settings.connections.copyCode" @click="copyConnectionValue(copilotConnection.user_code)"><Copy :size="12" /></button>
                  </div>
                </div>
                <div class="connection-note">{{ getConnectionSessionMessage(copilotConnection) }}</div>
              </div>
            </div>
          </section>
        </div>
      </div>
      <div v-else-if="tab === 'prompts'" class="settings-scroll">
        <SettingsPageHeader :brand="settings.brand" :title="settings.promptStudio.title" :description="settings.promptStudio.description" />

        <div class="prompt-studio">
          <aside class="card prompt-list-card">
            <div class="setup-title">{{ settings.promptStudio.title }}</div>
            <div class="prompt-list">
              <button
                v-for="item in promptTemplates"
                :key="item.key"
                :class="['prompt-list-item', { active: selectedPromptKey === item.key }]"
                @click="selectPrompt(item.key)"
              >
                <div class="prompt-list-name">{{ item.name }}</div>
                <div class="prompt-list-meta">{{ item.category }} · v{{ item.version }}</div>
              </button>
            </div>
            <p v-if="!promptTemplates.length" class="config-empty">{{ settings.promptStudio.empty }}</p>
          </aside>

          <section class="prompt-editor-column">
            <div v-if="selectedPrompt" class="card prompt-editor-card">
              <div class="section-head">
                <div>
                  <span class="section-title">{{ selectedPrompt.name }}</span>
                  <div class="section-subtitle">{{ selectedPrompt.description }}</div>
                </div>
                <div class="prompt-editor-actions">
                  <button class="btn btn-ghost btn-sm" @click="testPromptTemplate">{{ settings.ai.test }}</button>
                  <button class="btn btn-ghost btn-sm" @click="resetPromptTemplate">{{ settings.promptStudio.reset }}</button>
                  <button class="btn btn-primary btn-sm" @click="savePromptTemplate">{{ messages.common.save }}</button>
                </div>
              </div>

              <label class="field">
                <span class="field-label">{{ settings.promptStudio.contentLabel }}</span>
                <textarea
                  ref="promptEditorEl"
                  v-model="promptEditor"
                  class="textarea textarea-auto mono"
                  rows="1"
                  @input="resizePromptTextareas"
                />
              </label>

              <div class="prompt-test-stack">
                <label class="field">
                  <span class="field-label">{{ settings.promptStudio.variablesLabel }}</span>
                  <textarea
                    ref="promptVariablesEl"
                    v-model="promptVariables"
                    class="textarea textarea-auto mono"
                    rows="1"
                    :placeholder="settings.promptStudio.variablesPlaceholder"
                    @input="resizePromptTextareas"
                  />
                </label>
                <div class="card prompt-render-card">
                  <div class="setup-title">{{ settings.promptStudio.testerTitle }}</div>
                  <div class="setup-desc">{{ settings.promptStudio.testerDescription }}</div>
                  <div class="prompt-render-metrics">
                    <span class="tag">{{ t('settings.promptStudio.chars', { count: promptTesterMetrics.chars }) }}</span>
                    <span class="tag">{{ t('settings.promptStudio.tokens', { count: promptTesterMetrics.approxTokens }) }}</span>
                  </div>
                  <div class="field">
                    <div class="prompt-render-label">
                      <span class="field-label">{{ settings.promptStudio.renderedLabel }}</span>
                      <button
                        class="btn btn-ghost btn-icon prompt-render-copy"
                        type="button"
                        :title="settings.promptStudio.copyRendered"
                        @click="copyRenderedPrompt"
                      >
                        <Copy :size="12" />
                      </button>
                    </div>
                    <textarea
                      ref="promptRenderedEl"
                      :value="promptRendered"
                      class="textarea textarea-auto textarea-auto-rendered mono"
                      rows="1"
                      readonly
                    />
                  </div>
                </div>
              </div>
            </div>

            <div v-if="selectedPromptHistory.length" class="card prompt-history-card">
              <div class="setup-title">{{ settings.promptStudio.history }}</div>
              <div class="prompt-history-list">
                <div v-for="entry in selectedPromptHistory" :key="entry.id" class="prompt-history-item">
                  <div>
                    <div class="prompt-list-name">v{{ entry.version }} · {{ entry.action }}</div>
                    <div class="prompt-list-meta">{{ entry.created_at }}</div>
                  </div>
                  <button class="btn btn-ghost btn-sm" @click="restorePromptHistory(entry.id)">{{ settings.promptStudio.restore }}</button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
      <div v-else-if="tab === 'observability'" class="settings-scroll">
        <SettingsPageHeader :brand="settings.brand" :title="settings.health.title" :description="settings.health.description">
          <template #actions>
            <button class="btn btn-primary btn-sm" @click="refreshObservability">{{ settings.health.refresh }}</button>
          </template>
        </SettingsPageHeader>

        <div class="sections">
          <section class="card health-summary-grid">
            <div class="health-pill">
              <span class="setup-title">{{ observability.ffmpeg?.available ? settings.health.ffmpegReady : settings.health.ffmpegMissing }}</span>
              <span class="section-subtitle mono">{{ observability.ffmpeg?.version || '-' }}</span>
            </div>
            <div class="health-pill">
              <span class="setup-title">{{ t('settings.health.recentErrors', { count: observability.recent_error_count || 0 }) }}</span>
              <span class="section-subtitle">{{ observability.timestamp || '-' }}</span>
            </div>
          </section>

          <section class="card provider-availability-card">
            <div class="section-head">
              <div>
                <span class="section-title">{{ settings.health.providerAvailability }}</span>
                <div class="section-subtitle">{{ settings.health.providerAvailabilityDescription }}</div>
              </div>
            </div>
            <div class="template-row provider-availability-row">
              <button v-for="provider in providers" :key="provider" class="template-type-chip" @click="checkProvider(provider)">
                {{ provider }}
              </button>
            </div>
            <div v-if="providerSnapshot" class="provider-snapshot">
              <div class="prompt-list-name">{{ providerSnapshot.provider }} · {{ providerSnapshot.status }}</div>
              <div class="config-list" style="margin-top:10px">
                <div v-for="service in providerSnapshot.services || []" :key="`${service.config_id}-${service.service_type}`" class="card config-row">
                  <div class="config-main">
                    <div class="config-line">
                      <span class="config-provider">{{ service.service_type }}</span>
                      <span class="config-name">{{ service.name }}</span>
                    </div>
                    <span class="config-model mono">{{ service.model || '-' }}</span>
                    <span class="config-base mono">{{ service.url }}</span>
                  </div>
                  <span class="tag" :class="service.status === 'available' ? 'tag-success' : 'tag-error'">{{ service.status }}</span>
                </div>
              </div>
            </div>
          </section>

          <section class="card recent-jobs-card">
            <div class="section-head">
              <div>
                <span class="section-title">{{ settings.health.workflowJobs }}</span>
                <div class="section-subtitle">{{ settings.health.workflowJobsDescription }}</div>
              </div>
            </div>
            <div v-if="workflowJobs.length" class="config-list recent-jobs-list">
              <div v-for="job in workflowJobs" :key="job.id" class="card config-row workflow-job-row">
                <div class="config-main">
                  <div class="config-line">
                    <span class="config-provider">{{ job.kind }}</span>
                    <span class="config-name">#{{ job.id }} · {{ job.related_entity_type || 'job' }} {{ job.related_entity_id || '' }}</span>
                  </div>
                  <span class="config-model mono">{{ job.provider || '-' }} · {{ job.model || '-' }}</span>
                  <span class="config-base mono">{{ job.error_msg || job.output_summary || '-' }}</span>
                </div>
                <span class="tag workflow-job-status" :class="job.status === 'completed' ? 'tag-success' : job.status === 'failed' ? 'tag-error' : 'tag-accent'">{{ job.status }}</span>
              </div>
            </div>
            <p v-else class="config-empty">{{ settings.health.noJobs }}</p>
          </section>
        </div>
      </div>
      <div v-else-if="tab === 'ideas'" class="settings-scroll ideas-layout">
        <SettingsPageHeader :brand="settings.brand" :title="settings.ideasLab.title" :description="settings.ideasLab.description" />

        <section class="card ideas-form-card">
          <div class="field-row">
            <label class="field">
              <span class="field-label">{{ settings.ideasLab.titleLabel }}</span>
              <input v-model="ideaForm.title" class="input" />
            </label>
            <label class="field">
              <span class="field-label">{{ settings.ideasLab.genreLabel }}</span>
              <input v-model="ideaForm.genre" class="input" />
            </label>
          </div>
          <div class="field-row">
            <label class="field">
              <span class="field-label">{{ settings.ideasLab.toneLabel }}</span>
              <input v-model="ideaForm.tone" class="input" />
            </label>
            <label class="field">
              <span class="field-label">{{ settings.ideasLab.queryLabel }}</span>
              <input v-model="discoveryForm.query" class="input" />
            </label>
          </div>
          <label class="field">
            <span class="field-label">{{ settings.ideasLab.descriptionLabel }}</span>
            <textarea v-model="ideaForm.description" class="textarea" rows="4" />
          </label>
          <div class="modal-actions">
            <button class="btn btn-primary" @click="createIdea">{{ settings.ideasLab.newIdea }}</button>
          </div>
        </section>

        <section class="card ideas-list-card">
          <div class="section-head">
            <div>
              <span class="section-title">{{ settings.ideasLab.title }}</span>
              <div class="section-subtitle">{{ settings.ideasLab.knowledgeBaseDescription }}</div>
            </div>
          </div>
          <div v-if="ideas.length" class="idea-list">
            <div v-for="idea in ideas" :key="idea.id" :class="['idea-card', { active: selectedIdeaId === idea.id }]">
              <button class="idea-card-main" @click="selectedIdeaId = idea.id">
                <div class="prompt-list-name">{{ idea.title }}</div>
                <div class="prompt-list-meta">{{ idea.genre || '-' }} · {{ idea.tone || '-' }}</div>
                <div class="idea-summary">{{ idea.description || '-' }}</div>
              </button>
              <div class="idea-actions">
                <button :class="['btn btn-sm', discoveryIdeaId === idea.id && discoveryRun?.mode === 'no-web' ? 'btn-primary' : 'btn-ghost']" @click="runDiscoveryForIdea(idea.id, 'no-web')">{{ settings.ideasLab.modeNoWeb }}</button>
                <button :class="['btn btn-sm', discoveryIdeaId === idea.id && discoveryRun?.mode === 'web' ? 'btn-primary' : 'btn-ghost']" @click="runDiscoveryForIdea(idea.id, 'web')">{{ settings.ideasLab.modeWeb }}</button>
                <button class="btn btn-ghost btn-icon" @click="deleteIdea(idea.id)"><Trash2 :size="13" /></button>
              </div>
            </div>
          </div>
          <p v-else class="config-empty">{{ settings.ideasLab.empty }}</p>
        </section>

        <section v-if="discoveryRun" class="card">
          <div class="section-head">
            <div>
              <span class="section-title">{{ t('settings.ideasLab.discoveryTitle', { id: discoveryRun.id }) }}</span>
              <div class="section-subtitle">{{ discoveryRun.summary || '-' }}</div>
            </div>
            <span class="tag tag-accent">{{ discoveryRun.mode }}</span>
          </div>
          <div class="idea-list">
            <div v-for="candidate in discoveryRun.candidates || []" :key="candidate.id" class="idea-card">
              <div class="idea-card-main static">
                <div class="prompt-list-name">{{ candidate.title }}</div>
                <div class="prompt-list-meta">{{ candidate.score }}</div>
                <div class="idea-summary">{{ candidate.summary }}</div>
                <div class="section-subtitle">{{ candidate.hook }}</div>
              </div>
              <div class="idea-actions">
                <button class="btn btn-primary btn-sm" @click="applyDiscoveryCandidate(candidate.id)">{{ settings.ideasLab.applyCandidate }}</button>
              </div>
            </div>
          </div>
        </section>
      </div>
      <div v-else-if="tab === 'agents'" class="settings-scroll">
        <SettingsPageHeader :brand="settings.brand" :title="settings.agents.title" :description="settings.agents.description" />
        <div class="agent-list">
          <div v-for="agent in agentDefs" :key="agent.type" class="card agent-card">
            <div class="agent-card-head" @click="toggleAgentEdit(agent.type)">
              <div class="agent-type-badge">{{ agent.icon }}</div>
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:14px">{{ agent.label }}</div>
                <div class="dim" style="font-size:12px">{{ agent.type }}</div>
              </div>
              <span v-if="getAgentCfg(agent.type)" class="tag tag-success">{{ settings.agents.configured }}</span>
              <span v-else class="tag">{{ settings.agents.default }}</span>
              <ChevronDown :size="14" :style="{ transform: editingAgent === agent.type ? 'rotate(180deg)' : '', transition: '0.2s' }" />
            </div>
            <div v-if="editingAgent === agent.type" class="agent-card-body">
              <label class="field">
                <span class="field-label">{{ settings.agents.model }} <span class="dim">({{ settings.agents.modelHint }})</span></span>
                <BaseSelect v-model="agentForm.model" :options="textModelSelectOptions" :placeholder="settings.agents.modelPlaceholder" searchable />
              </label>
              <div class="field-row">
                <label class="field">
                  <span class="field-label">{{ settings.agents.temperature }}</span>
                  <input v-model.number="agentForm.temperature" class="input" type="number" min="0" max="2" step="0.1" />
                </label>
                <label class="field">
                  <span class="field-label">{{ settings.agents.maxTokens }}</span>
                  <input v-model.number="agentForm.max_tokens" class="input" type="number" min="100" max="32000" />
                </label>
              </div>
              <label class="field">
                <span class="field-label">{{ settings.agents.systemPrompt }}</span>
                <textarea v-model="agentForm.system_prompt" class="textarea" rows="12" :placeholder="settings.agents.systemPromptPlaceholder" />
              </label>
              <div class="agent-card-foot">
                <button class="btn btn-ghost btn-sm" @click="resetAgentPrompt(agent.type)">{{ settings.agents.restoreDefault }}</button>
                <span v-if="agentSaved === agent.type" class="tag tag-success" style="margin-left:8px">
                  <Check :size="10" /> {{ settings.agents.saved }}
                </span>
                <button class="btn btn-primary btn-sm ml-auto" :disabled="agentSaving" @click="saveAgentCfg(agent.type)">
                  <Loader2 v-if="agentSaving" :size="12" class="animate-spin" />
                  {{ messages.common.save }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="tab === 'skills'" class="skills-layout">
        <aside class="skills-agent-list">
          <div class="skills-agent-title">{{ settings.nav.agentList }}</div>
          <button
            v-for="agent in agentDefs"
            :key="agent.type"
            :class="['skills-agent-item', { active: selectedAgent === agent.type }]"
            @click="selectAgent(agent.type)"
          >
            <span class="agent-type-badge">{{ agent.icon }}</span>
            <span class="skills-agent-label">{{ agent.label }}</span>
            <span v-if="agentSkillCount(agent.type) > 0" class="skill-count-badge">{{ agentSkillCount(agent.type) }}</span>
          </button>
        </aside>

        <div class="settings-scroll skills-main">
          <div class="settings-head">
            <div class="settings-brand">
              <div class="settings-brand-mark">
                <img v-if="showBrandImage" :src="brandLogo" :alt="settings.brand.alt" class="settings-brand-logo" @error="showBrandImage = false" />
                <span v-else class="settings-brand-fallback">{{ settings.brand.fallback }}</span>
              </div>
              <div class="settings-brand-copy">
                <div class="settings-brand-kicker">{{ settings.brand.kicker }}</div>
                <div class="settings-brand-name">{{ settings.brand.name }}</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:10px">
              <span class="agent-type-badge" style="width:32px;height:32px;font-size:16px">{{ selectedAgentIcon }}</span>
              <div>
                <h2 class="settings-title" style="margin:0">{{ selectedAgentLabel }}</h2>
                <div class="dim" style="font-size:12px">{{ selectedAgentType }} - {{ settings.skills.titleSuffix }}</div>
              </div>
            </div>
            <p class="settings-desc" style="margin-top:10px">{{ settings.skills.description }}</p>
            <button class="btn btn-primary btn-sm" @click="startAddSkill">
              <Plus :size="13" /> {{ settings.skills.newSkill }}
            </button>
          </div>

          <div v-if="!currentSkills.length" class="step-empty" style="padding:48px 24px">
            <div class="empty-visual">
              <FileText :size="28" />
            </div>
            <div class="empty-title">{{ settings.skills.emptyTitle }}</div>
            <div class="empty-desc">{{ settings.skills.emptyDescription }}</div>
          </div>

          <div class="skill-list" v-else>
            <div v-for="skill in currentSkills" :key="skill.id" class="card skill-card">
              <div class="skill-card-head" @click="toggleSkillEdit(skill.id)">
                <FileText :size="14" style="color:var(--accent);flex-shrink:0" />
                <div style="flex:1;min-width:0">
                  <div style="font-weight:600;font-size:13px">{{ skill.name }}</div>
                  <div class="dim" style="font-size:11px">{{ skill.description }}</div>
                </div>
                <button class="btn btn-ghost btn-icon" style="margin-right:4px" @click.stop="deleteSkill(skill.id)">
                  <Trash2 :size="13" />
                </button>
                <ChevronDown :size="14" :style="{ transform: editingSkill === skill.id ? 'rotate(180deg)' : '', transition: '0.2s' }" />
              </div>
              <div v-if="editingSkill === skill.id" class="skill-card-body">
                <textarea
                  v-model="skillContent"
                  class="textarea mono"
                  rows="20"
                  style="font-size:12px;line-height:1.6"
                  :placeholder="settings.skills.editorPlaceholder"
                />
                <div class="skill-card-foot">
                  <span class="dim" style="font-size:11px">skills/{{ selectedAgentType }}/{{ skill.id }}/SKILL.md</span>
                  <span v-if="skillSaved === skill.id" class="tag tag-success" style="margin-left:8px">
                    <Check :size="10" /> {{ settings.skills.saved }}
                  </span>
                  <button class="btn btn-primary btn-sm ml-auto" :disabled="skillSaving" @click="saveSkill(skill.id)">
                    <Loader2 v-if="skillSaving" :size="12" class="animate-spin" />
                    {{ messages.common.save }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
      </div>
      <div v-if="!canAccessAdminSections" class="settings-scroll settings-auth-empty">
        <div class="card settings-auth-card">
          <div class="setup-title">{{ settings.adminSession.lockedTitle }}</div>
          <div class="setup-desc">{{ settings.adminSession.lockedDescription }}</div>
        </div>
      </div>

      <div v-if="canAccessAdminSections">
    <SettingsAiConfigDialog
      :open="cfgDialog"
      :edit-id="cfgEditId"
      :settings="settings"
      :messages="messages"
      :service-meta="serviceMeta"
      :cfg-form="cfgForm"
      :provider-select-options="providerSelectOptions"
      :cfg-api-key-placeholder="cfgApiKeyPlaceholder"
      :endpoint-hint="endpointHint"
      :is-connection-backed-draft="isConnectionBackedDraft"
      :draft-connection-payload="draftConnectionPayload"
      :cfg-test-result="cfgTestResult"
      :cfg-testing="cfgTesting"
      :presets-by-type="presetsByType"
      :apply-provider-preset="applyProviderPreset"
      :connection-state-class="connectionStateClass"
      :connection-state-label="connectionStateLabel"
      :get-cfg-test-result-message="getCfgTestResultMessage"
      :get-cfg-test-result-preview="getCfgTestResultPreview"
      @close="cfgDialog = false"
      @test="testDraftCfg"
      @save="saveCfg"
    />

    <SettingsQuickSetupDialog
      :open="presetDialog"
      :settings="settings"
      :messages="messages"
      :presets="quickSetupPresetCards"
      @close="presetDialog = false"
      @submit="applyQuickSetupPreset"
    />

    <SettingsDeleteConfigDialog
      :config="pendingDeleteCfg"
      :deleting="deletingCfg"
      :messages="messages"
      @close="closeDeleteCfgDialog"
      @confirm="confirmDeleteCfg"
    />

    <div v-if="addSkillDialog" class="overlay" @click.self="addSkillDialog = false">
      <form class="modal card" @submit.prevent="confirmAddSkill">
        <h2 class="modal-title">{{ t('settings.skills.addDialogTitle', { agent: selectedAgentLabel }) }}</h2>
        <label class="field">
          <span class="field-label">{{ settings.skills.folderLabel }} <span class="dim">({{ settings.skills.folderHint }})</span></span>
          <input v-model="newSkillForm.id" class="input" :placeholder="settings.skills.folderPlaceholder" />
        </label>
        <label class="field">
          <span class="field-label">{{ settings.skills.nameLabel }}</span>
          <input v-model="newSkillForm.name" class="input" :placeholder="settings.skills.namePlaceholder" />
        </label>
        <label class="field">
          <span class="field-label">{{ settings.skills.descriptionLabel }}</span>
          <input v-model="newSkillForm.description" class="input" :placeholder="settings.skills.descriptionPlaceholder" />
        </label>
        <div class="modal-actions">
          <button type="button" class="btn" @click="addSkillDialog = false">{{ messages.common.cancel }}</button>
          <button type="submit" class="btn btn-primary" :disabled="!newSkillForm.id">{{ settings.skills.create }}</button>
        </div>
      </form>
    </div>
      </div>
  </div>
</template>

<script setup>
import { Plus, Pencil, Trash2, FileText, ChevronDown, Check, Loader2, Bot, Cpu, Sparkles, Link2, Copy, RefreshCw, X, LogOut } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import brandLogo from '~/assets/huobao-logo.png'
import BaseSelect from '~/components/BaseSelect.vue'
import { useAppI18n } from '~/composables/useAppI18n'
import { useSettingsIdeasLab } from '~/composables/useSettingsIdeasLab'
import { useSettingsObservability } from '~/composables/useSettingsObservability'
import { adminSessionAPI, aiConfigAPI, agentConfigAPI, skillsAPI, promptTemplatesAPI, providerConnectionsAPI } from '~/composables/useApi'

const { messages, t } = useAppI18n()
const settings = messages.settings

function checkLocalAdminMode() {
  if (!import.meta.client) return false
  const host = window.location.hostname
  return host === 'localhost' || host === '127.0.0.1'
}

const isLocalAdminMode = computed(() => checkLocalAdminMode())
const adminTokenInput = ref('')
const adminSessionAuthenticated = ref(false)
const adminSessionBusy = ref(false)
const canAccessAdminSections = computed(() => isLocalAdminMode.value || adminSessionAuthenticated.value)
const adminSessionStatusLabel = computed(() => {
  if (isLocalAdminMode.value) return settings.adminSession.localMode
  return adminSessionAuthenticated.value ? settings.adminSession.connected : settings.adminSession.disconnected
})
let settingsDataLoaded = false

const showBrandImage = ref(true)
const tab = ref('ai')
const showAdvanced = ref(false)
const baseTabs = [
  { id: 'ai', label: settings.nav.ai, icon: Cpu },
  { id: 'connections', label: settings.nav.connections, icon: Link2 },
  { id: 'prompts', label: settings.nav.prompts, icon: FileText },
  { id: 'observability', label: settings.nav.observability, icon: Cpu },
  { id: 'ideas', label: settings.nav.ideas, icon: Sparkles },
]
const advancedTabs = [
  { id: 'agents', label: settings.nav.agents, icon: Bot },
  { id: 'skills', label: settings.nav.skills, icon: FileText },
]

watch(showAdvanced, (value) => {
  if (!value && !baseTabs.some(item => item.id === tab.value)) tab.value = 'ai'
})

async function loadAdminSessionState(options = { silent: false }) {
  if (isLocalAdminMode.value) {
    adminSessionAuthenticated.value = true
    return
  }

  adminSessionBusy.value = true
  try {
    const session = await adminSessionAPI.get()
    adminSessionAuthenticated.value = !!session?.authenticated
  } catch (e) {
    adminSessionAuthenticated.value = false
    if (!options.silent) toast.error(e.message)
  } finally {
    adminSessionBusy.value = false
  }
}

async function saveAdminSession() {
  if (!adminTokenInput.value.trim()) return
  adminSessionBusy.value = true
  try {
    const session = await adminSessionAPI.login(adminTokenInput.value.trim())
    adminSessionAuthenticated.value = !!session?.authenticated
    adminTokenInput.value = ''
    settingsDataLoaded = false
    await loadSettingsData()
    toast.success(settings.adminSession.saved)
  } catch (e) {
    toast.error(e.message)
  } finally {
    adminSessionBusy.value = false
  }
}

async function reloadAdminSession() {
  await loadAdminSessionState()
  if (canAccessAdminSections.value) {
    settingsDataLoaded = false
    await loadSettingsData()
  }
}

async function clearAdminSession() {
  adminSessionBusy.value = true
  try {
    await adminSessionAPI.logout()
    adminSessionAuthenticated.value = false
    settingsDataLoaded = false
    stopProviderConnectionsPolling()
    toast.success(settings.adminSession.cleared)
  } catch (e) {
    toast.error(e.message)
  } finally {
    adminSessionBusy.value = false
  }
}

const cfgs = ref([])
const cfgDialog = ref(false)
const cfgEditId = ref(null)
const presetDialog = ref(false)
const cfgTesting = ref(false)
const cfgTestResult = ref(null)
const cfgForm = reactive({ name: '', provider: '', api_key: '', base_url: '', modelStr: '', service_type: 'text', priority: 0 })
const pendingDeleteCfg = ref(null)
const deletingCfg = ref(false)

function normalizeRepeatedTestText(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (text.length % 2 === 0) {
    const half = text.length / 2
    const left = text.slice(0, half)
    const right = text.slice(half)
    if (left && left === right) return left
  }
  return text
}

function getCfgTestResultMessage(result) {
  return normalizeRepeatedTestText(result?.message || '')
}

function getCfgTestResultPreview(result) {
  const preview = normalizeRepeatedTestText(result?.response_preview || '')
  if (!preview) return ''
  return preview === getCfgTestResultMessage(result) ? '' : preview
}

const connectionBackedProviders = ['openai-codex', 'github-copilot']
const providerConnectionsStatus = ref({ connections: [], runtime_sessions: [], providers: {} })
const connectionsRefreshing = ref(false)
let providerConnectionsPoller = null
const serviceTypes = [
  { type: 'text', label: settings.services.text },
  { type: 'image', label: settings.services.image },
  { type: 'video', label: settings.services.video },
  { type: 'audio', label: settings.services.audio },
]
const providers = ['ali', 'chatfire', 'gemini', 'github-copilot', 'huggingface', 'leonardo', 'minimax', 'openai', 'openai-codex', 'openrouter', 'vidu', 'volcengine']
const providerSelectOptions = computed(() => providers
  .filter((provider) => cfgForm.service_type === 'text' || (cfgForm.service_type === 'image' && provider === 'openai-codex') || !isConnectionBackedProvider(provider))
  .map((provider) => ({ label: provider, value: provider })))
const serviceMeta = {
  text: { label: settings.services.text, desc: settings.serviceMeta.text },
  image: { label: settings.services.image, desc: settings.serviceMeta.image },
  video: { label: settings.services.video, desc: settings.serviceMeta.video },
  audio: { label: settings.services.audio, desc: settings.serviceMeta.audio },
}
const providerPresets = {
  text: {
    gemini: { label: settings.presetLabels.geminiRecommended, baseUrl: 'https://generativelanguage.googleapis.com', models: ['gemini-2.5-flash-lite'] },
    'github-copilot': { label: settings.presetLabels.githubCopilotRecommended, baseUrl: 'https://api.githubcopilot.com', models: ['github-copilot/gpt-4o-mini'] },
    openrouter: { label: settings.presetLabels.openrouterRecommended, baseUrl: 'https://openrouter.ai/api', models: ['google/gemini-3-flash-preview'] },
    'openai-codex': { label: settings.presetLabels.openaiCodexRecommended, baseUrl: 'https://chatgpt.com/backend-api/codex', models: ['gpt-5.5'] },
    openai: { label: settings.presetLabels.openaiRecommended, baseUrl: 'https://api.openai.com', models: ['gpt-4.1-mini'] },
  },
  image: {
    'openai-codex': { label: settings.presetLabels.openaiCodexRecommended, baseUrl: 'https://chatgpt.com/backend-api/codex', models: ['gpt-5.5'] },
    openai: { label: settings.presetLabels.openaiRecommended, baseUrl: 'https://api.openai.com', models: ['gpt-image-1'] },
    gemini: { label: settings.presetLabels.geminiRecommended, baseUrl: 'https://generativelanguage.googleapis.com', models: ['gemini-2.5-flash-image'] },
    huggingface: { label: settings.presetLabels.huggingfaceRecommended, baseUrl: 'https://router.huggingface.co', models: ['black-forest-labs/FLUX.1-schnell'] },
    leonardo: { label: settings.presetLabels.leonardoRecommended, baseUrl: 'https://cloud.leonardo.ai', models: ['7b592283-e8a7-4c5a-9ba6-d18c31f258b9'] },
    volcengine: { label: settings.presetLabels.volcengineRecommended, baseUrl: 'https://operator.las.cn-beijing.volces.com', models: ['doubao-seedream-4-0-250828'] },
  },
  video: {
    huggingface: { label: settings.presetLabels.huggingfaceRecommended, baseUrl: 'https://router.huggingface.co', models: ['Wan-AI/Wan2.2-TI2V-5B'] },
    volcengine: { label: settings.presetLabels.volcengineRecommended, baseUrl: 'https://operator.las.cn-beijing.volces.com', models: ['doubao-seedance-1-5-pro-251215'] },
    vidu: { label: 'Vidu', baseUrl: 'https://api.vidu.com', models: ['viduq3-turbo'] },
    ali: { label: settings.presetLabels.aliRecommended, baseUrl: 'https://dashscope.aliyuncs.com', models: ['wan2.6-i2v-flash'] },
  },
  audio: {
    gemini: { label: settings.presetLabels.geminiRecommended, baseUrl: 'https://generativelanguage.googleapis.com', models: ['gemini-2.5-flash-preview-tts'] },
    minimax: { label: settings.presetLabels.huobaoAudio, baseUrl: 'https://api.minimaxi.com', models: ['speech-2.8-hd'] },
  },
}
const QUICK_SETUP_DEFAULTS = [
  { serviceType: 'text', label: settings.services.text, provider: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com', model: 'gemini-2.5-flash-lite', priority: 100 },
  { serviceType: 'image', label: settings.services.image, provider: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com', model: 'gemini-2.5-flash-image', priority: 99 },
  { serviceType: 'video', label: settings.services.video, provider: 'volcengine', baseUrl: 'https://operator.las.cn-beijing.volces.com', model: 'doubao-seedance-1-5-pro-251215', priority: 98 },
  { serviceType: 'audio', label: settings.services.audio, provider: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com', model: 'gemini-2.5-flash-preview-tts', priority: 97 },
  { serviceType: 'audio', label: settings.services.audio, provider: 'minimax', baseUrl: 'https://api.minimaxi.com', model: 'speech-2.8-hd', priority: 96 },
]
const quickSetupPresetCards = ref(QUICK_SETUP_DEFAULTS.map((preset) => ({ ...preset, apiKey: '' })))
const endpointPrefixes = {
  chatfire: '/v1',
  openai: '/v1',
  'openai-codex': '',
  openrouter: '/v1',
  minimax: '/v1',
  gemini: '/v1beta',
  huggingface: '/hf-inference/models',
  leonardo: '/api/rest/v1',
  volcengine: '/api/v1',
  ali: '/api/v1',
  vidu: '/ent/v2',
}

function endpointPrefixFor(serviceType, provider) {
  if (provider === 'gemini' && serviceType === 'text') return '/v1beta/openai'
  return endpointPrefixes[provider] || ''
}

const endpointHint = computed(() => {
  const provider = cfgForm.provider
  const base = cfgForm.base_url || 'https://...'
  const prefix = endpointPrefixFor(cfgForm.service_type, provider)
  if (!provider) return settings.ai.endpointHint
  return `${base}${prefix}`
})

function byType(type) {
  return cfgs.value.filter((config) => config.service_type === type)
}

function countActive(type) {
  return byType(type).filter((config) => config.is_active).length
}

function fmtModel(model) {
  return Array.isArray(model) ? model.join(', ') : model || '-'
}

function fmtModels(models) {
  return Array.isArray(models) ? models.join(', ') : models || '-'
}

function getConnectionModels(provider, connection) {
  if (provider === 'openai-codex') {
    return ['gpt-5.5', 'gpt-5.4']
  }

  const models = Array.isArray(connection?.available_models)
    ? connection.available_models.filter(Boolean)
    : []

  if (models.length) return models

  if (provider === 'github-copilot') {
    return ['gpt-4o-mini']
  }

  return []
}

function isConnectionBackedProvider(provider) {
  return connectionBackedProviders.includes(String(provider || '').trim())
}

const codexConnection = computed(() => providerConnectionsStatus.value?.providers?.['openai-codex'] || null)
const copilotConnection = computed(() => providerConnectionsStatus.value?.providers?.['github-copilot'] || null)
const isConnectionBackedDraft = computed(() => cfgForm.service_type === 'text' && isConnectionBackedProvider(cfgForm.provider))
const draftConnectionPayload = computed(() => {
  if (cfgForm.provider === 'openai-codex') return codexConnection.value
  if (cfgForm.provider === 'github-copilot') return copilotConnection.value
  return null
})

function connectionBusy(connection) {
  return connection?.session?.status === 'running'
}

function connectionVerificationVisible(connection) {
  return connection?.session?.status === 'running' && Boolean(connection?.verification_uri || connection?.user_code)
}

function connectionStateLabel(connection) {
  const status = connection?.session?.status
  const stage = connection?.session?.stage
  if (status === 'running') return settings.connections.statusRunning
  if (stage === 'not_licensed') return settings.connections.statusUnlicensed
  if (status === 'failed') return settings.connections.statusFailed
  if (status === 'cancelled') return settings.connections.statusCancelled
  return connection?.connected ? settings.connections.statusConnected : settings.connections.statusDisconnected
}

function connectionStateClass(connection) {
  const status = connection?.session?.status
  if (status === 'running') return 'tag-accent'
  if (status === 'failed' || status === 'cancelled') return 'tag-error'
  return connection?.connected ? 'tag-success' : 'tag-error'
}

function getConnectionSessionMessage(connection) {
  if (connection?.session?.message) return connection.session.message
  if (connection?.connected) return 'Conexao ativa e pronta para uso.'
  return 'Nenhum fluxo em andamento.'
}

function configConnectionTagLabel(config) {
  if (isConnectionBackedProvider(config?.provider) && config?.service_type === 'text') {
    return config?.connection_status === 'connected' ? settings.ai.connected : settings.ai.disconnected
  }
  return config?.has_api_key ? settings.ai.configured : settings.ai.missingKey
}

function configConnectionTagClass(config) {
  if (isConnectionBackedProvider(config?.provider) && config?.service_type === 'text') {
    return config?.connection_status === 'connected' ? 'tag-success' : 'tag-error'
  }
  return config?.has_api_key ? 'tag-success' : 'tag-error'
}

const cfgApiKeyPlaceholder = computed(() => {
  const editingId = Number(cfgEditId.value || 0)
  const existing = cfgs.value.find(config => config.id === editingId)
  return existing?.api_key_hint || 'sk-...'
})

function stopProviderConnectionsPolling() {
  if (providerConnectionsPoller) {
    clearTimeout(providerConnectionsPoller)
    providerConnectionsPoller = null
  }
}

function scheduleProviderConnectionsPolling() {
  stopProviderConnectionsPolling()
  const hasRunning = [codexConnection.value, copilotConnection.value].some(connectionBusy)
  if (!hasRunning) return
  providerConnectionsPoller = setTimeout(() => {
    void loadProviderConnectionsStatus({ silent: true })
  }, 2500)
}

async function loadProviderConnectionsStatus(options = {}) {
  const { silent = false } = options
  if (!silent) connectionsRefreshing.value = true
  try {
    providerConnectionsStatus.value = await providerConnectionsAPI.status()
  } catch (e) {
    if (!silent) toast.error(e.message)
  } finally {
    if (!silent) connectionsRefreshing.value = false
    scheduleProviderConnectionsPolling()
  }
}

async function copyConnectionValue(value) {
  if (!value) return
  try {
    await navigator.clipboard.writeText(String(value))
    toast.success(settings.connections.copied)
  } catch {
    toast.error(settings.connections.copyError)
  }
}

async function syncCodexConnection() {
  try {
    await providerConnectionsAPI.codexSync()
    await loadProviderConnectionsStatus()
    await loadCfgs()
  } catch (e) {
    toast.error(e.message)
  }
}

async function startCodexConnection(mode) {
  try {
    await providerConnectionsAPI.codexStart(mode)
    await loadProviderConnectionsStatus()
    await loadCfgs()
  } catch (e) {
    toast.error(e.message)
  }
}

async function cancelCodexConnection() {
  try {
    await providerConnectionsAPI.codexCancel()
    await loadProviderConnectionsStatus()
    await loadCfgs()
  } catch (e) {
    toast.error(e.message)
  }
}

async function disconnectCodexConnection() {
  try {
    await providerConnectionsAPI.codexDisconnect()
    await loadProviderConnectionsStatus()
    await loadCfgs()
  } catch (e) {
    toast.error(e.message)
  }
}

async function syncCopilotConnection() {
  try {
    await providerConnectionsAPI.copilotSync()
    await loadProviderConnectionsStatus()
    await loadCfgs()
  } catch (e) {
    toast.error(e.message)
  }
}

async function startCopilotConnection(mode) {
  try {
    await providerConnectionsAPI.copilotStart(mode)
    await loadProviderConnectionsStatus()
    await loadCfgs()
  } catch (e) {
    toast.error(e.message)
  }
}

async function cancelCopilotConnection() {
  try {
    await providerConnectionsAPI.copilotCancel()
    await loadProviderConnectionsStatus()
    await loadCfgs()
  } catch (e) {
    toast.error(e.message)
  }
}

async function disconnectCopilotConnection() {
  try {
    await providerConnectionsAPI.copilotDisconnect()
    await loadProviderConnectionsStatus()
    await loadCfgs()
  } catch (e) {
    toast.error(e.message)
  }
}

function presetsByType(type) {
  const group = providerPresets[type] || {}
  return Object.entries(group).map(([provider, preset]) => ({ provider, ...preset }))
}

function applyProviderPreset(type, provider) {
  const preset = providerPresets[type]?.[provider]
  if (!preset) return
  cfgForm.provider = provider
  cfgForm.base_url = preset.baseUrl
  cfgForm.modelStr = preset.models.join(', ')
  cfgForm.name = `${preset.label} - ${serviceMeta[type].label}`
}

async function loadCfgs() {
  try {
    cfgs.value = await aiConfigAPI.list()
  } catch (e) {
    toast.error(e.message)
  }
}

async function toggleCfg(config) {
  await aiConfigAPI.update(config.id, { is_active: !config.is_active })
  loadCfgs()
}

function requestDeleteCfg(config) {
  pendingDeleteCfg.value = config
}

function closeDeleteCfgDialog() {
  if (deletingCfg.value) return
  pendingDeleteCfg.value = null
}

async function confirmDeleteCfg() {
  const config = pendingDeleteCfg.value
  if (!config) return
  try {
    deletingCfg.value = true
    await aiConfigAPI.del(config.id)
    toast.success(settings.ai.deleted)
    pendingDeleteCfg.value = null
    await loadCfgs()
  } finally {
    deletingCfg.value = false
  }
}

function startAddCfg(type) {
  cfgEditId.value = null
  cfgTestResult.value = null
  Object.assign(cfgForm, { name: '', provider: '', api_key: '', base_url: '', modelStr: '', service_type: type, priority: 0 })
  const firstPreset = presetsByType(type)[0]
  if (firstPreset) applyProviderPreset(type, firstPreset.provider)
  cfgDialog.value = true
}

function startEditCfg(config) {
  cfgEditId.value = config.id
  cfgTestResult.value = null
  Object.assign(cfgForm, {
    name: config.name || '',
    provider: config.provider,
    api_key: '',
    base_url: config.base_url || '',
    modelStr: fmtModel(config.model),
    service_type: config.service_type,
    priority: config.priority ?? 0,
  })
  if (isConnectionBackedProvider(config.provider) && config.service_type === 'text') {
    cfgForm.api_key = ''
  }
  cfgDialog.value = true
}

async function testCfgPayload(payload) {
  cfgTesting.value = true
  try {
    cfgTestResult.value = await aiConfigAPI.test(payload)
    if (cfgTestResult.value.reachable) toast.success(settings.ai.draftOk)
    else toast.warning(settings.ai.draftFail)
  } catch (e) {
    toast.error(e.message)
  } finally {
    cfgTesting.value = false
  }
}

async function testDraftCfg() {
  await testCfgPayload({
    service_type: cfgForm.service_type,
    provider: cfgForm.provider,
    api_key: isConnectionBackedDraft.value ? '' : cfgForm.api_key,
    base_url: cfgForm.base_url,
    model: cfgForm.modelStr.split(',').map((item) => item.trim()).filter(Boolean),
  })
}

async function testExistingCfg(config) {
  startEditCfg(config)
  cfgTesting.value = true
  try {
    cfgTestResult.value = await aiConfigAPI.testSaved(config.id)
    if (cfgTestResult.value.reachable) toast.success(settings.ai.draftOk)
    else toast.warning(settings.ai.draftFail)
  } catch (e) {
    toast.error(e.message)
  } finally {
    cfgTesting.value = false
  }
}

async function saveCfg() {
  if (!cfgForm.provider) {
    toast.warning(settings.ai.chooseProvider)
    return
  }
  const models = cfgForm.modelStr.split(',').map((item) => item.trim()).filter(Boolean)
  const apiKey = isConnectionBackedDraft.value ? '' : cfgForm.api_key
  try {
    if (cfgEditId.value) {
      const payload = {
        name: cfgForm.name,
        provider: cfgForm.provider,
        base_url: cfgForm.base_url,
        model: models,
        priority: cfgForm.priority,
      }
      if (apiKey.trim()) payload.api_key = apiKey
      await aiConfigAPI.update(cfgEditId.value, payload)
    } else {
      await aiConfigAPI.create({ service_type: cfgForm.service_type, provider: cfgForm.provider, name: cfgForm.name || `${cfgForm.provider}-${cfgForm.service_type}`, api_key: apiKey, base_url: cfgForm.base_url, model: models, priority: cfgForm.priority })
    }
    cfgDialog.value = false
    toast.success(settings.ai.saved)
    await loadCfgs()
  } catch (e) {
    toast.error(e.message)
  }
}

function syncQuickSetupPresetCards() {
  quickSetupPresetCards.value = QUICK_SETUP_DEFAULTS.map((preset) => {
    return {
      ...preset,
      apiKey: '',
    }
  })
}

function keyLooksLikeGemini(key) {
  return /^AIza[0-9A-Za-z_-]{20,}$/.test(String(key || '').trim())
}

function openQuickSetupDialog() {
  syncQuickSetupPresetCards()
  presetDialog.value = true
}

async function upsertQuickSetupConfig(preset) {
  const existing = cfgs.value.find((config) => config.service_type === preset.serviceType && config.provider === preset.provider)

  const payload = {
    name: `${preset.label} - ${preset.provider}`,
    provider: preset.provider,
    api_key: preset.apiKey.trim(),
    base_url: preset.baseUrl,
    model: [preset.model],
    priority: preset.priority,
    is_active: true,
  }

  if (existing) {
    await aiConfigAPI.update(existing.id, payload)
    return
  }

  await aiConfigAPI.create({
    service_type: preset.serviceType,
    ...payload,
  })
}

async function ensureDefaultAgents() {
  for (const agent of agentDefs) {
    const existing = getAgentCfg(agent.type)
    const payload = {
      agent_type: agent.type,
      name: agent.label,
      is_active: true,
    }
    if (existing) {
      await agentConfigAPI.update(existing.id, payload)
    } else {
      await agentConfigAPI.create({
        ...payload,
        model: '',
      })
    }
  }
}

async function applyQuickSetupPreset() {
  const requiredPresets = quickSetupPresetCards.value.filter((preset) => preset.serviceType !== 'audio')
  const missingPreset = requiredPresets.find((preset) => !preset.apiKey.trim())
  if (missingPreset) {
    toast.warning(t('settings.ai.huobaoKeyRequired', { service: missingPreset.label }))
    return
  }

  const audioPresets = quickSetupPresetCards.value.filter((preset) => preset.serviceType === 'audio')
  const enabledAudioPresets = audioPresets.filter((preset) => preset.apiKey.trim())
  if (!enabledAudioPresets.length) {
    toast.warning(t('settings.ai.huobaoKeyRequired', { service: settings.services.audio }))
    return
  }

  const mismatchedPreset = quickSetupPresetCards.value.find((preset) => (
    ['minimax', 'volcengine', 'ali', 'vidu'].includes(preset.provider)
      && keyLooksLikeGemini(preset.apiKey)
  ))
  if (mismatchedPreset) {
    toast.warning(t('settings.ai.providerKeyMismatch', { service: mismatchedPreset.label, provider: mismatchedPreset.provider }))
    return
  }

  try {
    const selectedPresets = [...requiredPresets, ...enabledAudioPresets]
    const selectedServiceTypes = [...new Set(selectedPresets.map((preset) => preset.serviceType))]

    for (const serviceType of selectedServiceTypes) {
      for (const config of byType(serviceType)) {
        if (config.is_active) {
          await aiConfigAPI.update(config.id, { is_active: false })
        }
      }
    }

    for (const preset of selectedPresets) {
      await upsertQuickSetupConfig(preset)
    }
    await loadCfgs()
    await ensureDefaultAgents()
    await loadCfgs()
    await loadAgents()
    presetDialog.value = false
    toast.success(settings.ai.presetApplied)
  } catch (e) {
    toast.error(e.message)
  }
}

const agentCfgs = ref([])
const editingAgent = ref(null)
const agentSaving = ref(false)
const agentSaved = ref(null)
const agentForm = reactive({ model: '', temperature: 0.7, max_tokens: 4096, system_prompt: '' })

const agentDefs = [
  { type: 'script_rewriter', label: settings.agents.defs.script_rewriter, icon: '📝' },
  { type: 'extractor', label: settings.agents.defs.extractor, icon: '🔍' },
  { type: 'storyboard_breaker', label: settings.agents.defs.storyboard_breaker, icon: '🎬' },
  { type: 'voice_assigner', label: settings.agents.defs.voice_assigner, icon: '🎙' },
  { type: 'grid_prompt_generator', label: settings.agents.defs.grid_prompt_generator, icon: '🖼' },
]

const defaultPrompts = settings.prompts

function getAgentCfg(type) {
  return agentCfgs.value.find((agent) => agent.agent_type === type)
}

const textModelGroups = computed(() => {
  return cfgs.value
    .filter((config) => config.service_type === 'text' && config.is_active && (config.has_api_key || config.connection_status === 'connected'))
    .map((config) => ({
      label: `${config.provider} - ${config.name}`,
      models: Array.isArray(config.model) ? config.model : (config.model ? [config.model] : []),
    }))
    .filter((group) => group.models.length > 0)
})

const textModelSelectOptions = computed(() =>
  textModelGroups.value.map((group) => ({
    label: group.label,
    options: group.models.map((model) => ({ label: model, value: model })),
  }))
)

async function loadAgents() {
  try {
    agentCfgs.value = await agentConfigAPI.list()
  } catch (e) {
    toast.error(e.message)
  }
}

function toggleAgentEdit(type) {
  if (editingAgent.value === type) {
    editingAgent.value = null
    return
  }
  const config = getAgentCfg(type)
  agentForm.model = config?.model || ''
  agentForm.temperature = config?.temperature ?? 0.7
  agentForm.max_tokens = config?.max_tokens ?? 4096
  agentForm.system_prompt = config?.system_prompt || defaultPrompts[type] || ''
  agentSaved.value = null
  editingAgent.value = type
}

function resetAgentPrompt(type) {
  agentForm.system_prompt = defaultPrompts[type] || ''
  toast.info(settings.agents.promptReset)
}

async function saveAgentCfg(type) {
  agentSaving.value = true
  agentSaved.value = null
  try {
    const existing = getAgentCfg(type)
    const data = {
      agent_type: type,
      name: agentDefs.find((agent) => agent.type === type)?.label || type,
      model: agentForm.model,
      temperature: agentForm.temperature,
      max_tokens: agentForm.max_tokens,
      system_prompt: agentForm.system_prompt,
    }
    if (existing) {
      await agentConfigAPI.update(existing.id, data)
    } else {
      await agentConfigAPI.create(data)
    }
    await loadAgents()
    agentSaved.value = type
    toast.success(t('settings.agents.savedToast', { agent: agentDefs.find((agent) => agent.type === type)?.label || type }))
    setTimeout(() => {
      if (agentSaved.value === type) agentSaved.value = null
    }, 3000)
  } catch (e) {
    toast.error(e.message)
  } finally {
    agentSaving.value = false
  }
}

const selectedAgent = ref('script_rewriter')
const allSkills = ref([])
const editingSkill = ref(null)
const skillContent = ref('')
const skillSaving = ref(false)
const skillSaved = ref(null)
const addSkillDialog = ref(false)
const newSkillForm = reactive({ id: '', name: '', description: '' })
const selectedAgentType = computed(() => selectedAgent.value)
const selectedAgentLabel = computed(() => agentDefs.find((agent) => agent.type === selectedAgent.value)?.label || '')
const selectedAgentIcon = computed(() => agentDefs.find((agent) => agent.type === selectedAgent.value)?.icon || '')

function agentSkillCount(type) {
  return allSkills.value.filter((skill) => skill.id === type || skill.id.startsWith(`${type}/`)).length
}

const currentSkills = computed(() =>
  allSkills.value.filter((skill) => skill.id === selectedAgent.value || skill.id.startsWith(`${selectedAgent.value}/`))
)

async function loadAllSkills() {
  try {
    allSkills.value = await skillsAPI.list()
  } catch (e) {
    toast.error(e.message)
  }
}

async function selectAgent(type) {
  selectedAgent.value = type
  editingSkill.value = null
}

function startAddSkill() {
  newSkillForm.id = ''
  newSkillForm.name = ''
  newSkillForm.description = ''
  addSkillDialog.value = true
}

async function confirmAddSkill() {
  if (!newSkillForm.id) return
  const skillId = `${selectedAgent.value}/${newSkillForm.id}`
  try {
    await skillsAPI.create({ id: skillId, name: newSkillForm.name, description: newSkillForm.description })
    addSkillDialog.value = false
    await loadAllSkills()
    toast.success(settings.skills.created)
  } catch (e) {
    toast.error(e.message)
  }
}

async function deleteSkill(id) {
  if (!confirm(t('settings.skills.deleteConfirm', { id }))) return
  try {
    await skillsAPI.del(id)
    if (editingSkill.value === id) editingSkill.value = null
    await loadAllSkills()
    toast.success(settings.skills.deleted)
  } catch (e) {
    toast.error(e.message)
  }
}

async function toggleSkillEdit(id) {
  if (editingSkill.value === id) {
    editingSkill.value = null
    return
  }
  try {
    const result = await skillsAPI.get(id)
    skillContent.value = result.content
    skillSaved.value = null
    editingSkill.value = id
  } catch (e) {
    toast.error(e.message)
  }
}

async function saveSkill(id) {
  skillSaving.value = true
  skillSaved.value = null
  try {
    await skillsAPI.update(id, skillContent.value)
    await loadAllSkills()
    skillSaved.value = id
    toast.success(settings.skills.saved)
    setTimeout(() => {
      if (skillSaved.value === id) skillSaved.value = null
    }, 3000)
  } catch (e) {
    toast.error(e.message)
  } finally {
    skillSaving.value = false
  }
}

const promptTemplates = ref([])
const selectedPromptKey = ref('')
const promptEditor = ref('')
const promptVariables = ref('{}')
const promptRendered = ref('')
const promptEditorEl = ref(null)
const promptVariablesEl = ref(null)
const promptRenderedEl = ref(null)
const promptTesterMetrics = reactive({ chars: 0, approxTokens: 0 })
const selectedPromptHistory = ref([])

const selectedPrompt = computed(() =>
  promptTemplates.value.find((item) => item.key === selectedPromptKey.value) || null,
)

const promptVariableExamples = {
  name: 'Captain Elena Moreau',
  appearance: 'young naval officer, sharp features, dark blue uniform, windblown hair',
  personality: 'disciplined, empathetic, quietly determined',
  location: 'storm-battered coastal fortress at dusk',
  time: 'sunset after heavy rain',
  scene_summary: 'a lonely watchtower overlooking a restless sea as lanterns flicker in the distance',
  setting: 'narrow cobblestone street in a flooded old town',
  camera: 'medium shot, slow push-in, eye level',
  story_beat: 'the hero realizes the village is about to be attacked',
  character_continuity: 'same protagonist face, same navy coat, same scar over the left eyebrow',
  timeline: 'begins in silence, then turns urgent as the bells start ringing',
  duration: '10',
  episode_title: 'Episode 3',
  genre: 'historical drama',
  tone: 'emotional',
  language: 'pt-BR',
  target_language: 'Brazilian Portuguese',
  forbidden_speaker_labels: 'Sailor, Officer 1, Young Sailor, Voice of the Officer',
  output_language: 'Brazilian Portuguese',
  forbidden_character_labels: 'Sailor, Sailor 1, Officer 2, Young Sailor, Narrator, Voice of the Officer',
  editorial_language: 'Brazilian Portuguese',
  prompt_language: 'English',
  explanation_language: 'Brazilian Portuguese',
  context: 'A storm traps the crew at sea while hidden loyalties begin to surface.',
  source_summary: 'A storm traps the crew at sea while hidden loyalties begin to surface.',
  focus: 'characters, scenes, props',
  script_excerpt: 'Captain Elena enters the flooded chapel and finds the missing map on the altar.',
  scene_header: 'INT. FLOODED CHAPEL - NIGHT',
  beat: 'The hero discovers the map and hears footsteps behind them.',
  target_duration_seconds: '12',
  character_name: 'Captain Elena Moreau',
  character_profile: 'young naval officer, resolute, emotionally guarded, late 20s',
  voice_direction: 'warm but authoritative female voice',
  mode: 'character',
  subject: 'Captain Elena Moreau',
  visual_goal: 'cinematic character prompt with wardrobe and lighting details',
}

function buildEmptyPromptVariables(keys) {
  return Object.fromEntries(keys.map((key) => [key, promptVariableExamples[key] ?? '']))
}

function buildPromptVariablesDraft(template) {
  const keys = Array.isArray(template?.variables) ? template.variables : []
  if (!keys.length) {
    return JSON.stringify({ prompt_goal: '' }, null, 2)
  }
  const payload = buildEmptyPromptVariables(keys)
  return JSON.stringify(payload, null, 2)
}

function resizeTextarea(element, minHeight = 0) {
  if (!element) return
  element.style.height = 'auto'
  element.style.height = `${Math.max(element.scrollHeight, minHeight)}px`
}

function resizePromptTextareas() {
  nextTick(() => {
    resizeTextarea(promptEditorEl.value, 56)
    resizeTextarea(promptVariablesEl.value, 56)
    resizeTextarea(promptRenderedEl.value, 72)
  })
}

async function loadPromptTemplates() {
  try {
    promptTemplates.value = await promptTemplatesAPI.list()
    if (!selectedPromptKey.value && promptTemplates.value.length) {
      await selectPrompt(promptTemplates.value[0].key)
    } else if (selectedPromptKey.value) {
      const current = promptTemplates.value.find((item) => item.key === selectedPromptKey.value)
      if (current) {
        promptEditor.value = current.content || ''
        promptVariables.value = buildPromptVariablesDraft(current)
        await testPromptTemplate()
      }
    }
    resizePromptTextareas()
  } catch (e) {
    toast.error(e.message)
  }
}

async function selectPrompt(key) {
  selectedPromptKey.value = key
  const current = promptTemplates.value.find((item) => item.key === key)
  promptEditor.value = current?.content || ''
  promptVariables.value = buildPromptVariablesDraft(current)
  try {
    selectedPromptHistory.value = await promptTemplatesAPI.history(key)
  } catch (e) {
    selectedPromptHistory.value = []
  }
  await testPromptTemplate()
}

function parsePromptVariablesDraft() {
  try {
    return JSON.parse(promptVariables.value || '{}')
  } catch {
    throw new Error('JSON de variaveis invalido')
  }
}

async function testPromptTemplate() {
  try {
    const result = await promptTemplatesAPI.test(promptEditor.value, parsePromptVariablesDraft())
    promptRendered.value = result.rendered || ''
    promptTesterMetrics.chars = result.metrics?.chars || 0
    promptTesterMetrics.approxTokens = result.metrics?.approx_tokens || result.metrics?.approxTokens || 0
  } catch (e) {
    toast.error(e.message)
  }
}

async function savePromptTemplate() {
  if (!selectedPromptKey.value) return
  try {
    const variables = parsePromptVariablesDraft()
    await promptTemplatesAPI.save({
      key: selectedPromptKey.value,
      name: selectedPrompt.value?.name,
      description: selectedPrompt.value?.description,
      content: promptEditor.value,
      variables: Object.keys(variables),
    })
    await loadPromptTemplates()
    await selectPrompt(selectedPromptKey.value)
    toast.success(settings.promptStudio.saved)
  } catch (e) {
    toast.error(e.message)
  }
}

async function resetPromptTemplate() {
  if (!selectedPromptKey.value) return
  try {
    await promptTemplatesAPI.reset(selectedPromptKey.value)
    await loadPromptTemplates()
    await selectPrompt(selectedPromptKey.value)
  } catch (e) {
    toast.error(e.message)
  }
}

async function restorePromptHistory(historyId) {
  if (!selectedPromptKey.value) return
  try {
    await promptTemplatesAPI.restore(selectedPromptKey.value, historyId)
    await loadPromptTemplates()
    await selectPrompt(selectedPromptKey.value)
    toast.success(settings.promptStudio.restoreDone)
  } catch (e) {
    toast.error(e.message)
  }
}

async function copyRenderedPrompt() {
  try {
    await navigator.clipboard.writeText(promptRendered.value || '')
    toast.success(settings.promptStudio.copied)
  } catch (e) {
    toast.error(settings.connections.copyError)
  }
}

const {
  observability,
  workflowJobs,
  providerSnapshot,
  refreshObservability,
  checkProvider,
} = useSettingsObservability()

const {
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
} = useSettingsIdeasLab()

async function loadSettingsData() {
  if (!canAccessAdminSections.value || settingsDataLoaded) {
    resizePromptTextareas()
    return
  }

  settingsDataLoaded = true
  await Promise.all([
    loadCfgs(),
    loadProviderConnectionsStatus(),
    loadAgents(),
    loadAllSkills(),
    loadPromptTemplates(),
    refreshObservability(),
    loadIdeas(),
  ])
  resizePromptTextareas()
}

onMounted(() => {
  void (async () => {
    await loadAdminSessionState({ silent: true })
    await loadSettingsData()
  })()
})

watch(canAccessAdminSections, (value) => {
  if (!value) return
  void loadSettingsData()
})

watch([promptEditor, promptVariables, promptRendered, selectedPromptKey, tab], () => {
  if (tab.value === 'prompts') resizePromptTextareas()
}, { flush: 'post' })

onBeforeUnmount(() => {
  stopProviderConnectionsPolling()
})
</script>

<style scoped>
.settings-layout { display: flex; height: 100%; background: var(--bg-base); }
.settings-content {
  flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 12px;
  padding: 12px; overflow: hidden;
}
.settings-admin-sections { flex: 1; min-height: 0; }
.admin-session-panel {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 16px 18px; border: 1px solid color-mix(in srgb, var(--border) 70%, var(--accent) 30%);
  background: linear-gradient(135deg, color-mix(in srgb, var(--bg-1) 82%, var(--accent) 18%), var(--bg-1));
}
.admin-session-copy { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.admin-session-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: flex-end; }
.admin-session-form { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.admin-session-input { min-width: 240px; }
.settings-auth-empty { flex: 1; display: flex; }
.settings-auth-card {
  width: min(520px, 100%); margin: auto; padding: 28px;
  display: flex; flex-direction: column; gap: 8px; text-align: left;
}

.settings-nav {
  width: 220px; flex-shrink: 0; padding: 16px 10px; border-right: 1px solid var(--border);
  display: flex; flex-direction: column; gap: 14px; background: var(--bg-1);
}
.nav-group { display: flex; flex-direction: column; gap: 4px; }
.nav-group-label {
  font-size: 10px; font-weight: 600; color: var(--text-3);
  letter-spacing: 0.12em; text-transform: uppercase; padding: 0 10px 4px;
}
.nav-item {
  display: flex; align-items: center; gap: 8px; padding: 9px 12px; font-size: 13px;
  border: none; background: none; color: var(--text-2); cursor: pointer;
  border-radius: var(--radius); transition: all 0.12s; text-align: left; width: 100%;
}
.nav-item:hover { background: var(--bg-hover); color: var(--text-0); }
.nav-item.active { background: var(--accent-bg); color: var(--accent-text); font-weight: 600; box-shadow: var(--shadow-card); }
.nav-advanced {
  padding: 12px 8px;
  border-top: 1px solid rgba(27, 41, 64, 0.08);
  border-bottom: 1px solid rgba(27, 41, 64, 0.08);
}
.advanced-toggle {
  display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 10px;
  font-size: 12px; color: var(--text-2);
  cursor: pointer;
}
.advanced-toggle > span:first-child {
  min-width: 0;
  white-space: nowrap;
}
.advanced-toggle input { display: none; }
.advanced-slider {
  position: relative; width: 38px; height: 22px; border-radius: 999px;
  background: rgba(27, 41, 64, 0.12); transition: background 0.18s ease;
  cursor: pointer;
}
.advanced-slider::after {
  content: ''; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px;
  border-radius: 50%; background: #fff; box-shadow: 0 2px 6px rgba(18, 24, 38, 0.18); transition: transform 0.18s ease;
}
.advanced-toggle input:checked + .advanced-slider { background: var(--accent); }
.advanced-toggle input:checked + .advanced-slider::after { transform: translateX(16px); }
.advanced-note {
  margin: 8px 0 0;
  font-size: 11px;
  line-height: 1.45;
  color: var(--text-3);
}

.settings-content { flex: 1; overflow: hidden; }
.settings-scroll { height: 100%; overflow-y: auto; padding: 36px 48px; max-width: 840px; margin: 0 auto; animation: fadeUp 0.3s var(--ease-out); }
.settings-head { margin-bottom: 24px; }
.settings-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.settings-brand-mark {
  width: 42px;
  height: 42px;
  border-radius: 15px;
  border: 1px solid var(--border);
  background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(242,247,255,0.9));
  box-shadow: var(--shadow-sm);
  display: flex;
  align-items: center;
  justify-content: center;
}
.settings-brand-logo {
  width: 26px;
  height: 26px;
  object-fit: contain;
  display: block;
}
.settings-brand-fallback {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 600;
  color: var(--accent-text);
  line-height: 1;
}
.settings-brand-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
  line-height: 1;
}
.settings-brand-kicker {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-3);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.settings-brand-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-1);
  font-family: var(--font-display);
}
.settings-title { font-family: var(--font-display); font-size: 22px; font-weight: 600; letter-spacing: 0; }
.settings-desc { font-size: 13px; color: var(--text-2); margin-top: 4px; }

/* AI Config */
.setup-panel {
  padding: 18px 18px 16px;
  margin-bottom: 18px;
}
.setup-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.setup-panel-head.compact { margin-bottom: 12px; }
.setup-kicker {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-3);
  margin-bottom: 4px;
}
.setup-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-0);
}
.setup-desc {
  font-size: 12px;
  color: var(--text-2);
  margin-top: 4px;
}
.preset-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.preset-grid.compact {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 8px;
}
.preset-card {
  border: 1px solid var(--border);
  border-radius: 16px;
  background: rgba(255,255,255,0.82);
  padding: 12px 13px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.preset-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.preset-service { font-size: 12px; font-weight: 600; }
.preset-model { font-size: 12px; color: var(--text-1); }
.preset-base { font-size: 11px; color: var(--text-3); }
.template-row { display: flex; flex-wrap: wrap; gap: 8px; }
.template-type-chip {
  border: 1px solid var(--border);
  background: rgba(255,255,255,0.82);
  color: var(--text-1);
  border-radius: 999px;
  padding: 8px 12px;
  font-size: 12px;
  cursor: pointer;
  transition: 0.15s;
}
.template-type-chip:hover {
  border-color: var(--accent);
  color: var(--accent-text);
  background: var(--accent-bg);
}
.sections { display: flex; flex-direction: column; gap: 24px; }
.section-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.section-title { font-size: 13px; font-weight: 600; }
.section-subtitle { font-size: 11px; color: var(--text-3); margin-top: 2px; }
.config-list { display: flex; flex-direction: column; gap: 6px; }
.config-row { display: flex; align-items: center; gap: 8px; padding: 10px 14px; }
.config-info { flex: 1; display: flex; align-items: center; gap: 10px; min-width: 0; }
.config-main { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.config-line { display: flex; align-items: center; gap: 8px; min-width: 0; }
.config-provider { font-size: 13px; font-weight: 600; }
.config-name { font-size: 12px; color: var(--text-2); }
.config-model { font-size: 11px; color: var(--text-2); }
.config-base { font-size: 11px; color: var(--text-3); }
.config-empty { font-size: 12px; color: var(--text-3); padding: 12px 0; }

.toggle { position: relative; width: 30px; height: 17px; cursor: pointer; flex-shrink: 0; }
.toggle input { opacity: 0; width: 0; height: 0; }
.toggle span { position: absolute; inset: 0; background: var(--bg-3); border-radius: 99px; transition: 0.2s; }
.toggle span::before { content: ''; position: absolute; width: 13px; height: 13px; left: 2px; bottom: 2px; background: var(--bg-0); border-radius: 50%; transition: 0.2s; box-shadow: var(--shadow); }
.toggle input:checked + span { background: var(--accent); }
.toggle input:checked + span::before { transform: translateX(13px); }

/* Agent */
.agent-list { display: flex; flex-direction: column; gap: 8px; }
.agent-card { overflow: hidden; }
.agent-card-head { display: flex; align-items: center; gap: 10px; padding: 14px 16px; cursor: pointer; transition: background 0.1s; }
.agent-card-head:hover { background: var(--bg-hover); }
.agent-type-badge { width: 36px; height: 36px; border-radius: var(--radius); background: var(--accent-bg); color: var(--accent); display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
.agent-card-body { padding: 0 16px 16px; display: flex; flex-direction: column; gap: 12px; border-top: 1px solid var(--border); padding-top: 16px; }
.agent-card-foot { display: flex; align-items: center; gap: 8px; padding-top: 8px; }

/* Skills layout */
.skills-layout { display: flex; height: 100%; min-height: 0; overflow: hidden; }
.skills-agent-list {
  width: 200px; flex-shrink: 0; border-right: 1px solid var(--border);
  background: var(--bg-1); display: flex; flex-direction: column;
  overflow-y: auto;
}
.skills-agent-title {
  font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em;
  color: var(--text-3); padding: 14px 14px 8px;
}
.skills-agent-item {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 14px; font-size: 13px; cursor: pointer;
  border: none; background: none; color: var(--text-2);
  transition: all 0.12s; width: 100%; text-align: left;
  border-radius: 0;
}
.skills-agent-item:hover { background: var(--bg-hover); color: var(--text-0); }
.skills-agent-item.active { background: var(--accent-bg); color: var(--accent-text); font-weight: 600; }
.skills-agent-label { flex: 1; }
.skill-count-badge {
  font-size: 10px; font-weight: 600; font-family: var(--font-mono);
  background: var(--accent-bg); color: var(--accent-text);
  padding: 1px 5px; border-radius: 99px;
}
.skills-agent-item.active .skill-count-badge { background: rgba(255,255,255,0.2); color: inherit; }
.skills-main {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  padding-bottom: 28px;
}
.settings-scroll.skills-main {
  max-width: 900px;
  width: 100%;
}

/* Skill */
.skill-list { display: flex; flex-direction: column; gap: 8px; }
.skill-card { overflow: hidden; }
.skill-card-head { display: flex; align-items: center; gap: 10px; padding: 12px 16px; cursor: pointer; transition: background 0.1s; }
.skill-card-head:hover { background: var(--bg-hover); }
.skill-card-body { padding: 0 16px 16px; display: flex; flex-direction: column; gap: 10px; border-top: 1px solid var(--border); padding-top: 12px; }
.skill-card-foot { display: flex; align-items: center; gap: 8px; }

.prompt-studio {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 16px;
}
.prompt-list-card,
.prompt-editor-card,
.prompt-history-card,
.ideas-form-card {
  padding: 16px;
}
.ideas-form-card {
  padding: 18px 20px 16px;
}
.ideas-layout {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.ideas-layout > .card:last-child {
  padding: 20px 22px 22px;
}
.ideas-layout > .card:last-child > .section-head {
  margin-bottom: 16px;
}
.ideas-layout > .card:last-child > .idea-list {
  gap: 14px;
}
.ideas-list-card {
  padding: 18px 20px 20px;
}
.ideas-list-card .section-head {
  margin-bottom: 14px;
}
.ideas-form-card .field-row {
  gap: 16px;
  margin-bottom: 10px;
}
.ideas-form-card .field {
  gap: 8px;
}
.ideas-form-card .modal-actions {
  padding-top: 10px;
}
.prompt-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 14px;
}
.prompt-list-item {
  border: 1px solid var(--border);
  background: rgba(255,255,255,0.72);
  border-radius: 14px;
  padding: 10px 12px;
  text-align: left;
  cursor: pointer;
}
.prompt-list-item.active {
  border-color: var(--accent);
  background: var(--accent-bg);
}
.prompt-list-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-1);
}
.prompt-list-meta {
  font-size: 11px;
  color: var(--text-3);
  margin-top: 3px;
}
.prompt-editor-column {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.prompt-test-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 10px;
}
.prompt-editor-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
.prompt-render-card {
  padding: 14px;
  margin-top: 2px;
}
.prompt-render-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.prompt-render-copy {
  width: 28px;
  height: 28px;
  min-width: 28px;
  min-height: 28px;
  flex-shrink: 0;
}
.textarea-auto {
  overflow-y: hidden;
  resize: none;
  min-height: 0;
}
.textarea-auto-rendered {
  min-height: 112px;
}
.prompt-render-metrics {
  display: flex;
  gap: 8px;
  margin: 10px 0;
}
.prompt-history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}
.prompt-history-item,
.idea-card,
.health-pill {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: rgba(255,255,255,0.72);
  padding: 12px;
}
.health-pill {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 14px 16px;
}
.health-pill .setup-title,
.health-pill .section-subtitle {
  display: block;
  width: 100%;
}
.health-pill .section-subtitle {
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.provider-availability-card {
  padding: 18px 20px 20px;
}
.provider-availability-card .section-head {
  margin-bottom: 14px;
}
.provider-availability-row {
  gap: 10px;
  padding: 2px 0 4px;
}
.provider-availability-row .template-type-chip {
  padding: 9px 13px;
}
.provider-snapshot {
  margin-top: 16px;
}
.recent-jobs-card {
  padding: 18px 20px 20px;
}
.recent-jobs-card .section-head {
  margin-bottom: 14px;
}
.recent-jobs-list {
  gap: 10px;
}
.workflow-job-row {
  align-items: flex-start;
  gap: 16px;
  padding: 14px 16px;
  border-radius: 16px;
}
.workflow-job-row .config-main {
  gap: 8px;
}
.workflow-job-row .config-line {
  flex-wrap: wrap;
  gap: 8px 10px;
}
.workflow-job-row .config-provider {
  font-size: 14px;
}
.workflow-job-row .config-name {
  font-size: 13px;
}
.workflow-job-row .config-model,
.workflow-job-row .config-base {
  line-height: 1.55;
}
.workflow-job-status {
  margin-top: 2px;
  flex-shrink: 0;
}
.health-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 16px;
}
.connections-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.connection-card {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 100%;
}
.connection-card-copy {
  min-width: 0;
  flex: 1;
}
.connection-card-main {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
}
.connection-summary {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.connection-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.connection-row > :last-child {
  min-width: 0;
  text-align: right;
  color: var(--text-1);
}
.connection-value {
  min-width: 0;
  max-width: 62%;
  text-align: right;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.connection-value-multiline {
  white-space: normal;
  line-height: 1.55;
}
.connection-model-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
  max-width: 62%;
}
.connection-model-chip {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(244, 248, 255, 0.96);
  border: 1px solid rgba(27, 41, 64, 0.08);
  color: var(--text-1);
  font-size: 11px;
  line-height: 1.2;
  max-width: 100%;
  overflow-wrap: anywhere;
}
.connection-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  align-items: stretch;
  margin-top: auto;
}
.connection-actions .btn {
  width: 100%;
  justify-content: center;
  min-width: 0;
  text-align: center;
}
.connection-actions-primary .btn:only-child {
  grid-column: 1 / -1;
}
.connection-session {
  padding: 14px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 138px;
}
.connection-copy-group {
  display: flex;
  align-items: center;
  flex-direction: row;
  justify-content: flex-end;
  gap: 6px;
  min-width: 0;
  max-width: 62%;
}
.connection-copy-value {
  width: 100%;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.connection-copy-group .btn {
  white-space: nowrap;
  flex-shrink: 0;
}
.connection-copy-btn {
  width: 28px;
  height: 28px;
  min-width: 28px;
  min-height: 28px;
}
.connection-note {
  font-size: 12px;
  color: var(--text-2);
  line-height: 1.5;
  overflow-wrap: anywhere;
  word-break: break-word;
  min-height: 36px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.idea-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.idea-card {
  display: flex;
  align-items: stretch;
  gap: 16px;
  padding: 16px 20px;
}
.idea-card.active {
  border-color: var(--accent);
  box-shadow: var(--shadow-sm);
}
.idea-card-main {
  border: none;
  background: transparent;
  text-align: left;
  padding: 0;
  flex: 1;
  cursor: pointer;
  min-width: 0;
}
.idea-card-main.static {
  cursor: default;
}
.idea-summary {
  margin-top: 10px;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-2);
}
.idea-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  min-width: fit-content;
  gap: 8px;
}

/* Shared */
.field { display: flex; flex-direction: column; gap: 5px; }
.field-label { font-size: 12px; font-weight: 500; color: var(--text-1); }
.field-hint { font-size: 11px; color: var(--text-3); margin-top: 2px; }
.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

.overlay { position: fixed; inset: 0; background: rgba(34,45,66,0.32); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 100; animation: fadeIn 0.18s var(--ease-out); }
.modal { padding: 28px; width: 420px; display: flex; flex-direction: column; gap: 12px; box-shadow: var(--shadow-elevated); }
.modal-title { font-family: var(--font-display); font-size: 18px; font-weight: 600; }
.modal-desc { font-size: 13px; color: var(--text-3); line-height: 1.6; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 6px; }
.huobao-grid {
  display: grid;
  grid-template-columns: repeat(1, minmax(0, 1fr));
  gap: 10px;
}
.huobao-grid .field-hint a {
  color: var(--accent);
  text-decoration: none;
  font-weight: 500;
}
.huobao-grid .field-hint a:hover {
  text-decoration: underline;
}

/* Professional typography pass */
.settings-layout {
  font-size: var(--type-base);
  line-height: var(--leading-ui);
}

.settings-title,
.modal-title,
.card-title,
.section-title {
  font-family: var(--font-display);
  font-weight: var(--weight-semibold);
  letter-spacing: 0;
}

.settings-title {
  font-size: var(--type-2xl);
  line-height: var(--leading-tight);
}

.modal-title,
.card-title {
  font-size: var(--type-xl);
}

.nav-group-label,
.field-label,
.agent-type-badge,
.config-badge,
.skill-badge {
  font-size: var(--type-xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.04em;
}

.nav-item,
.section-title,
.config-provider,
.preset-service,
.field-input,
.field-select,
.field-textarea {
  font-size: var(--type-md);
  font-weight: var(--weight-medium);
}

.settings-desc,
.section-subtitle,
.field-hint,
.preset-model,
.preset-base,
.config-meta,
.dim {
  font-size: var(--type-sm);
  font-weight: var(--weight-regular);
  line-height: var(--leading-copy);
}

.btn,
.modal-actions button,
.admin-session-actions button,
.admin-session-form button {
  font-weight: var(--weight-medium);
}

@media (max-width: 900px) {
  .preset-grid,
  .preset-grid.compact,
  .connections-grid {
    grid-template-columns: 1fr;
  }
  .prompt-studio,
  .health-summary-grid {
    grid-template-columns: 1fr;
  }
  .connection-value {
    max-width: 100%;
  }
  .connection-copy-group {
    max-width: 100%;
    align-items: center;
  }
  .connection-copy-value {
    text-align: left;
  }
  .connection-model-list {
    max-width: 100%;
  }
  .connection-actions {
    grid-template-columns: 1fr;
  }
}
</style>

<template>
  <div class="studio" v-if="drama">
    <header class="studio-topbar">
      <div class="studio-topbar-main">
        <button class="back-btn topbar-back" :title="episodeMessages.header.back" @click="navigateTo(`/drama/${dramaId}`)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          <span class="topbar-back-label">{{ episodeMessages.header.back }}</span>
        </button>
        <div class="studio-identity">
          <h1 class="studio-title">{{ drama.title }}</h1>
          <span class="studio-episode-chip">{{ t('episode.header.episodeChip', { number: episodeNumber }) }}</span>
          <div class="studio-meta-row">
            <span class="studio-meta-pill">{{ currentSubStageLabel }}</span>
            <span class="studio-meta-pill is-progress">{{ pipelineProgress }}/{{ pipelineStepTotal }}</span>
            <span class="studio-meta-inline">{{ t('episode.header.meta', { characters: chars.length, shots: sbs.length }) }}</span>
          </div>
        </div>
      </div>

      <div class="studio-topbar-side">
        <div class="studio-actions">
          <button class="btn" @click="refresh">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            {{ episodeMessages.header.refresh }}
          </button>
          <button class="btn btn-primary" @click="goTopbarPrimary()">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            {{ getTopbarActionLabel() }}
          </button>
        </div>
      </div>
    </header>

    <div class="studio-body">
    <!-- ========== LEFT SIDEBAR ========== -->
    <aside class="sidebar">
      <nav class="pipeline">
        <div
          v-for="section in sidebarSections"
          :key="section.id"
          class="pipe-section"
        >
          <div class="pipe-section-label">{{ section.label }}</div>
          <button
            v-for="item in section.items"
            :key="item.key"
            :class="['pipe-item pipe-item-sub', { active: activeSubStepKey === item.key, done: item.done, partial: item.partial, blocked: item.blocked, 'not-applicable': item.notApplicable }]"
            @click="goSubStep(item.key)"
          >
            <span class="pipe-icon" :class="item.done ? 'icon-done' : item.blocked ? 'icon-blocked' : item.partial ? 'icon-partial' : item.notApplicable ? 'icon-not-applicable' : activeSubStepKey === item.key ? 'icon-active' : ''">
              <svg v-if="item.done" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span v-else-if="item.blocked" class="pipe-blocked-mark">!</span>
              <span v-else-if="item.partial" class="pipe-partial-mark"></span>
              <span v-else-if="item.notApplicable" class="pipe-na-mark"></span>
              <component v-else :is="item.icon" :size="11" />
            </span>
            <span class="pipe-copy">
              <span class="pipe-label">{{ item.label }}</span>
              <span v-if="item.desc" class="pipe-sub">{{ item.desc }}</span>
            </span>
          </button>
        </div>
      </nav>

      <!-- Bottom: Progress + Refresh -->
      <div class="sidebar-bottom">
        <div class="progress-wrap">
          <div class="progress-head">
            <span class="progress-label">{{ episodeMessages.header.progress }}</span>
            <span class="progress-val">{{ pipelineProgress }}/{{ pipelineStepTotal }}</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: (pipelineProgress / pipelineStepTotal * 100) + '%' }"></div>
          </div>
        </div>
        <div class="sidebar-jumper" v-if="sidebarJumpSteps.length">
          <button
            v-for="step in sidebarJumpSteps"
            :key="step.key"
            :class="['sidebar-jump-dot', { active: activeSubStepKey === step.key, done: step.done, partial: step.partial, blocked: step.blocked, 'not-applicable': step.notApplicable }]"
            @click="goSubStep(step.key)"
            :title="step.label"
          ></button>
        </div>
        <button class="refresh-btn" @click="refresh">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          {{ episodeMessages.header.refreshData }}
        </button>
      </div>
    </aside>

    <!-- ========== MAIN CONTENT ========== -->
    <main ref="mainRef" class="main">
      <div v-if="activeSubSteps.length" class="stage-subnav">
        <button
          v-for="sub in activeSubSteps"
          :key="sub.key"
          :class="['stage-subnav-item', { active: activeSubStepKey === sub.key, done: sub.done, partial: sub.partial, blocked: sub.blocked, 'not-applicable': sub.notApplicable }]"
          @click="goSubStep(sub.key)"
        >
          <span>{{ sub.label }}</span>
          <span v-if="sub.done || sub.partial || sub.blocked || sub.notApplicable" :class="['stage-subnav-dot', { partial: sub.partial && !sub.done, blocked: sub.blocked, 'not-applicable': sub.notApplicable }]"></span>
        </button>
      </div>

      <!-- ===== SCRIPT PANEL ===== -->
      <div v-if="panel === 'script'" ref="contentPanelRef" class="content-panel">
        <!-- Step 0: Raw Content -->
        <div v-if="scriptStep === 0" class="step-editor">
          <div class="step-toolbar">
            <div class="toolbar-left">
              <div class="step-indicator">
                <span class="step-num">01</span>
                <span class="step-name">{{ episodeMessages.script.raw.step }}</span>
              </div>
            </div>
            <div class="toolbar-right">
              <span v-if="rawLen" class="char-count">{{ t('episode.script.raw.count', { count: rawLen }) }}</span>
              <button class="btn btn-sm" @click="saveRawManually">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                {{ episodeMessages.script.raw.save }}
              </button>
            </div>
          </div>
          <textarea
            class="fill-textarea"
            v-model="localRaw"
            :placeholder="episodeMessages.script.raw.placeholder"
          />
        </div>

        <!-- Step 1: Rewrite -->
        <div v-else-if="scriptStep === 1" class="step-editor">
          <div class="step-toolbar">
            <div class="toolbar-left">
              <div class="step-indicator">
                <span class="step-num">02</span>
                <span class="step-name">{{ episodeMessages.script.rewrite.step }}</span>
              </div>
            </div>
            <div class="toolbar-right">
              <span v-if="scriptLen" class="char-count">{{ t('episode.script.rewrite.count', { count: scriptLen }) }}</span>
              <button v-if="rawContent" class="btn btn-sm" @click="skipRewrite">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/><path d="M13 18l6-6-6-6"/></svg>
                {{ episodeMessages.script.rewrite.skip }}
              </button>
              <button v-if="scriptContent" class="btn btn-sm" @click="doRewrite" :disabled="rn">
                <Loader2 v-if="rn && rt === 'script_rewriter'" :size="11" class="animate-spin" />
                <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                {{ episodeMessages.script.rewrite.rerun }}
              </button>
            </div>
          </div>

          <div v-if="!scriptContent && !rn" class="step-empty">
            <div class="empty-visual">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
              </svg>
            </div>
            <div class="empty-title">{{ episodeMessages.script.rewrite.emptyTitle }}</div>
            <div class="empty-desc">{{ episodeMessages.script.rewrite.emptyDescription }}</div>
            <div class="step-empty-actions">
              <button class="btn btn-primary" @click="doRewrite">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                {{ episodeMessages.script.rewrite.start }}
              </button>
              <button class="btn" @click="skipRewrite">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14"/><path d="M13 18l6-6-6-6"/></svg>
                {{ episodeMessages.script.rewrite.skip }}
              </button>
            </div>
          </div>
          <div v-else-if="rn && rt === 'script_rewriter'" class="step-loading">
            <Loader2 :size="24" class="animate-spin" style="color:var(--accent)" />
            <div class="loading-text">{{ episodeMessages.script.rewrite.loading }}</div>
          </div>
          <textarea v-else class="fill-textarea" v-model="localScript" :placeholder="episodeMessages.script.rewrite.placeholder" />
        </div>

        <!-- Step 2: Extract -->
        <div v-else-if="scriptStep === 2" class="step-editor">
          <div class="step-toolbar">
            <div class="toolbar-left">
              <div class="step-indicator">
                <span class="step-num">03</span>
                <span class="step-name">{{ episodeMessages.script.extract.step }}</span>
              </div>
            </div>
            <div class="toolbar-right">
              <span v-if="hasExtractedEntities" class="char-count">{{ t('episode.script.extract.count', { characters: chars.length, scenes: scenes.length, props: propsItems.length }) }}</span>
              <button v-if="hasExtractedEntities" class="btn btn-sm" @click="doExtract" :disabled="rn">
                <Loader2 v-if="rn && rt === 'extractor'" :size="11" class="animate-spin" />
                <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                {{ episodeMessages.script.extract.rerun }}
              </button>
            </div>
          </div>

          <div v-if="!hasExtractedEntities && !rn" class="step-empty">
            <div class="empty-visual">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
            <div class="empty-title">{{ episodeMessages.script.extract.emptyTitle }}</div>
            <div class="empty-desc">{{ episodeMessages.script.extract.emptyDescription }}</div>
            <button class="btn btn-primary" @click="doExtract">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              {{ episodeMessages.script.extract.start }}
            </button>
          </div>
          <div v-else-if="rn && rt === 'extractor'" class="step-loading">
            <Loader2 :size="24" class="animate-spin" style="color:var(--accent)" />
            <div class="loading-text">{{ episodeMessages.script.extract.loading }}</div>
          </div>
          <div v-else class="extract-stage">
            <aside class="card extract-summary">
              <div class="extract-summary-kicker">{{ episodeMessages.extractBoard.kicker }}</div>
              <div class="extract-summary-title">{{ episodeMessages.extractBoard.title }}</div>
              <div class="extract-summary-desc">{{ episodeMessages.extractBoard.description }}</div>
              <div class="extract-summary-stats">
                <div class="extract-summary-stat">
                  <span>{{ episodeMessages.extractBoard.characters }}</span>
                  <strong>{{ chars.length }}</strong>
                </div>
                <div class="extract-summary-stat">
                  <span>{{ episodeMessages.extractBoard.scenes }}</span>
                  <strong>{{ scenes.length }}</strong>
                </div>
                <div class="extract-summary-stat">
                  <span>{{ episodeMessages.extractBoard.props }}</span>
                  <strong>{{ propsItems.length }}</strong>
                </div>
              </div>
              <div class="extract-summary-note">{{ episodeMessages.extractBoard.note }}</div>
            </aside>

            <div class="extract-grid">
              <div class="card extract-card">
                <div class="extract-card-head">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  <span>{{ episodeMessages.extractBoard.characters }}</span>
                  <span class="tag tag-accent">{{ chars.length }}</span>
                </div>
                <div class="extract-list">
                  <div v-for="c in chars" :key="c.id" class="extract-row">
                    <div class="char-avatar">{{ c.name?.[0] || '?' }}</div>
                    <div class="extract-info">
                      <div class="extract-name-row">
                        <div class="extract-name">{{ c.name }}</div>
                        <span class="tag">{{ c.role || episodeCommon.roleFallback }}</span>
                      </div>
                      <div class="extract-meta wrap">{{ c.description || c.appearance || c.personality || episodeCommon.noDescription }}</div>
                      <div v-if="getExtractionAuditSummary(c)" class="extract-meta wrap">
                        {{ getExtractionAuditSummary(c) }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="card extract-card" v-if="scenes.length">
                <div class="extract-card-head">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  <span>{{ episodeMessages.extractBoard.scenes }}</span>
                  <span class="tag tag-accent">{{ scenes.length }}</span>
                </div>
                <div class="extract-list">
                  <div v-for="s in scenes" :key="s.id" class="extract-row">
                    <div class="scene-icon">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    </div>
                    <div class="extract-info">
                      <div class="extract-name-row">
                        <div class="extract-name">{{ s.location }}</div>
                        <span v-if="s.time" class="tag">{{ s.time }}</span>
                      </div>
                      <div class="extract-meta wrap">{{ s.description || s.time || episodeCommon.pendingSceneDescription }}</div>
                      <div v-if="getExtractionAuditSummary(s)" class="extract-meta wrap">
                        {{ getExtractionAuditSummary(s) }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="card extract-card" v-if="propsItems.length">
                <div class="extract-card-head">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="7.5 4.21 12 6.81 16.5 4.21"/><polyline points="7.5 19.79 7.5 14.6 3 12"/><polyline points="21 12 16.5 14.6 16.5 19.79"/><polyline points="12 22.08 12 17"/></svg>
                  <span>{{ episodeMessages.extractBoard.props }}</span>
                  <span class="tag tag-accent">{{ propsItems.length }}</span>
                </div>
                <div class="extract-list">
                  <div v-for="p in propsItems" :key="p.id" class="extract-row">
                    <div class="scene-icon">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                    </div>
                    <div class="extract-info">
                      <div class="extract-name-row">
                        <div class="extract-name">{{ p.name }}</div>
                        <span v-if="p.type" class="tag">{{ p.type }}</span>
                      </div>
                      <div class="extract-meta wrap">{{ p.description || p.prompt || episodeCommon.pendingPropDescription }}</div>
                      <div v-if="getExtractionAuditSummary(p)" class="extract-meta wrap">
                        {{ getExtractionAuditSummary(p) }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Step 3: Voice Assignment -->
        <div v-else-if="scriptStep === 3" class="step-editor">
          <div class="step-toolbar">
            <div class="toolbar-left">
              <div class="step-indicator">
                <span class="step-num">04</span>
                <span class="step-name">{{ episodeMessages.script.voice.step }}</span>
              </div>
            </div>
            <div class="toolbar-right">
              <span v-if="charsVoiced" class="char-count">{{ t('episode.script.voice.assignedCount', { assigned: charsVoiced, total: chars.length }) }}</span>
              <span v-if="voiceSampleCount" class="char-count">{{ t('episode.script.voice.sampleCount', { ready: voiceSampleCount, total: charsVoiced }) }}</span>
              <button v-if="charsVoiced" class="btn btn-sm" @click="doVoice" :disabled="rn">
                <Loader2 v-if="rn && rt === 'voice_assigner'" :size="11" class="animate-spin" />
                <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
                {{ episodeMessages.script.voice.rerun }}
              </button>
              <button v-if="charsVoiced" class="btn btn-sm" @click="batchGenSamples">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19 5v14"/></svg>
                {{ episodeMessages.script.voice.batchSamples }}
              </button>
            </div>
          </div>

          <div v-if="!charsVoiced && !rn" class="step-empty">
            <div class="empty-visual">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
            </div>
            <div class="empty-title">{{ episodeMessages.script.voice.emptyTitle }}</div>
            <div class="empty-desc">{{ episodeMessages.script.voice.emptyDescription }}</div>
            <button class="btn btn-primary" @click="doVoice">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              {{ episodeMessages.script.voice.start }}
            </button>
          </div>
          <div v-else-if="rn && rt === 'voice_assigner'" class="step-loading">
            <Loader2 :size="24" class="animate-spin" style="color:var(--accent)" />
            <div class="loading-text">{{ episodeMessages.script.voice.loading }}</div>
          </div>
          <div v-else class="voice-stage">
            <aside class="card voice-stage-panel">
              <div class="voice-stage-kicker">{{ episodeMessages.voiceBoard.kicker }}</div>
              <div class="voice-stage-title">{{ episodeMessages.voiceBoard.title }}</div>
              <div class="voice-stage-desc">{{ episodeMessages.voiceBoard.description }}</div>
              <div class="voice-stage-stats">
                <div class="voice-stage-stat">
                  <span class="voice-stage-stat-label">{{ episodeMessages.voiceBoard.assigned }}</span>
                  <strong>{{ charsVoiced }}/{{ chars.length }}</strong>
                </div>
                <div class="voice-stage-stat">
                  <span class="voice-stage-stat-label">{{ episodeMessages.voiceBoard.samples }}</span>
                  <strong>{{ voiceSampleCount }}/{{ charsVoiced }}</strong>
                </div>
              </div>
              <div class="voice-library-meta">
                <span>{{ episodeMessages.voiceBoard.library }}</span>
                <span>{{ t('episode.voiceBoard.libraryCount', { count: voiceProfiles.length }) }}</span>
              </div>
              <div class="voice-library">
                <div v-for="voice in voiceProfiles" :key="voice.id" class="voice-library-item">
                  <div class="voice-library-head">
                    <span class="voice-library-name">{{ voice.label }}</span>
                    <span class="tag">{{ voice.gender }}</span>
                  </div>
                  <div class="voice-library-traits">{{ voice.traits }}</div>
                  <div class="voice-library-fit">{{ voice.suitable }}</div>
                </div>
              </div>
            </aside>

            <div class="voice-grid">
              <div v-for="c in chars" :key="c.id" class="card voice-card">
                <div class="voice-card-head">
                  <div class="voice-char">
                    <div class="char-avatar lg">{{ c.name?.[0] || '?' }}</div>
                    <div class="voice-name">
                      <div class="voice-name-row">
                        <div class="extract-name">{{ c.name }}</div>
                        <span class="tag" :class="(c.voice_style || c.voiceStyle) ? 'tag-success' : ''">{{ (c.voice_style || c.voiceStyle) ? episodeCommon.assigned : episodeCommon.pendingAssignment }}</span>
                      </div>
                      <div class="extract-meta">{{ c.role || episodeCommon.roleFallback }}</div>
                    </div>
                  </div>
                </div>

                <div class="voice-card-copy">
                  <div class="voice-card-text">{{ c.description || c.personality || c.appearance || episodeCommon.missingCharacterDescription }}</div>
                </div>

                <div class="voice-select-block">
                  <span class="voice-block-label">{{ episodeMessages.voiceBoard.selectVoice }}</span>
                  <BaseSelect
                    :model-value="c.voice_style || c.voiceStyle || ''"
                    :options="voiceSelectOptions"
                    :placeholder="episodeMessages.voiceBoard.selectVoice"
                    searchable
                    style="width:100%"
                    @update:model-value="updateCharVoice(c.id, $event)"
                  />
                </div>

                <div v-if="getVoiceProfile(c.voice_style || c.voiceStyle)" class="voice-profile-card">
                  <div class="voice-profile-head">
                    <span class="voice-profile-name">{{ getVoiceProfile(c.voice_style || c.voiceStyle)?.label }}</span>
                    <span class="tag">{{ getVoiceProfile(c.voice_style || c.voiceStyle)?.gender }}</span>
                  </div>
                  <div class="voice-profile-traits">{{ getVoiceProfile(c.voice_style || c.voiceStyle)?.traits }}</div>
                  <div class="voice-profile-fit">{{ getVoiceProfile(c.voice_style || c.voiceStyle)?.suitable }}</div>
                </div>

                <div class="voice-actions-row">
                  <button class="btn btn-sm" :disabled="!(c.voice_style || c.voiceStyle)" @click="genSample(c.id)">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                    {{ (c.voice_sample_url || c.voiceSampleUrl) ? episodeMessages.voiceBoard.regenerateSample : episodeMessages.voiceBoard.generateSample }}
                  </button>
                  <span class="dim" style="font-size:11px">{{ (c.voice_sample_url || c.voiceSampleUrl) ? episodeMessages.voiceBoard.readyHint : episodeMessages.voiceBoard.pendingHint }}</span>
                </div>

                <div v-if="c.voice_sample_url || c.voiceSampleUrl" class="voice-player">
                  <audio :src="'/' + (c.voice_sample_url || c.voiceSampleUrl)" controls preload="none" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Step 4: Storyboard -->
        <div v-else-if="scriptStep === 4" class="step-editor">
          <div class="step-toolbar">
            <div class="toolbar-left">
              <div class="step-indicator">
                <span class="step-num">05</span>
                <span class="step-name">{{ episodeMessages.script.storyboard.step }}</span>
              </div>
            </div>
            <div class="toolbar-right">
              <span v-if="sbs.length" class="char-count">{{ t('episode.script.storyboard.count', { count: sbs.length, duration: totalDurationValue }) }}</span>
              <button v-if="sbs.length" class="btn btn-sm" @click="addShot">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                {{ episodeMessages.script.storyboard.add }}
              </button>
              <template v-if="!sbs.length">
                <span class="locked-config">{{ t('episode.script.storyboard.lockedVideo', { label: lockedVideoConfigLabel }) }}</span>
              </template>
              <button class="btn btn-sm" :disabled="rn" @click="doBreakdown">
                <Loader2 v-if="rt === 'storyboard_breaker'" :size="11" class="animate-spin" />
                <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                {{ sbs.length ? episodeMessages.script.storyboard.rerun : episodeMessages.script.storyboard.start }}
              </button>
            </div>
          </div>

          <div v-if="sbs.length" class="split-layout">
            <!-- Shot List -->
            <div class="shot-list">
              <div class="shot-list-head">
                <div>
                  <div class="shot-list-title">{{ episodeMessages.storyboardDetail.sequenceTitle }}</div>
                  <div class="shot-list-sub">{{ episodeMessages.storyboardDetail.sequenceSubtitle }}</div>
                </div>
                <span class="tag mono">{{ totalDurationLabel }}</span>
              </div>
              <div class="shot-list-body">
                <div
                  v-for="(sb, i) in sbs"
                  :key="sb.id"
                  :class="['shot-item', { active: selectedSb?.id === sb.id }]"
                  @click="selectedSb = sb"
                >
                  <div class="shot-item-header">
                    <div class="shot-num">#{{ String(i+1).padStart(2,'0') }}</div>
                    <span class="tag" style="font-size:10px">{{ sb.shot_type || sb.shotType || '—' }}</span>
                    <span v-if="getStoryboardCharacterIds(sb).length" class="tag" style="font-size:10px">{{ t('episode.storyboardDetail.characterCount', { count: getStoryboardCharacterIds(sb).length }) }}</span>
                    <div class="shot-status">
                      <div v-if="sb.imageUrl || sb.composedImage || sb.firstFrameImage" class="shot-dot has-img" :title="episodeMessages.storyboardDetail.imageReadyTitle"></div>
                      <div v-if="sb.videoUrl || sb.composedVideoUrl" class="shot-dot has-video" :title="episodeMessages.storyboardDetail.videoReadyTitle"></div>
                      <div v-if="hasDialogue(sb)" class="shot-dot has-dialogue" :title="episodeMessages.storyboardDetail.dialogueTitle"></div>
                    </div>
                  </div>
                  <div class="shot-body">
                    <div class="shot-desc">{{ sb.description || sb.title || episodeCommon.noShotDescription }}</div>
                  </div>
                  <div class="shot-meta">
                    <span class="mono dim" style="font-size:10px">{{ formatStoryboardDuration(sb) }}</span>
                    <span v-if="sb.location" class="shot-location">{{ sb.location }}</span>
                    <span v-if="getStoryboardCharacterNames(sb).length" class="shot-location">{{ getStoryboardCharacterNames(sb).join(' / ') }}</span>
                    <span v-if="hasDialogue(sb)" class="shot-dialogue">{{ getDialogueText(sb) }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Detail Panel -->
            <div class="detail-panel" v-if="selectedSb">
                <div class="detail-head">
                  <div class="detail-head-copy">
                    <span class="detail-head-title">{{ t('episode.storyboardDetail.shotTitle', { number: sbs.indexOf(selectedSb) + 1 }) }}</span>
                  <span class="detail-head-sub">{{ selectedSb.title || t('episode.storyboardDetail.shotTitleFallback', { number: sbs.indexOf(selectedSb) + 1 }) }} · {{ selectedSb.shot_type || selectedSb.shotType || episodeCommon.unsetShotType }}</span>
                  </div>
                  <span class="tag mono">{{ formatStoryboardDuration(selectedSb) }}</span>
                  <button
                    class="btn btn-ghost btn-icon ml-auto detail-delete-btn"
                    :title="episodeMessages.storyboardDetail.deleteAction"
                    @click="requestDeleteShot(selectedSb)"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                  </button>
              </div>
              <div class="detail-body">
                <div class="detail-hero">
                  <div class="detail-hero-copy">
                    <div class="detail-hero-label">{{ episodeMessages.storyboardDetail.overviewLabel }}</div>
                    <div class="detail-hero-text">{{ selectedSb.description || selectedSb.title || episodeMessages.storyboardDetail.overviewFallback }}</div>
                    <div class="detail-status-row">
                      <span class="tag">{{ getSceneName(selectedSb) }}</span>
                      <span class="tag">{{ selectedSb.angle || episodeCommon.unsetAngle }}</span>
                      <span class="tag">{{ selectedSb.movement || episodeCommon.unsetMovement }}</span>
                      <span class="tag">{{ getMotionPresetLabel(getEffectiveMotionPreset(selectedSb)) }}</span>
                      <span :class="['tag', 'tag-review', getReviewStatusClass(selectedSb)]">{{ getReviewStatusLabel(selectedSb) }}</span>
                      <span v-if="getContinuitySourceLabel(selectedSb)" class="tag">{{ getContinuitySourceLabel(selectedSb) }}</span>
                      <span class="tag" :class="getFirstFrame(selectedSb) ? 'tag-success' : ''">{{ t('episode.storyboardDetail.firstFrameStatus', { status: getFirstFrame(selectedSb) ? episodeCommon.generated : episodeCommon.pending }) }}</span>
                      <span class="tag" :class="getLastFrame(selectedSb) ? 'tag-success' : ''">{{ t('episode.storyboardDetail.lastFrameStatus', { status: getLastFrame(selectedSb) ? episodeCommon.generated : episodeCommon.pending }) }}</span>
                      <span class="tag" :class="hasVid(selectedSb) ? 'tag-success' : ''">{{ t('episode.storyboardDetail.videoStatus', { status: hasVid(selectedSb) ? episodeCommon.generated : episodeCommon.pending }) }}</span>
                    </div>
                  </div>
                  <div class="detail-preview-grid">
                    <div class="detail-preview-card">
                      <div class="detail-preview-title">{{ episodeMessages.storyboardDetail.preview.first }}</div>
                      <div class="detail-preview-media">
                        <img
                          v-if="getFirstFrame(selectedSb)"
                          :src="'/' + getFirstFrame(selectedSb)"
                          class="previewable-image"
                          @click.stop="openImageViewer('/' + getFirstFrame(selectedSb), getShotFramePreviewTitle(sbs.indexOf(selectedSb) + 1, 'first_frame'))"
                        />
                        <div v-else class="detail-preview-empty">{{ episodeMessages.storyboardDetail.preview.pending }}</div>
                      </div>
                    </div>
                    <div class="detail-preview-card">
                      <div class="detail-preview-title">{{ episodeMessages.storyboardDetail.preview.last }}</div>
                      <div class="detail-preview-media">
                        <img
                          v-if="getLastFrame(selectedSb)"
                          :src="'/' + getLastFrame(selectedSb)"
                          class="previewable-image"
                          @click.stop="openImageViewer('/' + getLastFrame(selectedSb), getShotFramePreviewTitle(sbs.indexOf(selectedSb) + 1, 'last_frame'))"
                        />
                        <div v-else class="detail-preview-empty">{{ episodeMessages.storyboardDetail.preview.pending }}</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="detail-section">
                  <div class="detail-section-head">
                    <span class="detail-section-title">{{ episodeMessages.storyboardDetail.structureTitle }}</span>
                    <span class="detail-section-copy">{{ episodeMessages.storyboardDetail.structureCopy }}</span>
                  </div>
                  <div class="field-grid field-grid-4">
                    <label class="field">
                      <span class="field-label">{{ episodeMessages.storyboardDetail.fields.title }}</span>
                      <input :value="selectedSb.title || ''" class="input"
                        @blur="updateField(selectedSb, 'title', $event.target.value)" :placeholder="episodeMessages.storyboardDetail.fields.titlePlaceholder" />
                    </label>
                    <label class="field">
                      <span class="field-label">{{ episodeMessages.storyboardDetail.fields.shotType }}</span>
                      <input
                        list="shot-type-list"
                        :value="selectedSb.shot_type || selectedSb.shotType || ''"
                        class="input"
                        :placeholder="episodeMessages.storyboardDetail.fields.shotTypePlaceholder"
                        @change="updateField(selectedSb, 'shot_type', $event.target.value)"
                      />
                      <datalist id="shot-type-list">
                        <option v-for="t in shotTypes" :key="t" :value="t" />
                      </datalist>
                    </label>
                    <label class="field">
                      <span class="field-label">{{ episodeMessages.storyboardDetail.fields.angle }}</span>
                      <input
                        list="shot-angle-list"
                        :value="selectedSb.angle || ''"
                        class="input"
                        :placeholder="episodeMessages.storyboardDetail.fields.anglePlaceholder"
                        @change="updateField(selectedSb, 'angle', $event.target.value)"
                      />
                      <datalist id="shot-angle-list">
                        <option v-for="t in shotAngles" :key="t" :value="t" />
                      </datalist>
                    </label>
                    <label class="field">
                      <span class="field-label">{{ episodeMessages.storyboardDetail.fields.movement }}</span>
                      <input
                        list="shot-movement-list"
                        :value="selectedSb.movement || ''"
                        class="input"
                        :placeholder="episodeMessages.storyboardDetail.fields.movementPlaceholder"
                        @change="updateField(selectedSb, 'movement', $event.target.value)"
                      />
                      <datalist id="shot-movement-list">
                        <option v-for="t in shotMovements" :key="t" :value="t" />
                      </datalist>
                    </label>
                  </div>
                  <div class="field-grid field-grid-4">
                    <label class="field">
                      <span class="field-label">{{ episodeMessages.storyboardDetail.fields.bindCharacters }}</span>
                      <div class="role-pills">
                        <button
                          v-for="char in chars"
                          :key="char.id"
                          type="button"
                          :class="['role-pill', { active: isStoryboardCharacterSelected(selectedSb, char.id) }]"
                          @click="toggleStoryboardCharacter(selectedSb, char.id)"
                        >
                          {{ char.name }}
                        </button>
                        <span v-if="!chars.length" class="dim" style="font-size:12px">{{ episodeCommon.noCharactersInEpisode }}</span>
                      </div>
                    </label>
                    <label class="field">
                      <span class="field-label">{{ episodeMessages.storyboardDetail.fields.bindScene }}</span>
                      <BaseSelect
                        :model-value="getStoryboardSceneSelectValue(selectedSb)"
                        :options="sceneSelectOptions"
                        :placeholder="episodeMessages.storyboardDetail.fields.bindScenePlaceholder"
                        searchable
                        style="width:100%"
                        @update:model-value="updateField(selectedSb, 'scene_id', $event ? Number($event) : null)"
                      />
                    </label>
                    <label class="field">
                      <span class="field-label">{{ episodeMessages.storyboardDetail.fields.location }}</span>
                      <input :value="selectedSb.location || ''" class="input"
                        @blur="updateField(selectedSb, 'location', $event.target.value)" :placeholder="episodeMessages.storyboardDetail.fields.locationPlaceholder" />
                    </label>
                    <label class="field">
                      <span class="field-label">{{ episodeMessages.storyboardDetail.fields.time }}</span>
                      <input :value="selectedSb.time || ''" class="input"
                        @blur="updateField(selectedSb, 'time', $event.target.value)" :placeholder="episodeMessages.storyboardDetail.fields.timePlaceholder" />
                    </label>
                    <label class="field">
                      <span class="field-label">{{ episodeMessages.storyboardDetail.fields.duration }}</span>
                      <input :value="selectedSb.duration || 10" class="input" type="number" min="1" max="60"
                        @blur="updateField(selectedSb, 'duration', Number($event.target.value))" />
                    </label>
                  </div>
                  <div class="field-grid field-grid-2">
                    <label class="field">
                      <span class="field-label">{{ episodeMessages.storyboardDetail.fields.motionPreset }}</span>
                      <BaseSelect
                        :model-value="getStoryboardMotionPresetOverride(selectedSb)"
                        :options="motionPresetOverrideOptions"
                        :placeholder="episodeMessages.storyboardDetail.fields.motionPresetPlaceholder"
                        style="width:100%"
                        @update:model-value="updateStoryboardMotionPreset(selectedSb, $event)"
                      />
                      <span class="field-help">{{ t('episode.storyboardDetail.motionEffective', { preset: getMotionPresetLabel(getEffectiveMotionPreset(selectedSb)) }) }}</span>
                    </label>
                    <div class="field">
                      <span class="field-label">{{ episodeMessages.storyboardDetail.motionStatusLabel }}</span>
                      <span class="field-help">{{ getStoryboardMotionScopeNote(selectedSb) }}</span>
                    </div>
                  </div>
                </div>
                <div class="detail-section">
                  <div class="detail-section-head">
                    <span class="detail-section-title">{{ episodeMessages.storyboardDetail.visualTitle }}</span>
                    <span class="detail-section-copy">{{ episodeMessages.storyboardDetail.visualCopy }}</span>
                  </div>
                  <div class="field-grid field-grid-2">
                    <label class="field">
                      <span class="field-label">{{ episodeMessages.storyboardDetail.fields.action }}</span>
                      <textarea :value="selectedSb.action || ''" class="textarea" rows="3"
                        @blur="updateField(selectedSb, 'action', $event.target.value)" :placeholder="episodeMessages.storyboardDetail.fields.actionPlaceholder" />
                    </label>
                    <label class="field">
                      <span class="field-label">{{ episodeMessages.storyboardDetail.fields.result }}</span>
                      <textarea :value="selectedSb.result || ''" class="textarea" rows="3"
                        @blur="updateField(selectedSb, 'result', $event.target.value)" :placeholder="episodeMessages.storyboardDetail.fields.resultPlaceholder" />
                    </label>
                  </div>
                  <div class="field-grid field-grid-2">
                    <label class="field">
                      <span class="field-label">{{ episodeMessages.storyboardDetail.fields.description }}</span>
                      <textarea :value="selectedSb.description || ''" class="textarea" rows="4"
                        @blur="updateField(selectedSb, 'description', $event.target.value)" :placeholder="episodeMessages.storyboardDetail.fields.descriptionPlaceholder" />
                    </label>
                    <label class="field">
                      <span class="field-label">{{ episodeMessages.storyboardDetail.fields.atmosphere }}</span>
                      <textarea :value="selectedSb.atmosphere || ''" class="textarea" rows="4"
                        @blur="updateField(selectedSb, 'atmosphere', $event.target.value)" :placeholder="episodeMessages.storyboardDetail.fields.atmospherePlaceholder" />
                    </label>
                  </div>
                  <label class="field">
                    <span class="field-label">{{ episodeMessages.storyboardDetail.fields.dialogue }}</span>
                    <textarea :value="selectedSb.dialogue || ''" class="textarea" rows="3"
                      @blur="updateField(selectedSb, 'dialogue', $event.target.value)" :placeholder="episodeMessages.storyboardDetail.fields.dialoguePlaceholder" />
                  </label>
                  <div v-if="!selectedSb.dialogue && hasDialogue(selectedSb)" class="dim" style="font-size:12px; margin-top:-8px">
                    {{ getDialogueText(selectedSb) }}
                  </div>
                </div>
                <div class="detail-section">
                  <div class="detail-section-head">
                    <span class="detail-section-title">{{ episodeMessages.storyboardDetail.promptsTitle }}</span>
                    <span class="detail-section-copy">{{ episodeMessages.storyboardDetail.promptsCopy }}</span>
                  </div>
                  <label class="field">
                    <span class="field-label">{{ episodeMessages.storyboardDetail.fields.imagePrompt }}</span>
                    <textarea :value="selectedSb.image_prompt || selectedSb.imagePrompt || ''" class="textarea" rows="4"
                      @blur="updateField(selectedSb, 'image_prompt', $event.target.value)" :placeholder="episodeMessages.storyboardDetail.fields.imagePromptPlaceholder" />
                  </label>
                  <label class="field">
                    <span class="field-label">{{ episodeMessages.storyboardDetail.fields.videoPrompt }}</span>
                    <textarea :value="selectedSb.video_prompt || selectedSb.videoPrompt || ''" class="textarea" rows="5"
                      @blur="updateField(selectedSb, 'video_prompt', $event.target.value)" :placeholder="episodeMessages.storyboardDetail.fields.videoPromptPlaceholder" />
                  </label>
                  <div class="field-grid field-grid-2">
                    <label class="field">
                      <span class="field-label">{{ episodeMessages.storyboardDetail.fields.bgmPrompt }}</span>
                      <textarea :value="selectedSb.bgm_prompt || selectedSb.bgmPrompt || ''" class="textarea" rows="3"
                        @blur="updateField(selectedSb, 'bgm_prompt', $event.target.value)" :placeholder="episodeMessages.storyboardDetail.fields.bgmPromptPlaceholder" />
                    </label>
                    <label class="field">
                      <span class="field-label">{{ episodeMessages.storyboardDetail.fields.soundEffect }}</span>
                      <textarea :value="selectedSb.sound_effect || selectedSb.soundEffect || ''" class="textarea" rows="3"
                        @blur="updateField(selectedSb, 'sound_effect', $event.target.value)" :placeholder="episodeMessages.storyboardDetail.fields.soundEffectPlaceholder" />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-else-if="rn && rt === 'storyboard_breaker'" class="step-loading">
            <Loader2 :size="24" class="animate-spin" style="color:var(--accent)" />
            <div class="loading-text">{{ episodeMessages.script.storyboard.loading }}</div>
          </div>

          <div v-else class="step-empty">
            <div class="empty-visual">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
                <rect x="2" y="2" width="20" height="20" rx="2.5"/><line x1="7" y1="8" x2="7" y2="16"/><line x1="10" y1="8" x2="10" y2="16"/><line x1="13" y1="8" x2="13" y2="16"/>
              </svg>
            </div>
            <div class="empty-title">{{ episodeMessages.script.storyboard.emptyTitle }}</div>
            <div class="empty-desc">{{ episodeMessages.script.storyboard.emptyDescription }}</div>
            <div class="locked-config-banner">{{ t('episode.script.storyboard.lockedBanner', { label: lockedVideoConfigLabel }) }}</div>
            <button class="btn btn-primary" @click="doBreakdown">
              <Loader2 v-if="rt === 'storyboard_breaker'" :size="13" class="animate-spin" />
              <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              {{ episodeMessages.script.storyboard.start }}
            </button>
          </div>
        </div>

      </div>

      <!-- ===== PRODUCTION PANEL ===== -->
      <div v-else-if="panel === 'production'" class="content-panel">
        <!-- Guard: need script -->
        <div v-if="!scriptContent || !sbs.length" class="step-empty" style="flex:1">
          <div class="empty-visual">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
          </div>
          <div class="empty-title">{{ episodeMessages.production.notReadyTitle }}</div>
          <div class="empty-desc">{{ !scriptContent ? episodeMessages.production.notReadyScript : episodeMessages.production.notReadyStoryboard }}</div>
          <button class="btn btn-primary" @click="panel = 'script'">{{ episodeMessages.production.backToScript }}</button>
        </div>

        <template v-else>
          <div class="step-toolbar prod-toolbar">
            <div class="toolbar-left">
              <div class="step-indicator">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                <span class="step-name">{{ episodeMessages.production.workspace }}</span>
              </div>
            </div>
            <div class="prod-tabs">
              <button
                v-for="t in prodTabDefs"
                :key="t.id"
                :class="['prod-tab', prodStepStatusClass(t.id), { active: prodTab === t.id }]"
                @click="setProdTab(t.id)"
              >
                <component :is="t.icon" :size="11" />
                {{ t.label }}
                <span v-if="t.badge" class="prod-tab-badge">{{ t.badge }}</span>
              </button>
            </div>
          </div>

          <!-- Sub: Characters -->
          <div v-if="prodTab === 'chars'" class="prod-content">
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">{{ t('episode.production.chars.summary', { count: visualChars.length }) }}</span>
              <span class="tag">{{ lockedImageConfigLabel }}</span>
              <span v-if="chars.length > visualChars.length" class="tag">{{ episodeCommon.narratorOnlyVoice }}</span>
              <div class="ml-auto flex gap-1">
                <button class="btn btn-sm" :disabled="!canBatchCharImages" @click="batchCharImages">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  {{ episodeMessages.production.chars.batch }}
                </button>
              </div>
            </div>
            <div v-if="!visualChars.length" class="step-empty" style="min-height:260px">
              <div class="empty-visual">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
              <div class="empty-title">{{ episodeMessages.production.chars.emptyTitle }}</div>
              <div class="empty-desc">{{ episodeMessages.production.chars.emptyDescription }}</div>
            </div>
            <div v-else class="asset-grid">
              <div v-for="c in visualChars" :key="c.id" class="card asset-card">
                <div class="asset-cover">
                  <img
                    v-if="c.image_url || c.imageUrl"
                    :src="'/' + (c.image_url || c.imageUrl)"
                    class="previewable-image"
                    @click.stop="openImageViewer('/' + (c.image_url || c.imageUrl), t('episode.production.chars.imageTitle', { name: c.name }))"
                  />
                  <div v-else class="asset-cover-empty">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </div>
                  <span class="asset-cover-badge" :class="(c.image_url || c.imageUrl) ? 'is-ready' : (isPendingCharImage(c.id) ? 'is-pending' : (charImageFailMessage(c.id) ? 'is-failed' : ''))">{{ getProductionEntryStatusLabel(!!(c.image_url || c.imageUrl), isPendingCharImage(c.id), !!charImageFailMessage(c.id)) }}</span>
                </div>
                <div class="asset-body media-card-body">
                  <div class="asset-name media-card-title truncate">{{ c.name }}</div>
                  <div class="asset-meta media-card-submeta">{{ c.role || episodeCommon.roleFallback }}</div>
                </div>
                <div class="asset-foot">
                  <div class="asset-foot-status media-card-status">
                    <span :class="['dot', (c.image_url || c.imageUrl) && 'ok', isPendingCharImage(c.id) && 'pending', charImageFailMessage(c.id) && 'fail']" />
                    <span class="dim" style="font-size:10px">{{ getProductionEntryStatusLabel(!!(c.image_url || c.imageUrl), isPendingCharImage(c.id), !!charImageFailMessage(c.id)) }}</span>
                  </div>
                  <div class="media-card-actions">
                    <div class="media-card-actions-row">
                      <button class="btn btn-sm" @click="copyCharacterPrompt(c)">{{ episodeCommon.copyPrompt }}</button>
                      <button class="btn btn-sm" :disabled="isPendingCharImage(c.id)" @click="attachCharacterImage(c)">
                        {{ episodeMessages.production.chars.add }}
                      </button>
                    </div>
                    <button class="btn btn-sm media-card-action-main" :disabled="isPendingCharImage(c.id)" @click="genCharImg(c.id)">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      {{ isPendingCharImage(c.id) ? episodeCommon.generating : episodeMessages.production.chars.generate }}
                    </button>
                  </div>
                </div>
                <div v-if="charImageFailMessage(c.id)" class="asset-error">{{ charImageFailMessage(c.id) }}</div>
              </div>
            </div>
          </div>

          <!-- Sub: Scenes -->
          <div v-else-if="prodTab === 'scenes'" class="prod-content">
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">{{ t('episode.production.scenes.summary', { count: scenes.length }) }}</span>
              <span class="tag">{{ lockedImageConfigLabel }}</span>
              <div class="ml-auto flex gap-1">
                <button class="btn btn-sm" :disabled="!canBatchSceneImages" @click="batchSceneImages">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  {{ episodeMessages.production.scenes.batch }}
                </button>
              </div>
            </div>
            <div class="asset-grid">
              <div v-for="s in scenes" :key="s.id" class="card asset-card">
                <div class="asset-cover wide">
                  <img
                    v-if="s.image_url || s.imageUrl"
                    :src="'/' + (s.image_url || s.imageUrl)"
                    class="previewable-image"
                    @click.stop="openImageViewer('/' + (s.image_url || s.imageUrl), t('episode.production.scenes.imageTitle', { name: s.location }))"
                  />
                  <div v-else class="asset-cover-empty">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  </div>
                  <span class="asset-cover-badge" :class="(s.image_url || s.imageUrl) ? 'is-ready' : (isPendingSceneImage(s.id) ? 'is-pending' : (sceneImageFailMessage(s.id) ? 'is-failed' : ''))">{{ getProductionEntryStatusLabel(!!(s.image_url || s.imageUrl), isPendingSceneImage(s.id), !!sceneImageFailMessage(s.id)) }}</span>
                </div>
                <div class="asset-body media-card-body">
                  <div class="asset-name media-card-title truncate">{{ s.location }}</div>
                  <div class="asset-meta media-card-submeta">{{ s.time || episodeCommon.blank }}</div>
                </div>
                <div class="asset-foot">
                  <div class="asset-foot-status media-card-status">
                    <span :class="['dot', (s.image_url || s.imageUrl) && 'ok', isPendingSceneImage(s.id) && 'pending', sceneImageFailMessage(s.id) && 'fail']" />
                    <span class="dim" style="font-size:10px">{{ getProductionEntryStatusLabel(!!(s.image_url || s.imageUrl), isPendingSceneImage(s.id), !!sceneImageFailMessage(s.id)) }}</span>
                  </div>
                  <div class="media-card-actions">
                    <div class="media-card-actions-row">
                      <button class="btn btn-sm" @click="copyScenePrompt(s)">{{ episodeCommon.copyPrompt }}</button>
                      <button class="btn btn-sm" :disabled="isPendingSceneImage(s.id)" @click="attachSceneImage(s)">
                        {{ episodeMessages.production.scenes.add }}
                      </button>
                    </div>
                    <button class="btn btn-sm media-card-action-main" :disabled="isPendingSceneImage(s.id)" @click="genSceneImg(s.id)">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      {{ isPendingSceneImage(s.id) ? episodeCommon.generating : episodeMessages.production.scenes.generate }}
                    </button>
                  </div>
                </div>
                <div v-if="sceneImageFailMessage(s.id)" class="asset-error">{{ sceneImageFailMessage(s.id) }}</div>
              </div>
            </div>
          </div>

          <!-- Sub: Dubbing -->
          <div v-else-if="prodTab === 'dubbing'" class="prod-content">
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">{{ t('episode.production.dubbing.totalSummary', { count: ttsEligibleCount }) }}</span>
              <span class="tag mono">{{ t('episode.production.dubbing.generatedSummary', { done: ttsGeneratedCount, total: ttsEligibleCount }) }}</span>
              <span class="tag">{{ lockedAudioConfigLabel }}</span>
              <div class="ml-auto flex gap-1">
                <button class="btn btn-sm" :disabled="!canBatchShotVoices" @click="batchShotTTS">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
                  {{ episodeMessages.production.dubbing.batch }}
                </button>
              </div>
            </div>

            <div v-if="!dubbingShots.length" class="step-empty" style="min-height:260px">
              <div class="empty-visual">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
              </div>
              <div class="empty-title">{{ episodeMessages.production.dubbing.emptyTitle }}</div>
              <div class="empty-desc">{{ episodeMessages.production.dubbing.emptyDescription }}</div>
            </div>

            <div v-else class="dub-grid">
                <div v-for="(sb, i) in dubbingShots" :key="sb.id" class="card dub-card">
                  <div class="dub-head">
                    <div class="dub-copy">
                    <div class="dub-title">
                      <span class="frame-num">#{{ String(sb.storyboard_number || sb.storyboardNumber || i + 1).padStart(2, '0') }}</span>
                      <span class="frame-badge">{{ hasDialogue(sb) ? getDialogueSpeaker(sb) : episodeMessages.production.dubbing.noDialogueBadge }}</span>
                    </div>
                    <div class="dub-desc">{{ hasDialogue(sb) ? (getDialogueText(sb) || episodeCommon.noTextYet) : episodeMessages.production.dubbing.noDialogueDescription }}</div>
                    </div>
                    <span class="tag" :class="hasDialogue(sb) && hasTTS(sb) ? 'tag-success' : ''">{{ !hasDialogue(sb) ? episodeMessages.production.dubbing.notRequired : (hasTTS(sb) ? episodeCommon.generated : episodeCommon.pending) }}</span>
                  </div>
                <div class="dub-meta">
                  <span class="dim">{{ sb.shot_type || sb.shotType || episodeCommon.unsetShotType }}</span>
                  <span class="dim">{{ formatStoryboardDuration(sb) }}</span>
                  <span class="dim">{{ sb.location || episodeCommon.unsetLocation }}</span>
                </div>
                <div class="dub-foot">
                  <audio
                    v-if="hasDialogue(sb) && hasTTS(sb)"
                    :key="getStoryboardMediaKey('tts', sb, getTTSUrl(sb))"
                    :src="buildMediaSrc(getTTSUrl(sb), getStoryboardMediaVersion(sb, getTTSUrl(sb)))"
                    controls
                    preload="none"
                    class="dub-audio"
                  />
                  <div v-else class="dim" style="font-size:12px">{{ hasDialogue(sb) ? episodeCommon.noAudioYet : episodeMessages.production.dubbing.noDialogueFooter }}</div>
                  <div v-if="hasDialogue(sb)" class="asset-foot-actions ml-auto">
                    <button class="btn btn-sm" @click="copyShotVoicePrompt(sb)">{{ episodeCommon.copyPrompt }}</button>
                    <button class="btn btn-sm" @click="attachShotAudio(sb)">
                      {{ hasTTS(sb) ? episodeMessages.production.dubbing.replace : episodeMessages.production.dubbing.add }}
                    </button>
                    <button class="btn btn-sm" @click="genShotTTS(sb)">{{ episodeMessages.production.dubbing.generate }}</button>
                  </div>
                  <span v-else class="dim ml-auto" style="font-size:12px">{{ episodeMessages.production.dubbing.notRequired }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Sub: Audio -->
          <div v-else-if="prodTab === 'audio'" class="prod-content">
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">{{ t('episode.production.audio.summary', { ready: audioCueReadyCount, total: audioCueTotal }) }}</span>
              <span class="tag">{{ episodeMessages.production.audio.manualFirst }}</span>
            </div>

            <div class="audio-board">
              <section class="card audio-group">
                <div class="audio-group-head">
                  <div>
                    <div class="audio-group-title">{{ episodeMessages.production.audio.sections.episodeTitle }}</div>
                    <div class="audio-group-sub">{{ episodeMessages.production.audio.sections.episodeDescription }}</div>
                  </div>
                  <div class="audio-group-actions">
                    <button
                      class="btn btn-sm"
                      :disabled="hasAudioCueLayer(episodeAudioCues, 'score')"
                      @click="createAudioCue('episode', epId, 'score', getEpisodeAudioFallbackPrompt('score'), episodeAudioCues)"
                    >
                      {{ getAudioCueCreateLabel('episode', episodeAudioCues, 'score') }}
                    </button>
                    <button
                      class="btn btn-sm"
                      :disabled="hasAudioCueLayer(episodeAudioCues, 'ambience')"
                      @click="createAudioCue('episode', epId, 'ambience', getEpisodeAudioFallbackPrompt('ambience'), episodeAudioCues)"
                    >
                      {{ getAudioCueCreateLabel('episode', episodeAudioCues, 'ambience') }}
                    </button>
                  </div>
                </div>
                <div v-if="!episodeAudioCues.length" class="audio-empty">{{ episodeMessages.production.audio.emptyEpisode }}</div>
                <div v-else class="audio-cue-list">
                  <div v-for="cue in episodeAudioCues" :key="`episode-cue-${cue.id}`" class="audio-cue-card">
                    <div class="audio-cue-head">
                      <div>
                        <div class="audio-cue-title">{{ cueLayerLabel(getCueLayerType(cue)) }}</div>
                        <div class="audio-cue-sub">{{ cueScopeLabel(cue.scope_type || cue.scopeType) }}</div>
                      </div>
                      <span class="tag" :class="cueHasAsset(cue) ? 'tag-success' : ''">{{ cueHasAsset(cue) ? episodeCommon.generated : episodeCommon.pending }}</span>
                    </div>
                    <audio v-if="cueHasAsset(cue)" :src="getCuePreviewUrl(cue)" controls preload="metadata" class="audio-cue-player" />
                    <div v-else class="dim audio-empty">{{ episodeMessages.production.audio.noAudio }}</div>
                    <label class="field">
                      <span class="field-head">
                        <span class="field-label">{{ episodeMessages.production.audio.fields.prompt }}</span>
                        <button type="button" class="btn btn-xs btn-ghost field-copy-btn" @click="copyAudioCuePrompt(cue, getCuePromptForEpisode(cue))">
                          {{ episodeMessages.production.audio.copyPrompt }}
                        </button>
                      </span>
                      <textarea
                        :value="cue.prompt || ''"
                        class="textarea"
                        rows="3"
                        :placeholder="getCuePromptForEpisode(cue) || episodeMessages.production.audio.fields.promptPlaceholder"
                        @blur="saveAudioCueTextInput(cue, 'prompt', $event)"
                      />
                    </label>
                    <div class="field-grid field-grid-4">
                      <label class="field">
                        <span class="field-label">{{ episodeMessages.production.audio.fields.startMs }}</span>
                        <input
                          :value="cue.start_ms ?? cue.startMs ?? 0"
                          class="input"
                          type="number"
                          min="0"
                          step="100"
                          @blur="saveAudioCueNumberInput(cue, 'start_ms', $event)"
                        />
                      </label>
                      <label class="field">
                        <span class="field-label">{{ episodeMessages.production.audio.fields.targetDurationMs }}</span>
                        <input
                          :value="cue.target_duration_ms ?? cue.targetDurationMs ?? 0"
                          class="input"
                          type="number"
                          min="0"
                          step="100"
                          @blur="saveAudioCueNumberInput(cue, 'target_duration_ms', $event, { nullable: true })"
                        />
                      </label>
                      <label class="field">
                        <span class="field-label">{{ episodeMessages.production.audio.fields.volumeDb }}</span>
                        <input
                          :value="cue.volume_db ?? cue.volumeDb ?? 0"
                          class="input"
                          type="number"
                          step="1"
                          @blur="saveAudioCueNumberInput(cue, 'volume_db', $event)"
                        />
                      </label>
                      <label class="field">
                        <span class="field-label">{{ episodeMessages.production.audio.fields.sortOrder }}</span>
                        <input
                          :value="cue.sort_order ?? cue.sortOrder ?? 0"
                          class="input"
                          type="number"
                          min="0"
                          step="1"
                          @blur="saveAudioCueNumberInput(cue, 'sort_order', $event)"
                        />
                      </label>
                    </div>
                    <div class="field-grid field-grid-4">
                      <label class="field">
                        <span class="field-label">{{ episodeMessages.production.audio.fields.fadeInMs }}</span>
                        <input
                          :value="cue.fade_in_ms ?? cue.fadeInMs ?? 0"
                          class="input"
                          type="number"
                          min="0"
                          step="100"
                          @blur="saveAudioCueNumberInput(cue, 'fade_in_ms', $event)"
                        />
                      </label>
                      <label class="field">
                        <span class="field-label">{{ episodeMessages.production.audio.fields.fadeOutMs }}</span>
                        <input
                          :value="cue.fade_out_ms ?? cue.fadeOutMs ?? 0"
                          class="input"
                          type="number"
                          min="0"
                          step="100"
                          @blur="saveAudioCueNumberInput(cue, 'fade_out_ms', $event)"
                        />
                      </label>
                      <label class="field field-toggle">
                        <span class="field-label">{{ episodeMessages.production.audio.fields.loop }}</span>
                        <span class="audio-toggle">
                          <input
                            :checked="!!cue.loop"
                            type="checkbox"
                            @change="saveAudioCueBooleanInput(cue, 'loop', $event)"
                          />
                          <span class="audio-toggle-slider" />
                        </span>
                      </label>
                      <label class="field field-toggle">
                        <span class="field-label">{{ episodeMessages.production.audio.fields.duckDialogue }}</span>
                        <span class="audio-toggle">
                          <input
                            :checked="!!(cue.duck_dialogue ?? cue.duckDialogue)"
                            type="checkbox"
                            @change="saveAudioCueBooleanInput(cue, 'duck_dialogue', $event)"
                          />
                          <span class="audio-toggle-slider" />
                        </span>
                      </label>
                    </div>
                    <div class="asset-foot-actions">
                      <button
                        v-if="hasSuggestedAudioCuePrompt(cue, getEpisodeAudioFallbackPrompt(getCueLayerType(cue)))"
                        class="btn btn-sm"
                        @click="applySuggestedAudioCuePrompt(cue, getEpisodeAudioFallbackPrompt(getCueLayerType(cue)))"
                      >
                        {{ episodeMessages.production.audio.useSuggestedPrompt }}
                      </button>
                      <button class="btn btn-sm" @click="attachAudioCueAsset(cue)">{{ cueHasAsset(cue) ? episodeMessages.production.audio.replace : episodeMessages.production.audio.add }}</button>
                      <button v-if="cueHasAsset(cue)" class="btn btn-sm" @click="clearAudioCueAsset(cue)">{{ episodeMessages.production.audio.removeAudio }}</button>
                      <button type="button" class="btn btn-sm btn-ghost btn-icon audio-remove-btn" :title="episodeMessages.production.audio.removeCue" @click="requestDeleteAudioCue(cue)">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/>
                          <path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/>
                          <line x1="10" y1="11" x2="10" y2="17"/>
                          <line x1="14" y1="11" x2="14" y2="17"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              <section class="card audio-group">
                <div class="audio-group-head">
                  <div>
                    <div class="audio-group-title">{{ episodeMessages.production.audio.sections.scenesTitle }}</div>
                    <div class="audio-group-sub">{{ episodeMessages.production.audio.sections.scenesDescription }}</div>
                  </div>
                </div>
                <div v-if="!scenes.length" class="audio-empty">{{ episodeMessages.production.audio.emptyScenes }}</div>
                <div v-else class="audio-scope-list">
                  <div v-for="scene in scenes" :key="`scene-audio-${scene.id}`" class="audio-scope-card">
                    <div class="audio-scope-head">
                      <div>
                        <div class="audio-scope-title">{{ formatSceneLabel(scene.location, scene.time) }}</div>
                        <div class="audio-scope-sub">{{ getAudioScopeSummary(getAudioCues(scene).length) }}</div>
                      </div>
                      <div class="audio-group-actions">
                        <button
                          class="btn btn-sm"
                          :disabled="hasAudioCueLayer(getAudioCues(scene), 'score')"
                          @click="createAudioCue('scene', scene.id, 'score', getSceneAudioFallbackPrompt(scene, 'score'), getAudioCues(scene))"
                        >
                          {{ getAudioCueCreateLabel('scene', getAudioCues(scene), 'score') }}
                        </button>
                        <button
                          class="btn btn-sm"
                          :disabled="hasAudioCueLayer(getAudioCues(scene), 'ambience')"
                          @click="createAudioCue('scene', scene.id, 'ambience', getSceneAudioFallbackPrompt(scene, 'ambience'), getAudioCues(scene))"
                        >
                          {{ getAudioCueCreateLabel('scene', getAudioCues(scene), 'ambience') }}
                        </button>
                      </div>
                    </div>
                    <div v-if="!getAudioCues(scene).length" class="audio-empty">{{ episodeMessages.production.audio.emptyScene }}</div>
                    <div v-else class="audio-cue-list">
                      <div v-for="cue in getAudioCues(scene)" :key="`scene-cue-${cue.id}`" class="audio-cue-card compact">
                        <div class="audio-cue-head">
                          <div>
                            <div class="audio-cue-title">{{ cueLayerLabel(getCueLayerType(cue)) }}</div>
                            <div class="audio-cue-sub">{{ formatSceneLabel(scene.location, scene.time) }}</div>
                          </div>
                          <span class="tag" :class="cueHasAsset(cue) ? 'tag-success' : ''">{{ cueHasAsset(cue) ? episodeCommon.generated : episodeCommon.pending }}</span>
                        </div>
                        <audio v-if="cueHasAsset(cue)" :src="getCuePreviewUrl(cue)" controls preload="metadata" class="audio-cue-player" />
                        <div v-else class="dim audio-empty">{{ episodeMessages.production.audio.noAudio }}</div>
                        <label class="field">
                          <span class="field-head">
                            <span class="field-label">{{ episodeMessages.production.audio.fields.prompt }}</span>
                            <button type="button" class="btn btn-xs btn-ghost field-copy-btn" @click="copyAudioCuePrompt(cue, getCuePromptForScene(cue))">
                              {{ episodeMessages.production.audio.copyPrompt }}
                            </button>
                          </span>
                          <textarea
                            :value="cue.prompt || ''"
                            class="textarea"
                            rows="2"
                            :placeholder="getCuePromptForScene(cue) || episodeMessages.production.audio.fields.promptPlaceholder"
                            @blur="saveAudioCueTextInput(cue, 'prompt', $event)"
                          />
                        </label>
                        <div class="field-grid field-grid-4">
                          <label class="field">
                            <span class="field-label">{{ episodeMessages.production.audio.fields.startMs }}</span>
                            <input :value="cue.start_ms ?? cue.startMs ?? 0" class="input" type="number" min="0" step="100" @blur="saveAudioCueNumberInput(cue, 'start_ms', $event)" />
                          </label>
                          <label class="field">
                            <span class="field-label">{{ episodeMessages.production.audio.fields.targetDurationMs }}</span>
                            <input :value="cue.target_duration_ms ?? cue.targetDurationMs ?? 0" class="input" type="number" min="0" step="100" @blur="saveAudioCueNumberInput(cue, 'target_duration_ms', $event, { nullable: true })" />
                          </label>
                          <label class="field">
                            <span class="field-label">{{ episodeMessages.production.audio.fields.volumeDb }}</span>
                            <input :value="cue.volume_db ?? cue.volumeDb ?? 0" class="input" type="number" step="1" @blur="saveAudioCueNumberInput(cue, 'volume_db', $event)" />
                          </label>
                          <label class="field">
                            <span class="field-label">{{ episodeMessages.production.audio.fields.sortOrder }}</span>
                            <input :value="cue.sort_order ?? cue.sortOrder ?? 0" class="input" type="number" min="0" step="1" @blur="saveAudioCueNumberInput(cue, 'sort_order', $event)" />
                          </label>
                        </div>
                        <div class="field-grid field-grid-4">
                          <label class="field">
                            <span class="field-label">{{ episodeMessages.production.audio.fields.fadeInMs }}</span>
                            <input :value="cue.fade_in_ms ?? cue.fadeInMs ?? 0" class="input" type="number" min="0" step="100" @blur="saveAudioCueNumberInput(cue, 'fade_in_ms', $event)" />
                          </label>
                          <label class="field">
                            <span class="field-label">{{ episodeMessages.production.audio.fields.fadeOutMs }}</span>
                            <input :value="cue.fade_out_ms ?? cue.fadeOutMs ?? 0" class="input" type="number" min="0" step="100" @blur="saveAudioCueNumberInput(cue, 'fade_out_ms', $event)" />
                          </label>
                          <label class="field field-toggle">
                            <span class="field-label">{{ episodeMessages.production.audio.fields.loop }}</span>
                            <span class="audio-toggle">
                              <input :checked="!!cue.loop" type="checkbox" @change="saveAudioCueBooleanInput(cue, 'loop', $event)" />
                              <span class="audio-toggle-slider" />
                            </span>
                          </label>
                          <label class="field field-toggle">
                            <span class="field-label">{{ episodeMessages.production.audio.fields.duckDialogue }}</span>
                            <span class="audio-toggle">
                              <input :checked="!!(cue.duck_dialogue ?? cue.duckDialogue)" type="checkbox" @change="saveAudioCueBooleanInput(cue, 'duck_dialogue', $event)" />
                              <span class="audio-toggle-slider" />
                            </span>
                          </label>
                        </div>
                        <div class="asset-foot-actions">
                          <button
                            v-if="hasSuggestedAudioCuePrompt(cue, getSceneAudioFallbackPrompt(scene, getCueLayerType(cue)))"
                            class="btn btn-sm"
                            @click="applySuggestedAudioCuePrompt(cue, getSceneAudioFallbackPrompt(scene, getCueLayerType(cue)))"
                          >
                            {{ episodeMessages.production.audio.useSuggestedPrompt }}
                          </button>
                          <button class="btn btn-sm" @click="attachAudioCueAsset(cue)">{{ cueHasAsset(cue) ? episodeMessages.production.audio.replace : episodeMessages.production.audio.add }}</button>
                          <button v-if="cueHasAsset(cue)" class="btn btn-sm" @click="clearAudioCueAsset(cue)">{{ episodeMessages.production.audio.removeAudio }}</button>
                          <button type="button" class="btn btn-sm btn-ghost btn-icon audio-remove-btn" :title="episodeMessages.production.audio.removeCue" @click="requestDeleteAudioCue(cue)">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/>
                              <path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/>
                              <line x1="10" y1="11" x2="10" y2="17"/>
                              <line x1="14" y1="11" x2="14" y2="17"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section class="card audio-group">
                <div class="audio-group-head">
                  <div>
                    <div class="audio-group-title">{{ episodeMessages.production.audio.sections.storyboardsTitle }}</div>
                    <div class="audio-group-sub">{{ episodeMessages.production.audio.sections.storyboardsDescription }}</div>
                  </div>
                </div>
                <div v-if="!sbs.length" class="audio-empty">{{ episodeMessages.production.audio.emptyStoryboards }}</div>
                <div v-else class="audio-scope-list">
                  <div v-for="(sb, i) in sbs" :key="`storyboard-audio-${sb.id}`" class="audio-scope-card">
                    <div class="audio-scope-head">
                      <div>
                        <div class="audio-scope-title">#{{ String(i + 1).padStart(2, '0') }} · {{ sb.title || sb.description || episodeCommon.blank }}</div>
                        <div class="audio-scope-sub">{{ getAudioScopeSummary(getAudioCues(sb).length) }}</div>
                      </div>
                      <div class="audio-group-actions">
                        <button class="btn btn-sm" @click="createAudioCue('storyboard', sb.id, 'sfx', getStoryboardAudioCueFallback(sb, 'sfx'), getAudioCues(sb))">
                          {{ episodeMessages.production.audio.addSfx }}
                        </button>
                        <button class="btn btn-sm" @click="createAudioCue('storyboard', sb.id, 'ambience', getStoryboardAudioCueFallback(sb, 'ambience'), getAudioCues(sb))">
                          {{ episodeMessages.production.audio.addAmbience }}
                        </button>
                      </div>
                    </div>
                    <div v-if="!getAudioCues(sb).length" class="audio-empty">{{ episodeMessages.production.audio.emptyStoryboard }}</div>
                    <div v-else class="audio-cue-list">
                      <div v-for="cue in getAudioCues(sb)" :key="`storyboard-cue-${cue.id}`" class="audio-cue-card compact">
                        <div class="audio-cue-head">
                          <div>
                            <div class="audio-cue-title">{{ cueLayerLabel(getCueLayerType(cue)) }}</div>
                            <div class="audio-cue-sub">#{{ String(i + 1).padStart(2, '0') }} · {{ formatStoryboardDuration(sb) }}</div>
                          </div>
                          <span class="tag" :class="cueHasAsset(cue) ? 'tag-success' : ''">{{ cueHasAsset(cue) ? episodeCommon.generated : episodeCommon.pending }}</span>
                        </div>
                        <audio v-if="cueHasAsset(cue)" :src="getCuePreviewUrl(cue)" controls preload="metadata" class="audio-cue-player" />
                        <div v-else class="dim audio-empty">{{ episodeMessages.production.audio.noAudio }}</div>
                        <label class="field">
                          <span class="field-head">
                            <span class="field-label">{{ episodeMessages.production.audio.fields.prompt }}</span>
                            <button type="button" class="btn btn-xs btn-ghost field-copy-btn" @click="copyAudioCuePrompt(cue, getCuePromptForStoryboard(cue, sb))">
                              {{ episodeMessages.production.audio.copyPrompt }}
                            </button>
                          </span>
                          <textarea
                            :value="cue.prompt || ''"
                            class="textarea"
                            rows="2"
                            :placeholder="getStoryboardAudioCueFallback(sb, getCueLayerType(cue)) || episodeMessages.production.audio.fields.promptPlaceholder"
                            @blur="saveAudioCueTextInput(cue, 'prompt', $event)"
                          />
                        </label>
                        <div class="field-grid field-grid-4">
                          <label class="field">
                            <span class="field-label">{{ episodeMessages.production.audio.fields.startMs }}</span>
                            <input :value="cue.start_ms ?? cue.startMs ?? 0" class="input" type="number" min="0" step="100" @blur="saveAudioCueNumberInput(cue, 'start_ms', $event)" />
                          </label>
                          <label class="field">
                            <span class="field-label">{{ episodeMessages.production.audio.fields.targetDurationMs }}</span>
                            <input :value="cue.target_duration_ms ?? cue.targetDurationMs ?? 0" class="input" type="number" min="0" step="100" @blur="saveAudioCueNumberInput(cue, 'target_duration_ms', $event, { nullable: true })" />
                          </label>
                          <label class="field">
                            <span class="field-label">{{ episodeMessages.production.audio.fields.volumeDb }}</span>
                            <input :value="cue.volume_db ?? cue.volumeDb ?? 0" class="input" type="number" step="1" @blur="saveAudioCueNumberInput(cue, 'volume_db', $event)" />
                          </label>
                          <label class="field">
                            <span class="field-label">{{ episodeMessages.production.audio.fields.sortOrder }}</span>
                            <input :value="cue.sort_order ?? cue.sortOrder ?? 0" class="input" type="number" min="0" step="1" @blur="saveAudioCueNumberInput(cue, 'sort_order', $event)" />
                          </label>
                        </div>
                        <div class="field-grid field-grid-4">
                          <label class="field">
                            <span class="field-label">{{ episodeMessages.production.audio.fields.fadeInMs }}</span>
                            <input :value="cue.fade_in_ms ?? cue.fadeInMs ?? 0" class="input" type="number" min="0" step="100" @blur="saveAudioCueNumberInput(cue, 'fade_in_ms', $event)" />
                          </label>
                          <label class="field">
                            <span class="field-label">{{ episodeMessages.production.audio.fields.fadeOutMs }}</span>
                            <input :value="cue.fade_out_ms ?? cue.fadeOutMs ?? 0" class="input" type="number" min="0" step="100" @blur="saveAudioCueNumberInput(cue, 'fade_out_ms', $event)" />
                          </label>
                          <label class="field field-toggle">
                            <span class="field-label">{{ episodeMessages.production.audio.fields.loop }}</span>
                            <span class="audio-toggle">
                              <input :checked="!!cue.loop" type="checkbox" @change="saveAudioCueBooleanInput(cue, 'loop', $event)" />
                              <span class="audio-toggle-slider" />
                            </span>
                          </label>
                          <label class="field field-toggle">
                            <span class="field-label">{{ episodeMessages.production.audio.fields.duckDialogue }}</span>
                            <span class="audio-toggle">
                              <input :checked="!!(cue.duck_dialogue ?? cue.duckDialogue)" type="checkbox" @change="saveAudioCueBooleanInput(cue, 'duck_dialogue', $event)" />
                              <span class="audio-toggle-slider" />
                            </span>
                          </label>
                        </div>
                        <div class="asset-foot-actions">
                          <button
                            v-if="hasSuggestedAudioCuePrompt(cue, getStoryboardAudioCueFallback(sb, getCueLayerType(cue)))"
                            class="btn btn-sm"
                            @click="applySuggestedAudioCuePrompt(cue, getStoryboardAudioCueFallback(sb, getCueLayerType(cue)))"
                          >
                            {{ episodeMessages.production.audio.useSuggestedPrompt }}
                          </button>
                          <button class="btn btn-sm" @click="attachAudioCueAsset(cue)">{{ cueHasAsset(cue) ? episodeMessages.production.audio.replace : episodeMessages.production.audio.add }}</button>
                          <button v-if="cueHasAsset(cue)" class="btn btn-sm" @click="clearAudioCueAsset(cue)">{{ episodeMessages.production.audio.removeAudio }}</button>
                          <button type="button" class="btn btn-sm btn-ghost btn-icon audio-remove-btn" :title="episodeMessages.production.audio.removeCue" @click="requestDeleteAudioCue(cue)">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/>
                              <path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/>
                              <line x1="10" y1="11" x2="10" y2="17"/>
                              <line x1="14" y1="11" x2="14" y2="17"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>

          <!-- Sub: Shots -->
          <div v-else-if="prodTab === 'shots'" class="prod-content">
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">{{ t('episode.production.shots.summary', { count: sbs.length }) }}</span>
              <span class="tag mono">{{ t('episode.production.shots.generatedSummary', { done: shotImgCount, total: sbs.length }) }}</span>
              <span class="tag">{{ lockedImageConfigLabel }}</span>
              <div class="ml-auto flex gap-1">
                <BaseSelect v-model="frameMode" :options="frameModeOptions" :placeholder="episodeMessages.production.shots.frameModePlaceholder" searchable style="min-width:132px;width:max-content" />
                <button v-if="gridImagePath" class="btn btn-sm" @click="reopenGridPreview">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>
                  {{ episodeMessages.production.shots.viewGrid }}
                </button>
                <button class="btn btn-primary btn-sm" @click="openGridTool">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  {{ episodeMessages.production.shots.gridTool }}
                </button>
              </div>
            </div>

            <div v-if="gridHistory.length" class="grid-history-panel">
              <div v-if="gridImagePath" class="latest-grid-strip">
                <button class="latest-grid-strip-thumb" @click="openImageViewer('/' + gridImagePath, episodeMessages.production.shots.currentGrid)">
                  <img :src="'/' + gridImagePath" class="previewable-image" />
                </button>
                <div class="latest-grid-strip-copy">
                  <div class="latest-grid-strip-head">
                    <span class="tag mono">{{ gridActualLayout.rows }}x{{ gridActualLayout.cols }}</span>
                    <span class="tag" v-if="gridRecoveredMode">{{ gridRecoveredMode }}</span>
                  </div>
                  <div class="latest-grid-strip-title">{{ episodeMessages.production.shots.currentGrid }}</div>
                  <div class="latest-grid-strip-meta">
                    <span v-if="gridRecoveredAt">{{ gridRecoveredAt }}</span>
                    <span>{{ episodeMessages.production.shots.continueSplit }}</span>
                  </div>
                </div>
                <div class="latest-grid-strip-actions">
                  <button class="btn btn-sm" @click="reopenGridPreview">{{ episodeMessages.production.shots.preview }}</button>
                  <button class="btn btn-primary btn-sm" @click="continueGridSplit">{{ episodeMessages.production.shots.continue }}</button>
                </div>
              </div>
              <div class="grid-history-head">
                <div>
                  <div class="grid-history-title">{{ episodeMessages.production.shots.historyTitle }}</div>
                  <div class="grid-history-subtitle">{{ episodeMessages.production.shots.historySubtitle }}</div>
                </div>
                <button class="btn btn-sm" @click="showAllGridHistory = !showAllGridHistory">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline :points="showAllGridHistory ? '18 15 12 9 6 15' : '6 9 12 15 18 9'"/></svg>
                  {{ getGridHistoryToggleLabel() }}
                </button>
              </div>
              <div v-if="showAllGridHistory" class="grid-history-list">
                <button
                  v-for="item in gridHistory"
                  :key="item.id"
                  :class="['grid-history-item', { active: item.localPath === gridImagePath }]"
                  @click="selectGridHistory(item)"
                >
                  <div class="grid-history-thumb">
                    <img :src="'/' + item.localPath" class="previewable-image" />
                  </div>
                  <div class="grid-history-copy">
                    <div class="grid-history-tags">
                      <span class="tag mono">#{{ item.id }}</span>
                      <span class="tag mono">{{ item.layout.rows }}x{{ item.layout.cols }}</span>
                      <span class="tag">{{ item.modeLabel }}</span>
                    </div>
                    <div class="grid-history-meta">{{ item.createdAtLabel }}</div>
                  </div>
                </button>
              </div>
            </div>

            <div class="frame-scroll">
              <div class="frame-grid">
                <div v-for="(sb, i) in sbs" :key="sb.id"
                  :class="['frame-row', 'card', { active: selectedSb?.id === sb.id }]"
                  @click="selectedSb = sb">
                  <!-- Info: number + type + desc -->
                  <div class="frame-info">
                    <div class="frame-top">
                      <span class="frame-num">#{{ String(i+1).padStart(2,'0') }}</span>
                      <div class="frame-top-badges">
                        <span class="frame-badge">{{ sb.shot_type || sb.shotType || episodeCommon.blank }}</span>
                        <span :class="['frame-review-badge', getReviewStatusClass(sb)]">{{ getReviewStatusLabel(sb) }}</span>
                        <span v-if="getContinuitySourceLabel(sb)" class="frame-continuity-badge">{{ getContinuitySourceLabel(sb) }}</span>
                      </div>
                    </div>
                    <div class="frame-desc">{{ sb.description || sb.title || episodeCommon.blank }}</div>
                    <div class="frame-meta">
                      <span :class="['dot', getFirstFrame(sb) && 'ok', isPendingShotFrame(sb.id, 'first_frame') && 'pending']" />
                      <span class="dim" style="font-size:11px">{{ episodeMessages.production.shots.firstFrame }}</span>
                      <span v-if="frameMode === 'first_last'" style="display:flex;align-items:center;gap:4px">
                        <span :class="['dot', getLastFrame(sb) && 'ok', isPendingShotFrame(sb.id, 'last_frame') && 'pending']" />
                        <span class="dim" style="font-size:11px">{{ episodeMessages.production.shots.lastFrame }}</span>
                      </span>
                    </div>
                    <div class="frame-review-actions">
                      <button class="btn btn-sm frame-thumb-action" :disabled="!canReviewStoryboard(sb)" @click.stop="approveStoryboardReview(sb)">
                        {{ episodeMessages.workbench.approve }}
                      </button>
                      <button class="btn btn-sm frame-thumb-action" :disabled="!canReviewStoryboard(sb)" @click.stop="requestStoryboardChanges(sb)">
                        {{ episodeMessages.workbench.requestChanges }}
                      </button>
                    </div>
                  </div>
                  <!-- Thumbnails -->
                  <div class="frame-thumbs">
                    <div class="frame-thumb-wrap">
                      <div class="frame-thumb" @click.stop="!isPendingShotFrame(sb.id, 'first_frame') && genShotFrame(sb, 'first_frame')">
                        <img
                          v-if="getFirstFrame(sb)"
                          :src="'/' + getFirstFrame(sb)"
                          class="previewable-image"
                          @click.stop="openImageViewer('/' + getFirstFrame(sb), getShotFramePreviewTitle(i + 1, 'first_frame'))"
                        />
                        <div v-else class="frame-thumb-empty">
                          <Loader2 v-if="isPendingShotFrame(sb.id, 'first_frame')" :size="14" class="animate-spin" />
                          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        </div>
                        <span v-if="getFirstFrame(sb)" class="frame-re">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                        </span>
                      </div>
                      <span class="frame-thumb-label">{{ getFrameThumbLabel('first_frame', isPendingShotFrame(sb.id, 'first_frame')) }}</span>
                      <div class="frame-thumb-actions">
                        <button class="btn btn-sm frame-thumb-action" @click.stop="copyShotFramePrompt(sb, 'first_frame')">{{ episodeCommon.copyPrompt }}</button>
                        <button class="btn btn-sm frame-thumb-action" :disabled="isPendingShotFrame(sb.id, 'first_frame')" @click.stop="attachShotFrame(sb, 'first_frame')">
                          {{ getFirstFrame(sb) ? episodeMessages.production.shots.replaceFirstFrame : episodeMessages.production.shots.addFirstFrame }}
                        </button>
                      </div>
                    </div>
                    <div v-if="frameMode === 'first_last'" class="frame-thumb-wrap">
                      <div class="frame-thumb" @click.stop="!isPendingShotFrame(sb.id, 'last_frame') && genShotFrame(sb, 'last_frame')">
                        <img
                          v-if="getLastFrame(sb)"
                          :src="'/' + getLastFrame(sb)"
                          class="previewable-image"
                          @click.stop="openImageViewer('/' + getLastFrame(sb), getShotFramePreviewTitle(i + 1, 'last_frame'))"
                        />
                        <div v-else class="frame-thumb-empty">
                          <Loader2 v-if="isPendingShotFrame(sb.id, 'last_frame')" :size="14" class="animate-spin" />
                          <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        </div>
                        <span v-if="getLastFrame(sb)" class="frame-re">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                        </span>
                      </div>
                      <span class="frame-thumb-label">{{ getFrameThumbLabel('last_frame', isPendingShotFrame(sb.id, 'last_frame')) }}</span>
                      <div class="frame-thumb-actions">
                        <button class="btn btn-sm frame-thumb-action" @click.stop="copyShotFramePrompt(sb, 'last_frame')">{{ episodeCommon.copyPrompt }}</button>
                        <button class="btn btn-sm frame-thumb-action" :disabled="isPendingShotFrame(sb.id, 'last_frame')" @click.stop="attachShotFrame(sb, 'last_frame')">
                          {{ getLastFrame(sb) ? episodeMessages.production.shots.replaceLastFrame : episodeMessages.production.shots.addLastFrame }}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Grid Tool Dialog -->
            <Teleport to="body">
              <div v-if="gridDialog" class="overlay grid-tool-overlay" @click.self="gridDialog = false">
                <div class="card grid-tool">
                <div class="grid-tool-head">
                  <span style="font-size:15px;font-weight:600;font-family:var(--font-display)">{{ episodeMessages.grid.title }}</span>
                  <button class="btn btn-ghost btn-icon ml-auto" @click="gridDialog = false">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>

                <!-- Step 0: Config -->
                <div v-if="gridStep === 0" class="grid-tool-body">
                  <div class="grid-mode-tabs">
                    <button v-for="m in gridModes" :key="m.id"
                      :class="['grid-mode-tab', { active: gridMode === m.id }]"
                      @click="gridMode = m.id; gridSelected = []; gridSingleTarget = null; gridAssignmentsState = []">
                      <span style="font-weight:600">{{ m.label }}</span>
                      <span class="dim" style="font-size:11px">{{ m.desc }}</span>
                    </button>
                  </div>

                  <div class="grid-config">
                    <label class="field" style="flex:0 0 auto" v-if="gridMode !== 'multi_ref'">
                      <span class="field-label">{{ episodeMessages.grid.layout }}</span>
                      <BaseSelect v-model="gridLayout" :options="gridLayoutOptions" :placeholder="episodeMessages.grid.layoutPlaceholder" style="width:90px" />
                    </label>
                    <div class="field" style="flex:1">
                      <span class="field-label">
                        {{ gridMode === 'multi_ref' ? episodeMessages.grid.pickTarget : episodeMessages.grid.pickShots }}
                        <span class="dim" v-if="gridMode !== 'multi_ref'">({{ t('episode.grid.selected', { count: gridSelected.length }) }})</span>
                      </span>
                    </div>
                    <div style="align-self:flex-end" v-if="gridMode !== 'multi_ref'">
                      <button class="btn btn-sm" @click="gridSelectAll">{{ gridSelected.length === sbs.length ? episodeMessages.grid.clearAll : episodeMessages.grid.selectAll }}</button>
                    </div>
                  </div>

                  <div class="grid-pick-list">
                    <label v-for="(sb, i) in sbs" :key="sb.id"
                      :class="['grid-pick-item', { selected: gridMode === 'multi_ref' ? gridSingleTarget === sb.id : gridSelected.includes(sb.id) }]">
                      <input
                        v-if="gridMode === 'multi_ref'"
                        class="grid-pick-input"
                        type="radio"
                        :value="sb.id"
                        v-model="gridSingleTarget"
                        name="grid-target"
                      />
                      <input
                        v-else
                        class="grid-pick-input"
                        type="checkbox"
                        :value="sb.id"
                        v-model="gridSelected"
                      />
                      <span class="grid-pick-control" aria-hidden="true"></span>
                      <span class="mono" style="font-size:11px;width:28px">#{{ String(i+1).padStart(2,'0') }}</span>
                      <span class="truncate" style="flex:1;font-size:12px">{{ sb.description || sb.title || episodeCommon.blank }}</span>
                    </label>
                  </div>

                  <div class="grid-tool-foot">
                    <span v-if="gridCanStart" class="tag mono">{{ t('episode.grid.layoutSummary', { rows: gridAutoLayout.rows, cols: gridAutoLayout.cols, count: gridAutoLayout.rows * gridAutoLayout.cols }) }}</span>
                    <span class="dim" style="font-size:11px">{{ gridPromptLoading ? gridPromptStatus : gridSummary }}</span>
                    <button class="btn btn-primary ml-auto" :disabled="!gridCanStart || gridPromptLoading" @click="generateGridPrompt">
                      <Loader2 v-if="gridPromptLoading" :size="12" class="animate-spin" />
                      <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                      {{ gridPromptLoading ? episodeMessages.grid.generatingPrompt : episodeMessages.grid.generatePrompt }}
                    </button>
                  </div>
                </div>

                <!-- Step 1: Prompt Preview -->
                <div v-else-if="gridStep === 1" class="grid-tool-body">
                  <div class="grid-prompt-summary">
                    <div class="grid-prompt-label">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                      {{ episodeMessages.grid.promptTitle }}
                      <span v-if="gridPromptSource" class="tag ml-8">{{ getGridPromptSourceLabel(gridPromptSource) }}</span>
                    </div>
                    <div class="grid-prompt-text">{{ gridPromptText || episodeMessages.grid.promptWaiting }}</div>
                  </div>

                  <div class="grid-blank-preview" :style="gridBlankStyle">
                    <div v-for="(cell, i) in gridCellPrompts" :key="i" class="grid-blank-cell">
                      <div class="grid-blank-cell-index">#{{ cell.shot_number }} {{ getFrameTypeLabel(cell.frame_type) }}</div>
                      <div class="grid-blank-cell-desc">{{ cell.prompt }}</div>
                    </div>
                    <div v-for="i in Math.max(0, (gridAutoLayout.rows * gridAutoLayout.cols) - gridCellPrompts.length)" :key="'empty-'+i" class="grid-blank-cell empty">
                      <div class="grid-blank-cell-index">{{ episodeMessages.grid.emptyCell }}</div>
                      <div class="grid-blank-cell-desc">{{ episodeCommon.blank }}</div>
                    </div>
                  </div>

                  <div class="grid-tool-foot">
                    <button class="btn" @click="gridStep = 0">{{ episodeMessages.grid.back }}</button>
                    <button class="btn ml-auto" @click="generateGridPrompt" :disabled="gridPromptLoading">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                      {{ episodeMessages.grid.regenerate }}
                    </button>
                    <button class="btn btn-primary" @click="startGridGen">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                      {{ episodeMessages.grid.generateImage }}
                    </button>
                  </div>
                </div>

                <!-- Step 2: Generating -->
                <div v-else-if="gridStep === 2" class="grid-tool-body" style="align-items:center;justify-content:center;min-height:300px">
                  <Loader2 :size="28" class="animate-spin" style="color:var(--accent)" />
                  <div class="loading-text" style="margin-top:12px">{{ episodeMessages.grid.generatingImage }}</div>
                  <div class="dim" style="font-size:11px;margin-top:6px">{{ gridStatusText }}</div>
                </div>

                <!-- Step 3: Preview -->
                <div v-else-if="gridStep === 3" class="grid-tool-body grid-tool-body-preview">
                  <div class="grid-preview-layout">
                    <div class="grid-preview-pane">
                      <div class="grid-preview-wrap">
                        <div class="grid-preview-stage">
                          <img
                            :src="'/' + gridImagePath"
                            class="grid-preview-img previewable-image"
                            @click.stop="openImageViewer('/' + gridImagePath, episodeMessages.grid.previewTitle)"
                          />
                          <div class="grid-overlay" :style="gridOverlayStyle">
                            <button
                              v-for="(a, i) in gridAssignments"
                              :key="i"
                              type="button"
                              :class="['grid-overlay-cell', activeGridCell === i && 'active']"
                              @click="focusGridCell(i)"
                            >
                              <span class="grid-cell-label">{{ gridCellLabel(a) }}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                      <div class="grid-adjust-summary">
                        <span class="tag mono">{{ t('episode.grid.layoutSummary', { rows: gridActualLayout.rows, cols: gridActualLayout.cols, count: gridActualLayout.rows * gridActualLayout.cols }) }}</span>
                        <span class="dim" style="font-size:12px">{{ t('episode.grid.assignedSummary', { assigned: gridAssignedCount, total: gridAssignments.length }) }}</span>
                        <span class="tag" v-if="gridAssignedCount < gridAssignments.length">{{ episodeMessages.grid.ignoreUnassigned }}</span>
                      </div>
                    </div>
                    <div class="grid-assignment-pane">
                      <div class="grid-assign-head">
                        <div class="grid-assign-title">{{ episodeMessages.grid.assignmentTitle }}</div>
                        <div class="grid-assign-subtitle">{{ episodeMessages.grid.assignmentSubtitle }}</div>
                      </div>
                      <div v-if="gridAssignmentTotalPages > 1" class="grid-assign-pagination">
                        <button class="btn btn-sm" :disabled="gridAssignmentPage === 0" @click="gridAssignmentPage--">{{ episodeMessages.grid.previousPage }}</button>
                        <span class="dim">{{ episodeMessages.grid.columns.cell }} {{ gridAssignmentPage + 1 }}/{{ gridAssignmentTotalPages }}</span>
                        <span class="dim">{{ gridAssignmentPageStart + 1 }}-{{ gridAssignmentPageEnd }} / {{ gridAssignments.length }}</span>
                        <button class="btn btn-sm ml-auto" :disabled="gridAssignmentPage >= gridAssignmentTotalPages - 1" @click="gridAssignmentPage++">{{ episodeMessages.grid.nextPage }}</button>
                      </div>
                      <div class="grid-assign-columns">
                        <span>{{ episodeMessages.grid.columns.cell }}</span>
                        <span>{{ episodeMessages.grid.columns.shot }}</span>
                        <span>{{ episodeMessages.grid.columns.type }}</span>
                        <span>{{ episodeMessages.grid.columns.binding }}</span>
                      </div>
                      <div class="grid-assign-info">
                        <div v-for="item in pagedGridAssignments" :key="item.index" :class="['grid-assign-row', activeGridCell === item.index && 'active']">
                          <span class="grid-assign-index">{{ episodeMessages.grid.columns.cell }} {{ item.index + 1 }}</span>
                          <BaseSelect
                            :model-value="item.assignment.storyboard_id"
                            :options="gridAssignmentShotOptions"
                            :placeholder="episodeMessages.grid.selectShot"
                            @update:model-value="updateGridAssignment(item.index, 'storyboard_id', $event)"
                          />
                          <BaseSelect
                            :model-value="item.assignment.frame_type"
                            :options="gridFrameTypeOptions"
                            :placeholder="episodeMessages.grid.selectFrameType"
                            style="width:100%"
                            @update:model-value="updateGridAssignment(item.index, 'frame_type', $event)"
                          />
                          <span class="grid-assign-bind">{{ gridCellTitle(item.assignment.storyboard_id) }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="grid-tool-foot">
                    <button class="btn" @click="gridStep = 1">{{ episodeMessages.grid.back }}</button>
                    <button class="btn btn-primary ml-auto" @click="doGridSplit">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                      {{ episodeMessages.grid.splitAssign }}
                    </button>
                  </div>
                </div>

                <!-- Step 4: Done -->
                <div v-else-if="gridStep === 4" class="grid-tool-body" style="align-items:center;justify-content:center;min-height:200px">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  <div style="font-size:17px;font-weight:600;font-family:var(--font-display);margin-top:8px">{{ episodeMessages.grid.doneTitle }}</div>
                  <div class="dim" style="font-size:13px;margin-top:4px">{{ t('episode.grid.doneSummary', { count: gridAssignedCount }) }}</div>
                  <button class="btn btn-primary" style="margin-top:16px" @click="gridDialog = false; refresh()">{{ episodeMessages.grid.close }}</button>
                </div>
              </div>
            </div>
            </Teleport>
          </div>

          <!-- Sub: Videos -->
          <div v-else-if="prodTab === 'videos'" class="prod-content">
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">{{ t('episode.production.videos.summary', { count: sbs.length }) }}</span>
              <span class="tag mono">{{ t('episode.production.videos.generatedSummary', { done: shotVidCount, total: sbs.length }) }}</span>
              <div class="ml-auto flex gap-1">
                <button class="btn btn-sm" @click="batchVideos">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                  {{ episodeMessages.production.videos.batch }}
                </button>
              </div>
            </div>
            <div class="prod-grid">
              <div v-for="(sb, i) in sbs" :key="sb.id" class="card prod-card">
                <div class="prod-cover">
                  <video
                    v-if="hasVid(sb)"
                    :key="getStoryboardMediaKey('video', sb, getVideoUrl(sb))"
                    :src="buildMediaSrc(getVideoUrl(sb), getStoryboardMediaVersion(sb, getVideoUrl(sb)))"
                    class="prod-video"
                    controls
                    preload="metadata"
                    playsinline
                  />
                  <img
                    v-else-if="hasImg(sb)"
                    :src="'/' + getStoryboardCover(sb)"
                    class="previewable-image"
                    @click.stop="openImageViewer('/' + getStoryboardCover(sb), getShotReferencePreviewTitle(i + 1))"
                  />
                  <div v-else class="prod-cover-empty">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                  </div>
                  <span class="prod-idx">#{{ String(i+1).padStart(2,'0') }}</span>
                  <span v-if="hasComposed(sb)" class="prod-overlay-badge">{{ episodeMessages.production.videos.composed }}</span>
                </div>
                <div class="prod-info media-card-body">
                  <div class="prod-desc media-card-title truncate">{{ sb.description || sb.title || episodeCommon.blank }}</div>
                  <div class="prod-meta-line media-card-submeta">{{ sb.shot_type || sb.shotType || episodeCommon.unsetShotType }} · {{ formatStoryboardDuration(sb) }}</div>
                  <div class="prod-dots media-card-status">
                    <span :class="['dot', hasImg(sb) && 'ok']" /><span style="font-size:10px">{{ episodeMessages.production.videos.statusImage }}</span>
                    <span :class="['dot', hasVid(sb) && 'ok', isPendingVideo(sb.id) && 'pending']" /><span style="font-size:10px">{{ isPendingVideo(sb.id) ? episodeMessages.production.videos.generating : episodeMessages.production.videos.statusVideo }}</span>
                  </div>
                  <div v-if="videoFailMessage(sb.id)" class="prod-error">{{ videoFailMessage(sb.id) }}</div>
                </div>
                <div class="media-card-actions prod-actions">
                  <div class="media-card-actions-row">
                    <button class="btn btn-sm" @click="copyShotVideoPrompt(sb)">{{ episodeCommon.copyPrompt }}</button>
                    <button class="btn btn-sm" :disabled="isPendingVideo(sb.id)" @click="attachShotVideo(sb)">
                      {{ hasVid(sb) ? episodeMessages.production.videos.replace : episodeMessages.production.videos.add }}
                    </button>
                  </div>
                  <button class="btn btn-sm media-card-action-main" :disabled="isPendingVideo(sb.id)" @click="genVid(sb)">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                    {{ isPendingVideo(sb.id) ? episodeMessages.production.videos.generating : episodeMessages.production.videos.action }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Sub: Compose -->
          <div v-else-if="prodTab === 'compose'" class="prod-content">
            <EpisodeValidationBanner
              v-if="showComposeValidationBanner"
              :stage="'compose'"
              :issues="workbenchComposeValidation.issues"
              :blocked="workbenchComposeValidation.blocked"
            />
            <div class="prod-section-bar compose-section-bar">
              <div class="prod-inline-config">
                <div class="prod-inline-config-copy">
                  <span class="field-label">{{ episodeMessages.production.compose.motionPresetLabel }}</span>
                  <span class="dim prod-inline-help">{{ episodeMessages.production.compose.motionPresetHelp }}</span>
                </div>
                <BaseSelect
                  v-model="episodeMotionPresetValue"
                  :options="motionPresetOptions"
                  :placeholder="episodeMessages.production.compose.motionPresetPlaceholder"
                  style="width:190px"
                />
              </div>
              <div class="compose-section-actions">
                <button class="btn btn-sm" @click="batchCompose">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  {{ episodeMessages.production.compose.batch }}
                </button>
                <span class="compose-progress-value mono">{{ t('episode.production.compose.generatedSummary', { done: composedCount, total: sbs.length }) }}</span>
              </div>
            </div>
            <div class="prod-grid">
              <div v-for="(sb, i) in sbs" :key="sb.id" class="card prod-card">
                <div class="prod-cover">
                  <video
                    v-if="hasComposed(sb)"
                    :key="getStoryboardMediaKey('composed', sb, getComposedVideoUrl(sb))"
                    :src="buildMediaSrc(getComposedVideoUrl(sb), getStoryboardMediaVersion(sb, getComposedVideoUrl(sb)))"
                    class="prod-video"
                    controls
                    preload="metadata"
                    playsinline
                  />
                  <video
                    v-else-if="hasVid(sb)"
                    :key="getStoryboardMediaKey('source-video', sb, getVideoUrl(sb))"
                    :src="buildMediaSrc(getVideoUrl(sb), getStoryboardMediaVersion(sb, getVideoUrl(sb)))"
                    class="prod-video"
                    controls
                    preload="metadata"
                    playsinline
                  />
                  <img
                    v-else-if="hasImg(sb)"
                    :src="'/' + getStoryboardCover(sb)"
                    class="previewable-image"
                    @click.stop="openImageViewer('/' + getStoryboardCover(sb), getShotReferencePreviewTitle(i + 1))"
                  />
                  <div v-else class="prod-cover-empty">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  </div>
                  <span class="prod-idx">#{{ String(i+1).padStart(2,'0') }}</span>
                  <span v-if="hasComposed(sb)" class="prod-overlay-badge">{{ episodeMessages.production.compose.composed }}</span>
                </div>
                <div class="prod-info media-card-body">
                  <div class="prod-desc media-card-title truncate">{{ sb.description || sb.title || episodeCommon.blank }}</div>
                  <div class="prod-meta-line media-card-submeta">
                    {{ sb.shot_type || sb.shotType || episodeCommon.unsetShotType }} · {{ formatStoryboardDuration(sb) }}
                    <template v-if="!storyboardUsesVideoSource(sb)"> · {{ getMotionPresetLabel(getEffectiveMotionPreset(sb)) }}</template>
                  </div>
                  <div class="prod-dots media-card-status">
                    <span :class="['dot', hasComposeSource(sb) && 'ok']" /><span style="font-size:10px">{{ episodeMessages.production.compose.statusVideo }}</span>
                    <span :class="['dot', hasTTS(sb) && 'ok']" /><span style="font-size:10px">{{ episodeMessages.production.compose.statusDubbing }}</span>
                    <span :class="['dot', hasComposed(sb) && 'ok', isPendingCompose(sb.id) && 'pending']" /><span style="font-size:10px">{{ isPendingCompose(sb.id) ? episodeMessages.production.compose.generating : episodeMessages.production.compose.statusCompose }}</span>
                  </div>
                  <div v-if="storyboardUsesVideoSource(sb)" class="dim" style="font-size:11px">{{ episodeMessages.storyboardDetail.motionVideoNote }}</div>
                  <div v-if="composeFailMessage(sb.id)" class="prod-error">{{ composeFailMessage(sb.id) }}</div>
                </div>
                <div class="media-card-actions prod-actions">
                  <button class="btn btn-sm media-card-action-main" :disabled="!hasComposeSource(sb) || (hasDialogue(sb) && !hasTTS(sb)) || isPendingCompose(sb.id)" @click="doCompose(sb)">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                    {{ isPendingCompose(sb.id) ? episodeMessages.production.compose.generating : (hasComposed(sb) ? episodeMessages.production.compose.actionRedo : episodeMessages.production.compose.actionStart) }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Production Navigator -->
        </template>
      </div>

      <!-- ===== EXPORT PANEL ===== -->
      <div v-else ref="contentPanelRef" class="content-panel">
        <div v-if="!sbs.length" class="step-empty" style="flex:1">
          <div class="empty-visual">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </div>
          <div class="empty-title">{{ episodeMessages.export.notReadyTitle }}</div>
          <div class="empty-desc">{{ episodeMessages.export.notReadyDescription }}</div>
          <button class="btn btn-primary" @click="panel = 'script'">{{ episodeMessages.export.backToScript }}</button>
        </div>
        <div v-else class="export-split">
          <EpisodeValidationBanner
            v-if="showMergeValidationBanner"
            :stage="'merge'"
            :issues="workbenchMergeValidation.issues"
            :blocked="workbenchMergeValidation.blocked"
          />
          <div class="export-main">
            <div class="export-shell card">
              <div class="export-settings">
                <div class="export-config card">
                  <div class="export-config-copy">
                    <span class="field-label">{{ episodeMessages.export.transitionLabel }}</span>
                    <span class="dim export-transition-help">{{ episodeMessages.export.transitionHelp }}</span>
                  </div>
                  <BaseSelect
                    v-model="mergeTransition"
                    :options="mergeTransitionOptions"
                    :placeholder="episodeMessages.export.transitionPlaceholder"
                    style="width:220px"
                  />
                </div>
                <div class="export-config card">
                  <div class="export-config-copy">
                    <span class="field-label">{{ episodeMessages.export.motionPresetLabel }}</span>
                    <span class="dim export-transition-help">{{ episodeMessages.export.motionPresetHelp }}</span>
                  </div>
                  <BaseSelect
                    v-model="episodeMotionPresetValue"
                    :options="motionPresetOptions"
                    :placeholder="episodeMessages.export.motionPresetPlaceholder"
                    style="width:220px"
                  />
                </div>
                <div class="export-config card">
                  <div class="export-config-copy">
                    <span class="field-label">{{ episodeMessages.export.subtitleModeLabel }}</span>
                    <span class="dim export-transition-help">{{ episodeMessages.export.subtitleModeHelp }}</span>
                  </div>
                  <BaseSelect
                    v-model="episodeSubtitleModeValue"
                    :options="subtitleModeOptions"
                    :placeholder="episodeMessages.export.subtitleModePlaceholder"
                    style="width:220px"
                  />
                </div>
                <div class="export-config card">
                  <div class="export-config-copy">
                    <span class="field-label">{{ episodeMessages.export.dramaTransitionLabel }}</span>
                    <span class="dim export-transition-help">{{ episodeMessages.export.dramaTransitionHelp }}</span>
                  </div>
                  <BaseSelect
                    v-model="dramaMergeTransition"
                    :options="mergeTransitionOptions"
                    :placeholder="episodeMessages.export.transitionPlaceholder"
                    style="width:220px"
                  />
                </div>
              </div>

              <div class="export-panels">
                <section class="card export-task-card">
                  <div class="export-task-head">
                    <div class="export-task-copy">
                      <span class="field-label">{{ episodeMessages.export.emptyTitle }}</span>
                      <span class="dim export-transition-help">{{ t('episode.export.emptyDescription', { count: composedCount }) }}</span>
                      <span class="dim export-task-meta">{{ t('episode.export.summary', { count: sbs.length, duration: totalDurationValue }) }}</span>
                    </div>
                    <span :class="['tag', renderSettingsDirtyCount ? 'tag-warning' : 'tag-success']">
                      {{ renderSettingsDirtyCount ? episodeMessages.export.rerender : episodeMessages.export.ready }}
                    </span>
                  </div>

                  <template v-if="mergeUrl">
                    <video
                      :key="`merge:${mergeUrl}`"
                      :src="buildMediaSrc(mergeUrl, mergeUrl)"
                      controls
                      class="export-video"
                    />
                    <div class="export-bar">
                      <span class="dim export-status-copy">{{ renderSettingsDirtyCount ? t('episode.export.settingsDirty', { count: renderSettingsDirtyCount }) : episodeMessages.export.settingsCurrent }}</span>
                      <button class="btn" :disabled="isMergeRunning" @click="doMerge">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                        {{ isMergeRunning ? episodeMessages.export.processing : episodeMessages.export.rerender }}
                      </button>
                      <a :href="'/' + mergeUrl" download class="btn btn-primary">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        {{ episodeMessages.export.download }}
                      </a>
                    </div>
                  </template>
                  <template v-else>
                    <div class="step-empty export-empty">
                      <div class="empty-visual">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                      </div>
                      <div class="dim export-status-copy">{{ renderSettingsDirtyCount ? t('episode.export.settingsDirty', { count: renderSettingsDirtyCount }) : episodeMessages.export.settingsCurrent }}</div>
                      <button class="btn btn-primary" :disabled="composedCount === 0 || isMergeRunning" @click="doMerge">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                        {{ isMergeRunning ? episodeMessages.export.processing : episodeMessages.export.start }}
                      </button>
                    </div>
                  </template>
                </section>

                <section class="card export-task-card">
                  <div class="export-task-head">
                    <div class="export-task-copy">
                      <span class="field-label">{{ episodeMessages.export.dramaTitle }}</span>
                      <span class="dim export-transition-help">{{ t('episode.export.dramaSummary', { count: finalizedDramaEpisodeCount }) }}</span>
                      <span class="dim export-task-meta">{{ finalizedDramaEpisodeLabels.join(' · ') || episodeMessages.export.dramaNoEpisodes }}</span>
                    </div>
                    <span :class="['tag', finalizedDramaEpisodeCount >= 2 ? 'tag-success' : 'tag-warning']">
                      {{ finalizedDramaEpisodeCount >= 2 ? episodeMessages.export.dramaReadyTag : episodeMessages.export.dramaNeedEpisodesTag }}
                    </span>
                  </div>

                  <template v-if="dramaMergeUrl">
                    <video
                      :key="`drama-merge:${dramaMergeUrl}`"
                      :src="buildMediaSrc(dramaMergeUrl, dramaMergeUrl)"
                      controls
                      class="export-video"
                    />
                    <div class="export-bar">
                      <span class="dim export-status-copy">{{ t('episode.export.dramaSummary', { count: finalizedDramaEpisodeCount }) }}</span>
                      <button class="btn" :disabled="isDramaMergeRunning || finalizedDramaEpisodeCount < 2" @click="doDramaMerge">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                        {{ isDramaMergeRunning ? episodeMessages.export.dramaProcessing : episodeMessages.export.dramaRerender }}
                      </button>
                      <a :href="'/' + dramaMergeUrl" download class="btn btn-primary">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        {{ episodeMessages.export.dramaDownload }}
                      </a>
                    </div>
                  </template>
                  <template v-else>
                    <div class="step-empty export-empty">
                      <div class="empty-visual">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                      </div>
                      <div class="empty-title">{{ episodeMessages.export.dramaEmptyTitle }}</div>
                      <div class="empty-desc">{{ t('episode.export.dramaEmptyDescription', { count: finalizedDramaEpisodeCount }) }}</div>
                      <button class="btn btn-primary" :disabled="finalizedDramaEpisodeCount < 2 || isDramaMergeRunning" @click="doDramaMerge">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                        {{ isDramaMergeRunning ? episodeMessages.export.dramaProcessing : episodeMessages.export.dramaStart }}
                      </button>
                    </div>
                  </template>
                </section>
              </div>
            </div>
          </div>
          <div class="export-list">
            <div class="export-list-head">{{ episodeMessages.export.shotOverview }}</div>
            <div class="export-list-body">
              <div v-for="(sb, i) in sbs" :key="sb.id" class="exp-row">
                <span class="mono dim" style="font-size:10px">#{{ String(i+1).padStart(2,'0') }}</span>
                <span class="truncate" style="flex:1;font-size:11px">{{ sb.description || sb.title || episodeCommon.blank }}</span>
                <span :class="['dot', hasComposed(sb) && 'ok']" />
              </div>
            </div>

          </div>
        </div>
      </div>

      <EpisodeWorkbenchStatus
        :running-jobs="workbench.runningJobs.value"
        :recent-jobs="workbench.recentJobs.value"
        :model-usage-cards="workbench.modelUsageCards.value"
        :service-health-cards="workbench.serviceHealthCards.value"
        :blocking-stages="workbench.blockingStages.value"
      />

      <EpisodeOrchestratorCard
        :review-stage-state="reviewStageState"
        :review-stage-label="getReviewStageLabel(reviewStageState)"
        :next-action-label="workbenchNextActionLabel"
        :review-pending-count="reviewPendingCount"
        :reviewable-storyboard-count="reviewableStoryboardCount"
        :is-running="isEpisodeOrchestrating"
        :can-start="canStartEpisodeOrchestration"
        @prepare="startEpisodeOrchestration('storyboard_review')"
        @export="startEpisodeOrchestration('publish_ready')"
      />

      <div v-if="showBottomBubble" class="step-bubble">
        <button
          v-if="panel === 'script'"
          class="bubble-btn"
          :disabled="scriptStep === 0"
          @click="goPrevStep"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          {{ prevStepLabel || episodeMessages.navigation.previous }}
        </button>
        <button
          v-else-if="panel === 'production'"
          class="bubble-btn"
          :disabled="prodTabIdx === 0"
          @click="shiftProdTab(-1)"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          {{ prodTabDefs[Math.max(0, prodTabIdx - 1)]?.label || episodeMessages.navigation.previous }}
        </button>

        <div class="bubble-dots">
          <button
            v-for="step in bubbleSteps"
            :key="step.key"
            :class="['bubble-dot', { done: step.done, partial: step.partial, current: step.key === activeBubbleKey }]"
            @click="goSubStep(step.key)"
            :title="step.label"
          ></button>
        </div>

        <button
          v-if="panel === 'script'"
          class="bubble-btn primary"
          :disabled="!canGoNext"
          @click="goNextStep"
        >
          {{ nextStepLabel || episodeMessages.navigation.next }}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>
        <button
          v-else-if="panel === 'production'"
          class="bubble-btn primary"
          :disabled="panel === 'production' && prodTab === 'compose' && !canExport"
          @click="goNextProd"
        >
          {{ prodTabIdx < prodTabDefs.length - 1 ? (prodTabDefs[prodTabIdx + 1]?.label || episodeMessages.navigation.next) : episodeMessages.navigation.enterExport }}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>
      </div>

      <Teleport to="body">
        <div v-if="pendingDeleteShot" class="overlay shot-delete-overlay" @click.self="closeDeleteShotDialog">
          <div class="card shot-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="shot-delete-title">
            <div class="shot-delete-head">
              <div class="shot-delete-icon">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
              </div>
              <div class="shot-delete-copy">
                <h2 id="shot-delete-title" class="shot-delete-title">{{ episodeMessages.storyboardDetail.deleteTitle }}</h2>
                <p class="shot-delete-desc">{{ episodeMessages.storyboardDetail.deleteDescription }}</p>
              </div>
            </div>

            <div class="shot-delete-target">
              <span class="shot-delete-target-label">{{ episodeMessages.storyboardDetail.deleteTargetLabel }}</span>
              <strong class="shot-delete-target-title">{{ getDeleteShotTitle(pendingDeleteShot) }}</strong>
              <span class="shot-delete-target-meta">{{ formatStoryboardDuration(pendingDeleteShot) }}</span>
            </div>

            <div class="shot-delete-actions">
              <button type="button" class="btn" :disabled="deletingShot" @click="closeDeleteShotDialog">{{ messages.common.cancel }}</button>
              <button type="button" class="btn btn-danger" :disabled="deletingShot" @click="confirmDeleteShot">
                <svg v-if="!deletingShot" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
                {{ deletingShot ? episodeMessages.storyboardDetail.deleteDeleting : episodeMessages.storyboardDetail.deleteAction }}
              </button>
            </div>
          </div>
        </div>
      </Teleport>

      <Teleport to="body">
        <div v-if="pendingDeleteAudioCue" class="overlay shot-delete-overlay" @click.self="closeDeleteAudioCueDialog">
          <div class="card shot-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="audio-cue-delete-title">
            <div class="shot-delete-head">
              <div class="shot-delete-icon">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
              </div>
              <div class="shot-delete-copy">
                <h2 id="audio-cue-delete-title" class="shot-delete-title">{{ episodeMessages.production.audio.deleteTitle }}</h2>
                <p class="shot-delete-desc">{{ episodeMessages.production.audio.deleteDescription }}</p>
              </div>
            </div>

            <div class="shot-delete-target">
              <span class="shot-delete-target-label">{{ episodeMessages.production.audio.deleteTargetLabel }}</span>
              <strong class="shot-delete-target-title">{{ getDeleteAudioCueTitle(pendingDeleteAudioCue) }}</strong>
              <span class="shot-delete-target-meta">{{ getDeleteAudioCueMeta(pendingDeleteAudioCue) }}</span>
            </div>

            <div class="shot-delete-actions">
              <button type="button" class="btn" :disabled="deletingAudioCue" @click="closeDeleteAudioCueDialog">{{ messages.common.cancel }}</button>
              <button type="button" class="btn btn-danger" :disabled="deletingAudioCue" @click="confirmDeleteAudioCue">
                <svg v-if="!deletingAudioCue" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
                {{ deletingAudioCue ? episodeMessages.production.audio.deleteDeleting : episodeMessages.production.audio.deleteAction }}
              </button>
            </div>
          </div>
        </div>
      </Teleport>

      <Teleport to="body">
        <div v-if="imageViewer.open && imageViewer.src" class="overlay image-viewer-overlay" @click.self="closeImageViewer">
          <div class="card image-viewer-dialog">
            <div class="image-viewer-head">
              <div class="image-viewer-title">{{ imageViewer.title || episodeMessages.imageViewer.defaultTitle }}</div>
              <button class="btn btn-ghost btn-icon" @click="closeImageViewer">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div class="image-viewer-body">
              <img :src="imageViewer.src" :alt="imageViewer.title || episodeMessages.imageViewer.defaultTitle" class="image-viewer-img" />
            </div>
          </div>
        </div>
      </Teleport>
    </main>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { toast } from 'vue-sonner'
import {
  Users, MapPin, Video, ImageIcon, Layers, Mic2, Music2, Loader2,
} from 'lucide-vue-next'
import { dramaAPI, episodeAPI, storyboardAPI, characterAPI, sceneAPI, imageAPI, videoAPI, uploadAPI, composeAPI, mergeAPI, aiConfigAPI, voicesAPI, audioCuesAPI } from '~/composables/useApi'
import { useAgent } from '~/composables/useAgent'
import { useEpisodeAssetTracker } from '~/composables/useEpisodeAssetTracker'
import { useEpisodeAudioCues } from '~/composables/useEpisodeAudioCues'
import { useAppI18n } from '~/composables/useAppI18n'
import { useEpisodeGridTool } from '~/composables/useEpisodeGridTool'
import { useEpisodeStoryboardDetailTools } from '~/composables/useEpisodeStoryboardDetailTools'
import { useEpisodeStageNavigation } from '~/composables/useEpisodeStageNavigation'
import { useEpisodeProductionStatus } from '~/composables/useEpisodeProductionStatus'
import { useEpisodeWorkbenchController } from '~/composables/useEpisodeWorkbenchController'
import { useEpisodeWorkbenchRouteSync } from '~/composables/useEpisodeWorkbenchRouteSync'
import BaseSelect from '~/components/BaseSelect.vue'
import EpisodeWorkbenchStatus from '~/components/episode/EpisodeWorkbenchStatus.vue'
import EpisodeValidationBanner from '~/components/episode/EpisodeValidationBanner.vue'
import {
  buildCharacterImagePrompt as composeCharacterImagePrompt,
  buildSceneImagePrompt as composeSceneImagePrompt,
  buildShotFramePrompt as composeShotFramePrompt,
  buildShotVideoPrompt as composeShotVideoPrompt,
} from '~/utils/prompt-composer'

definePageMeta({ layout: 'studio' })

const route = useRoute()
const router = useRouter()
const dramaId = Number(route.params.id)
const episodeNumber = Number(route.params.episodeNumber)
const pipelineStepTotal = 13
const { messages, t } = useAppI18n()
const episodeMessages = messages.episode
const episodeCommon = episodeMessages.common

const drama = ref(null), episode = ref(null), chars = ref([]), scenes = ref([]), propsItems = ref([]), sbs = ref([]), mergeData = ref(null), dramaMergeData = ref(null), episodeAudioCues = ref([])
const panel = ref('script')
const { running: rn, runningType: rt, run: runAgent } = useAgent()
const mainPanelEl = useTemplateRef<HTMLElement>('mainRef')
const contentPanelEl = useTemplateRef<HTMLElement>('contentPanelRef')

const localRaw = ref(''), localScript = ref('')
const rawContent = computed(() => episode.value?.content || '')
const scriptContent = computed(() => episode.value?.script_content || episode.value?.scriptContent || '')
const epId = computed(() => episode.value?.id || 0)
const rawLen = computed(() => localRaw.value.replace(/\s/g, '').length || 0)
const scriptLen = computed(() => localScript.value.replace(/\s/g, '').length || 0)
const charsVoiced = computed(() => chars.value.filter(c => c.voice_style || c.voiceStyle).length)
const voiceSampleCount = computed(() => chars.value.filter(c => c.voice_sample_url || c.voiceSampleUrl).length)
const composedCount = computed(() => sbs.value.filter(s => s.composed_video_url || s.composedVideoUrl).length)
const canBatchCharImages = computed(() => visualChars.value.length > 0)
const canBatchSceneImages = computed(() => scenes.value.length > 0)
const canBatchShotVoices = computed(() => ttsEligibleCount.value > 0)
const mergeUrl = computed(() => {
  const status = String(mergeData.value?.status || '')
  if (status !== 'completed') return null
  return mergeData.value?.merged_url || mergeData.value?.mergedUrl || null
})
const isMergeRunning = computed(() => ['processing', 'running'].includes(String(mergeData.value?.status || '').toLowerCase()))
const dramaMergeUrl = computed(() => {
  const status = String(dramaMergeData.value?.status || '')
  if (status !== 'completed') return null
  return dramaMergeData.value?.merged_url || dramaMergeData.value?.mergedUrl || null
})
const isDramaMergeRunning = computed(() => ['processing', 'running'].includes(String(dramaMergeData.value?.status || '').toLowerCase()))

const scriptStep = ref(0)
const prodTab = ref('chars')
const prodTabIdx = computed({
  get: () => prodTabDefs.value.findIndex(t => t.id === prodTab.value),
  set: (v) => { prodTab.value = prodTabDefs.value[v]?.id || 'chars' },
})
const frameMode = ref('first')
const fallbackVoiceProfiles = episodeMessages.voiceProfiles.fallback.map(profile => ({ ...profile }))
const voiceProfiles = ref(fallbackVoiceProfiles)
const voiceSelectOptions = computed(() => voiceProfiles.value.map(v => ({ label: `${v.label} · ${v.traits}`, value: v.id })))
const frameModeOptions = [
  { label: episodeMessages.production.shots.firstFrame, value: 'first' },
  { label: `${episodeMessages.production.shots.firstFrame} / ${episodeMessages.production.shots.lastFrame}`, value: 'first_last' },
]
const mergeTransition = ref('cut')
const dramaMergeTransition = ref('cut')
const mergeTransitionOptions = [
  { label: episodeMessages.export.transitions.cut, value: 'cut' },
  { label: episodeMessages.export.transitions.fade, value: 'fade' },
  { label: episodeMessages.export.transitions.wipeleft, value: 'wipeleft' },
  { label: episodeMessages.export.transitions.slideright, value: 'slideright' },
  { label: episodeMessages.export.transitions.smoothleft, value: 'smoothleft' },
  { label: episodeMessages.export.transitions.circleopen, value: 'circleopen' },
]
const finalizedDramaEpisodes = computed(() => {
  const items = Array.isArray(drama.value?.episodes) ? drama.value.episodes : []
  return [...items]
    .filter((item) => {
      const id = Number(item?.id || 0)
      const hasFinalVideo = id === epId.value
        ? !!(mergeUrl.value || item?.video_url || item?.videoUrl)
        : !!(item?.video_url || item?.videoUrl)
      return hasFinalVideo
    })
    .sort((left, right) => Number(left?.episode_number || left?.episodeNumber || 0) - Number(right?.episode_number || right?.episodeNumber || 0))
})
const finalizedDramaEpisodeCount = computed(() => finalizedDramaEpisodes.value.length)
const finalizedDramaEpisodeLabels = computed(() => finalizedDramaEpisodes.value.map((item) => `E${Number(item?.episode_number || item?.episodeNumber || 0)}`))
const imageConfigs = ref([])
const videoConfigs = ref([])
const audioConfigs = ref([])
const textConfigs = ref([])
const imageViewer = ref({ open: false, src: '', title: '' })

function pickFile(accept) {
  if (typeof document === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => resolve(input.files?.[0] || null)
    input.click()
  })
}

function isImageFile(file) {
  return !!file && (String(file.type || '').startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(file.name || ''))
}

function isVideoFile(file) {
  return !!file && (String(file.type || '').startsWith('video/') || /\.(mp4|mov|m4v|webm|avi)$/i.test(file.name || ''))
}

function isAudioFile(file) {
  return !!file && (String(file.type || '').startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(file.name || ''))
}

async function pickImageFile() {
  const file = await pickFile('image/*')
  if (!file) return null
  if (!isImageFile(file)) {
    toast.error(episodeMessages.toasts.invalidImageFile)
    return null
  }
  return file
}

async function pickVideoFile() {
  const file = await pickFile('video/*')
  if (!file) return null
  if (!isVideoFile(file)) {
    toast.error(episodeMessages.toasts.invalidVideoFile)
    return null
  }
  return file
}

async function pickAudioFile() {
  const file = await pickFile('audio/*')
  if (!file) return null
  if (!isAudioFile(file)) {
    toast.error(episodeMessages.toasts.invalidAudioFile)
    return null
  }
  return file
}

function configLabel(config) {
  if (!config) return episodeCommon.notConfigured
  let modelName = ''
  try { const m = JSON.parse(config.model || '[]'); modelName = Array.isArray(m) ? (m[0] || '') : (m || '') } catch { modelName = config.model || '' }
  return modelName ? `${config.name} · ${modelName} (${config.provider})` : `${config.name} (${config.provider})`
}

function providerWarningMessage(service) {
  const card = workbench.getServiceHealth(service)
  const status = card?.status || ''
  if (!status || status === 'available') return ''
  const warnings = episodeMessages.workbench?.providerWarnings || {}
  return warnings[status] || episodeMessages.workbench?.providerWarnings?.unknown_error || ''
}

function ensureServiceReady(service) {
  const card = workbench.getServiceHealth(service)
  const status = card?.status || ''
  if (!status || status === 'available') return true

  const warning = providerWarningMessage(service)
  if (warning) toast.warning(warning)

  return !['invalid_key', 'not_configured', 'paid_plan_required'].includes(status)
}

async function copyText(value) {
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'absolute'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

function openImageViewer(src, title = '') {
  if (!src) return
  imageViewer.value = { open: true, src, title }
}

function closeImageViewer() {
  imageViewer.value = { open: false, src: '', title: '' }
}

function queueContentFocus() {
  void focusActiveContent()
}

async function focusActiveContent() {
  await nextTick()
  const container = mainPanelEl.value
  const target = contentPanelEl.value
  if (!container || !target) return

  const anchor = target.querySelector('textarea.fill-textarea, .step-empty, .extract-stage, .prod-content, .export-split, .step-editor') || target
  const top = Math.max(
    0,
    anchor.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 12,
  )
  container.scrollTop = top
}

function handleImageViewerKeydown(event) {
  if (event.key === 'Escape' && imageViewer.value.open) closeImageViewer()
}

onMounted(() => {
  window.addEventListener('keydown', handleImageViewerKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleImageViewerKeydown)
})

function isNarratorCharacter(char) {
  const text = `${char?.name || ''} ${char?.role || ''}`.toLowerCase()
  return text.includes('narrator')
    || text.includes('narracao')
    || text.includes('narração')
}

const visualChars = computed(() => chars.value.filter(c => !isNarratorCharacter(c)))

const lockedImageConfigId = computed(() => episode.value?.image_config_id || episode.value?.imageConfigId || null)
const lockedVideoConfigId = computed(() => episode.value?.video_config_id || episode.value?.videoConfigId || null)
const lockedAudioConfigId = computed(() => episode.value?.audio_config_id || episode.value?.audioConfigId || null)
const lockedAudioProvider = computed(() => audioConfigs.value.find(c => c.id === lockedAudioConfigId.value)?.provider || '')
const activeAudioProvider = computed(() => {
  return lockedAudioProvider.value
    || audioConfigs.value.find(c => c.is_active)?.provider
    || audioConfigs.value[0]?.provider
    || 'minimax'
})
const effectiveAudioConfig = computed(() => {
  return audioConfigs.value.find(c => c.id === lockedAudioConfigId.value)
    || audioConfigs.value.find(c => c.is_active)
    || audioConfigs.value[0]
    || null
})
const effectiveTextConfig = computed(() => {
  return textConfigs.value.find(c => c.is_active)
    || textConfigs.value[0]
    || null
})
const effectiveImageConfig = computed(() => {
  return imageConfigs.value.find(c => c.id === lockedImageConfigId.value)
    || imageConfigs.value.find(c => c.is_active)
    || imageConfigs.value[0]
    || null
})
const effectiveVideoConfig = computed(() => {
  return videoConfigs.value.find(c => c.id === lockedVideoConfigId.value)
    || videoConfigs.value.find(c => c.is_active)
    || videoConfigs.value[0]
    || null
})
const textConfigLabel = computed(() => configLabel(effectiveTextConfig.value))
const lockedImageConfigLabel = computed(() => configLabel(effectiveImageConfig.value))
const lockedVideoConfigLabel = computed(() => configLabel(effectiveVideoConfig.value))
const lockedAudioConfigLabel = computed(() => configLabel(effectiveAudioConfig.value))

const {
  workbench,
  workbenchAudioValidation,
  workbenchComposeValidation,
  workbenchMergeValidation,
  reviewStageState,
  reviewPendingCount,
  reviewableStoryboardCount,
  isEpisodeOrchestrating,
  canStartEpisodeOrchestration,
  workbenchNextActionLabel,
  revealComposeValidation,
  revealMergeValidation,
  showComposeValidationBanner,
  showMergeValidationBanner,
  isWorkbenchStageDone,
  isWorkbenchStageSatisfied,
  getReviewStatusLabel,
  getReviewStatusClass,
  canReviewStoryboard,
  getContinuitySourceLabel,
  getReviewStageLabel,
  approveStoryboardReview,
  requestStoryboardChanges,
  startEpisodeOrchestration,
} = useEpisodeWorkbenchController({
  dramaId,
  episodeId: epId,
  storyboards: sbs,
  episodeMessages,
  t,
  refresh,
  hasImg,
  getFirstFrame,
  getLastFrame,
  services: {
    text: {
      provider: computed(() => effectiveTextConfig.value?.provider || ''),
      label: textConfigLabel,
    },
    image: {
      provider: computed(() => effectiveImageConfig.value?.provider || ''),
      label: lockedImageConfigLabel,
    },
    video: {
      provider: computed(() => effectiveVideoConfig.value?.provider || ''),
      label: lockedVideoConfigLabel,
    },
    audio: {
      provider: computed(() => effectiveAudioConfig.value?.provider || ''),
      label: lockedAudioConfigLabel,
    },
  },
})

const {
  gridLayoutOptions,
  gridDialog,
  gridStep,
  gridLayout,
  gridMode,
  gridSelected,
  gridSingleTarget,
  gridGenId,
  gridImagePath,
  gridStatusText,
  gridActualLayout,
  gridRecoveredAt,
  gridRecoveredMode,
  gridPromptText,
  gridCellPrompts,
  gridPromptSource,
  gridPromptLoading,
  gridPromptStatus,
  gridAssignmentsState,
  gridActiveShotIds,
  gridHistory,
  showAllGridHistory,
  activeGridCell,
  gridAssignmentPage,
  gridModes,
  gridLayoutShape,
  gridTotalCells,
  gridCanStart,
  gridSummary,
  gridAssignments,
  gridAssignmentShotOptions,
  gridFrameTypeOptions,
  gridAssignedCount,
  gridAssignmentTotalPages,
  gridAssignmentPageStart,
  gridAssignmentPageEnd,
  pagedGridAssignments,
  gridOverlayStyle,
  gridAutoLayout,
  gridBlankStyle,
  getGridPromptSourceLabel,
  getGridHistoryToggleLabel,
  gridCellLabel,
  gridCellTitle,
  updateGridAssignment,
  focusGridCell,
  resetGridAssignments,
  gridSelectAll,
  openGridTool,
  selectGridHistory,
  reopenGridPreview,
  continueGridSplit,
  generateGridPrompt,
  startGridGen,
  loadLatestGridImage,
  doGridSplit,
} = useEpisodeGridTool({
  dramaId,
  episodeId: epId,
  episodeNumber,
  storyboards: sbs,
  episodeMessages,
  t,
  getFrameTypeShortLabel,
})

const {
  isPendingCharImage,
  charImageFailMessage,
  isPendingSceneImage,
  sceneImageFailMessage,
  isPendingShotFrame,
  isPendingVideo,
  videoFailMessage,
  isPendingCompose,
  composeFailMessage,
  refreshGenerationHistory,
  pruneFailedComposeMessages,
  startCharImage,
  startCharImages,
  clearCharImagePending,
  startSceneImage,
  startSceneImages,
  clearSceneImagePending,
  startShotFrame,
  clearShotFramePending,
  startVideo,
  startVideos,
  clearVideoPending,
  startCompose,
  clearComposePending,
  setComposeFailed,
  setPendingComposeIds,
  monitorImageGeneration,
  watchAsyncResult,
  pollVideoGeneration,
  pollComposeStatus,
} = useEpisodeAssetTracker({
  dramaId,
  chars,
  scenes,
  storyboards: sbs,
  episodeMessages,
  t,
  getFirstFrame,
  getLastFrame,
  getVideoUrl,
  hasComposed,
  refresh,
  sleep,
})

function formatSceneLabel(location, time) {
  return t('episode.storyboardDetail.sceneLabel', {
    location,
    time: time || episodeCommon.unsetTime,
  })
}

const {
  motionPresetOptions,
  subtitleModeOptions,
  motionPresetOverrideOptions,
  episodeMotionPresetValue,
  episodeSubtitleModeValue,
  renderSettingsDirtyCount,
  totalDurationValue,
  totalDurationLabel,
  sceneSelectOptions,
  formatStoryboardDuration,
  getMotionPresetLabel,
  getStoryboardMotionPresetOverride,
  getEffectiveMotionPreset,
  updateField,
  getStoryboardSceneSelectValue,
  updateStoryboardMotionPreset,
  getStoryboardCharacterIds,
  getStoryboardCharacterNames,
  isStoryboardCharacterSelected,
  toggleStoryboardCharacter,
  getSceneName,
  storyboardUsesVideoSource,
  getStoryboardMotionScopeNote,
  getStoryboardCharacters,
  getStoryboardScene,
} = useEpisodeStoryboardDetailTools({
  episode,
  episodeId: epId,
  storyboards: sbs,
  characters: chars,
  scenes,
  episodeMessages,
  episodeCommon,
  t,
  formatSceneLabel,
  getVideoUrl,
  hasComposeSource,
  isTTSIgnorable,
})

function getProductionEntryStatusLabel(isReady, isPending = false, isFailed = false) {
  if (isReady) return episodeCommon.generated
  if (isFailed) return episodeCommon.failed
  return isPending ? episodeCommon.generating : episodeCommon.pending
}

function getFrameTypeLabel(frameType) {
  return episodeMessages.grid.frameTypes[frameType] || episodeCommon.blank
}

function getFrameTypeShortLabel(frameType) {
  return episodeMessages.grid.frameShort[frameType] || ''
}

function getFrameThumbLabel(frameType, isPending = false) {
  if (frameType === 'last_frame') {
    return isPending ? episodeMessages.production.shots.lastGenerating : episodeMessages.production.shots.lastFrame
  }
  return isPending ? episodeMessages.production.shots.firstGenerating : episodeMessages.production.shots.firstFrame
}

function getShotFramePreviewTitle(number, frameType) {
  if (frameType === 'last_frame') {
    return t('episode.storyboardDetail.preview.lastTitle', { number })
  }
  return t('episode.storyboardDetail.preview.firstTitle', { number })
}

function getShotReferencePreviewTitle(number) {
  return `${t('episode.storyboardDetail.shotTitle', { number })} · ${episodeCommon.shotReference}`
}

function getTopbarActionLabel() {
  if (mergeUrl.value) return episodeMessages.header.viewFinal
  if (panel.value === 'script') {
    if (scriptStep.value === 0 && !(localRaw.value || rawContent.value || '').trim()) return episodeMessages.script.raw.step
    if (scriptStep.value === 1 && !(localScript.value || scriptContent.value || '').trim()) return episodeMessages.script.rewrite.start
    if (scriptStep.value === 2 && !chars.value.length) return episodeMessages.script.extract.start
    if (scriptStep.value === 3 && !storyboardStepReady.value) return episodeMessages.script.storyboard.start
    if (scriptStep.value === 4 && !sbs.value.length) return episodeMessages.script.storyboard.start
    return nextStepLabel.value || episodeMessages.header.continueProduction
  }

  if (panel.value === 'production') {
    if (prodTabIdx.value < prodTabDefs.value.length - 1) {
      return prodTabDefs.value[prodTabIdx.value + 1]?.label || episodeMessages.header.continueProduction
    }
    return episodeMessages.navigation.enterExport
  }

  return sbs.value.length ? episodeMessages.header.continueProduction : episodeMessages.header.startProduction
}

const canExport = computed(() => !!sbs.value.length && isWorkbenchStageDone('composition') && !workbenchAudioValidation.value.blocked)

function setProdTab(id) {
  prodTab.value = id
  queueContentFocus()
}

function shiftProdTab(offset) {
  const nextIndex = Math.min(prodTabDefs.value.length - 1, Math.max(0, prodTabIdx.value + offset))
  if (nextIndex === prodTabIdx.value) return
  prodTabIdx.value = nextIndex
  queueContentFocus()
}

async function goTopbarPrimary() {
  if (mergeUrl.value) {
    panel.value = 'export'
    queueContentFocus()
    return
  }

  if (panel.value === 'script') {
    if (scriptStep.value === 0) {
      if (!(localRaw.value || rawContent.value || '').trim()) {
        queueContentFocus()
        toast.warning(episodeMessages.toasts.fillRawFirst)
        return
      }
      goNextStep()
      return
    }
    if (scriptStep.value === 1) {
      if ((localScript.value || scriptContent.value || '').trim()) {
        goNextStep()
        return
      }
      await doRewrite()
      return
    }
    if (scriptStep.value === 2) {
      if (extractionStepReady.value) {
        goNextStep()
        return
      }
      await doExtract()
      return
    }
    if (scriptStep.value === 3) {
      scriptStep.value = 4
      queueContentFocus()
      return
    }
    if (scriptStep.value === 4) {
      if (storyboardStepReady.value) {
        panel.value = 'production'
        queueContentFocus()
        return
      }
      doBreakdown()
      return
    }
  }

  if (panel.value === 'production') {
    goNextProd()
    return
  }

  panel.value = mergeUrl.value ? 'export' : (sbs.value.length ? 'production' : 'script')
  queueContentFocus()
}

function goNextProd() {
  const audioIndex = prodTabDefs.value.findIndex(step => step.id === 'audio')
  if (audioIndex >= 0 && prodTabIdx.value >= audioIndex && workbenchAudioValidation.value.blocked) {
    prodTab.value = 'audio'
    queueContentFocus()
    toast.warning(workbenchAudioValidation.value.issues[0]?.message || episodeMessages.toasts.mergeFailed)
    return
  }
  if (prodTabIdx.value < prodTabDefs.value.length - 1) {
    prodTabIdx.value++
    queueContentFocus()
  } else {
    panel.value = 'export'
    queueContentFocus()
  }
}

// Script step navigation
const stepLabels = [...episodeMessages.script.stepLabels]
const scriptStepOrder = [0, 1, 2, 4]
const scriptStepIndex = computed(() => {
  const index = scriptStepOrder.indexOf(scriptStep.value)
  if (index >= 0) return index
  if (scriptStep.value === 3) return scriptStepOrder.indexOf(2)
  return 0
})
const prevStepLabel = computed(() => scriptStepIndex.value > 0 ? stepLabels[scriptStepOrder[scriptStepIndex.value - 1]] : '')
const nextStepLabel = computed(() => {
  if (scriptStep.value === 4) return episodeMessages.navigation.enterProduction
  return stepLabels[scriptStepOrder[scriptStepIndex.value + 1]] || ''
})
const canGoNext = computed(() => {
  if (scriptStep.value === 0) return !!localRaw.value.trim()
  if (scriptStep.value === 1) return !!localScript.value.trim() || !!scriptContent.value
  if (scriptStep.value === 2) return extractionStepReady.value
  if (scriptStep.value === 3) return extractionStepReady.value
  if (scriptStep.value === 4) return storyboardStepReady.value
  return false
})
function goPrevStep() {
  if (scriptStepIndex.value > 0) {
    scriptStep.value = scriptStepOrder[scriptStepIndex.value - 1]
    queueContentFocus()
  }
}
function goNextStep() {
  if (scriptStep.value === 0 && localRaw.value.trim()) { saveRaw() }
  if (scriptStep.value === 1 && localScript.value.trim()) { saveScr() }
  if (scriptStep.value === 4) { panel.value = 'production'; queueContentFocus(); return }
  if (canGoNext.value) {
    scriptStep.value = scriptStepOrder[Math.min(scriptStepIndex.value + 1, scriptStepOrder.length - 1)]
    queueContentFocus()
  }
}

const charImgCount = computed(() => visualChars.value.filter(c => c.image_url || c.imageUrl).length)
const sceneImgCount = computed(() => scenes.value.filter(s => s.image_url || s.imageUrl).length)
const dubbingShots = computed(() => [...sbs.value])
const ttsEligibleCount = computed(() => sbs.value.filter(s => hasDialogue(s)).length)
const ttsGeneratedCount = computed(() => sbs.value.filter(s => hasDialogue(s) && hasTTS(s)).length)
const scriptHasExplicitDialogue = computed(() => /(^|[\n\r]|[.!?]\s+)[^#\n:：]{2,80}[:：]\s*[^:\n]{2,220}/m.test(String(scriptContent.value || '')))
const storyboardDialogueMismatch = computed(() => scriptHasExplicitDialogue.value && !!sbs.value.length && !sbs.value.some(sb => hasDialogue(sb)))
const hasExtractedEntities = computed(() => (chars.value.length + scenes.value.length + propsItems.value.length) > 0)
const extractionStepReady = computed(() => isWorkbenchStageDone('entities') || hasExtractedEntities.value)
const voiceAssignmentReady = computed(() => extractionStepReady.value)
const storyboardStepReady = computed(() => isWorkbenchStageDone('storyboards') || (!!sbs.value.length && !storyboardDialogueMismatch.value))
const dubbingStepSatisfied = computed(() => prodStepSatisfied('dubbing'))
const shotImgCount = computed(() => sbs.value.filter(s => s.first_frame_image || s.firstFrameImage || s.last_frame_image || s.lastFrameImage || s.composed_image || s.composedImage).length)
const shotVidCount = computed(() => sbs.value.filter(s => s.video_url || s.videoUrl).length)
const visualCharTotal = computed(() => visualChars.value.length)

function getExtractionAudit(entity) {
  return entity?.extraction_audit || entity?.extractionAudit || null
}

function getExtractionAuditSummary(entity) {
  const audit = getExtractionAudit(entity)
  if (!audit) return ''
  const parts = []
  const quote = String(audit?.top_quote || audit?.topQuote || '').trim()
  const mentionCount = Number(audit?.mention_count ?? audit?.mentionCount ?? 0) || 0
  if (quote) parts.push(`${episodeMessages.extractBoard.evidence}: ${quote}`)
  if (mentionCount > 0) parts.push(t('episode.extractBoard.mentionsCount', { count: mentionCount }))
  return parts.join(' · ')
}
const {
  pendingDeleteAudioCue,
  deletingAudioCue,
  getAudioCues,
  getCueLayerType,
  hasAudioCueLayer,
  getAudioCueCreateLabel,
  getEpisodeAudioFallbackPrompt,
  getSceneAudioFallbackPrompt,
  getStoryboardAudioCueFallback,
  getCuePreviewUrl,
  cueHasAsset,
  cueLayerLabel,
  getAudioScopeSummary,
  cueScopeLabel,
  audioCueReadyCount,
  audioCueTotal,
  requestDeleteAudioCue,
  closeDeleteAudioCueDialog,
  getDeleteAudioCueTitle,
  getDeleteAudioCueMeta,
  getCuePromptForEpisode,
  getCuePromptForScene,
  getCuePromptForStoryboard,
  copyAudioCuePrompt,
  hasSuggestedAudioCuePrompt,
  applySuggestedAudioCuePrompt,
  saveAudioCueTextInput,
  saveAudioCueNumberInput,
  saveAudioCueBooleanInput,
  createAudioCue,
  attachAudioCueAsset,
  clearAudioCueAsset,
  confirmDeleteAudioCue,
} = useEpisodeAudioCues({
  dramaId,
  episodeId: epId,
  episodeAudioCues,
  scenes,
  storyboards: sbs,
  episodeMessages,
  t,
  refresh,
  pickAudioFile,
  copyPromptValue,
})

const {
  getProductionStepStatus,
  prodStepDone,
  prodStepPartial,
  prodStepSatisfied,
  prodStepBlocked,
  prodStepNotApplicable,
  prodStepBadge,
  prodStepStatusClass,
} = useEpisodeProductionStatus({
  pipelineStatus: workbench.pipelineStatus,
  storyboardTotal: computed(() => sbs.value.length),
  counts: {
    chars: {
      count: charImgCount,
      total: visualCharTotal,
    },
    scenes: {
      count: sceneImgCount,
      total: computed(() => scenes.value.length),
    },
    dubbing: {
      count: ttsGeneratedCount,
      total: ttsEligibleCount,
    },
    audio: {
      count: audioCueReadyCount,
      total: audioCueTotal,
    },
    shots: {
      count: shotImgCount,
      total: computed(() => sbs.value.length),
    },
    videos: {
      count: shotVidCount,
      total: computed(() => sbs.value.length),
    },
    compose: {
      count: composedCount,
      total: computed(() => sbs.value.length),
    },
  },
})

const prodTabDefs = computed(() => [
  { id: 'chars', label: episodeMessages.production.tabs.chars, icon: Users, badge: prodStepBadge('chars'), status: getProductionStepStatus('chars') },
  { id: 'scenes', label: episodeMessages.production.tabs.scenes, icon: MapPin, badge: prodStepBadge('scenes'), status: getProductionStepStatus('scenes') },
  { id: 'dubbing', label: episodeMessages.production.tabs.dubbing, icon: Mic2, badge: prodStepBadge('dubbing'), status: getProductionStepStatus('dubbing') },
  { id: 'audio', label: episodeMessages.production.tabs.audio, icon: Music2, badge: prodStepBadge('audio'), status: getProductionStepStatus('audio') },
  { id: 'shots', label: episodeMessages.production.tabs.shots, icon: ImageIcon, badge: prodStepBadge('shots'), status: getProductionStepStatus('shots') },
  { id: 'videos', label: episodeMessages.production.tabs.videos, icon: Video, badge: prodStepBadge('videos'), status: getProductionStepStatus('videos') },
  { id: 'compose', label: episodeMessages.production.tabs.compose, icon: Layers, badge: prodStepBadge('compose'), status: getProductionStepStatus('compose') },
])
const {
  sidebarSections,
  activeSubSteps,
  activeSubStepKey,
  sidebarJumpSteps,
  bubbleSteps,
  activeBubbleKey,
  showBottomBubble,
  goSubStep,
  currentSubStageLabel,
} = useEpisodeStageNavigation({
  panel,
  scriptStep,
  prodTab,
  prodTabDefs,
  episodeMessages,
  stepLabels,
  rawContent,
  scriptContent,
  extractionStepReady,
  voiceAssignmentReady,
  storyboardStepReady,
  dubbingStepSatisfied,
  visualCharTotal,
  charImgCount,
  scenes,
  sceneImgCount,
  chars,
  storyboards: sbs,
  shotImgCount,
  shotVidCount,
  composedCount,
  mergeUrl,
  prodStepDone,
  prodStepPartial,
  prodStepSatisfied,
  prodStepBlocked,
  prodStepNotApplicable,
  isWorkbenchStageDone,
  queueContentFocus,
})

const pipelineProgress = computed(() => {
  let p = 0
  if (rawContent.value) p++
  if (isWorkbenchStageDone('rewritten_script') || scriptContent.value) p++
  if (isWorkbenchStageDone('entities') || extractionStepReady.value) p++
  if (prodStepDone('chars')) p++
  if (prodStepDone('scenes')) p++
  if (isWorkbenchStageDone('storyboards') || storyboardStepReady.value) p++
  if (prodStepDone('dubbing')) p++
  if (prodStepDone('audio')) p++
  if (prodStepDone('shots')) p++
  if (isWorkbenchStageDone('review') || (reviewableStoryboardCount.value > 0 && reviewPendingCount.value === 0)) p++
  if (prodStepDone('videos')) p++
  if (prodStepDone('compose')) p++
  if (isWorkbenchStageDone('merge') || mergeUrl.value) p++
  return p
})

function getCharacterVoiceId(char) {
  return String(char?.voice_style || char?.voiceStyle || '').trim()
}

function getCharacterVoiceSampleUrl(char) {
  return String(char?.voice_sample_url || char?.voiceSampleUrl || '').trim()
}

function parseRetryDelayMs(message) {
  const text = String(message || '')
  const retryInMatch = text.match(/retry in\s+([0-9]+(?:\.[0-9]+)?)s/i)
  if (retryInMatch) return Math.max(1000, Math.ceil(Number(retryInMatch[1]) * 1000) + 1000)
  const retryDelayMatch = text.match(/"retryDelay"\s*:\s*"([0-9]+)s"/i)
  if (retryDelayMatch) return Math.max(1000, Number(retryDelayMatch[1]) * 1000 + 1000)
  return 0
}

function isRetryableVoiceSampleError(error) {
  const text = String(error?.message || error || '')
  return /429|resource_exhausted|quota exceeded|rate[- ]?limit/i.test(text)
}

async function updateCharVoice(charId, voiceId) {
  const c = chars.value.find(ch => ch.id === charId)
  if (!c) return
  const nextVoiceId = String(voiceId || '').trim()
  const nextProvider = String(activeAudioProvider.value || '')
  const prevVoiceId = getCharacterVoiceId(c)
  const prevProvider = String(c.voice_provider || c.voiceProvider || '')
  const prevSampleUrl = getCharacterVoiceSampleUrl(c)

  if (nextVoiceId === prevVoiceId && nextProvider === prevProvider) return

  c.voice_style = nextVoiceId
  c.voiceStyle = nextVoiceId
  c.voice_provider = nextProvider
  c.voiceProvider = nextProvider
  c.voice_sample_url = ''
  c.voiceSampleUrl = ''

  try {
    await characterAPI.update(charId, { voice_style: nextVoiceId, voice_provider: nextProvider || undefined })
  } catch (e) {
    c.voice_style = prevVoiceId
    c.voiceStyle = prevVoiceId
    c.voice_provider = prevProvider
    c.voiceProvider = prevProvider
    c.voice_sample_url = prevSampleUrl
    c.voiceSampleUrl = prevSampleUrl
    toast.error(e.message)
  }
}
function getVoiceProfile(voiceId) {
  return voiceProfiles.value.find(v => v.id === voiceId) || null
}

const selectedSb = ref(null)
const pendingDeleteShot = ref(null)
const deletingShot = ref(false)
const { routeSelectedShotId } = useEpisodeWorkbenchRouteSync({
  route,
  router,
  panel,
  scriptStep,
  prodTab,
  prodTabDefs,
  selectedStoryboard: selectedSb,
})
const shotTypes = [...episodeMessages.shotTypes]
const shotAngles = [...episodeMessages.shotAngles]
const shotMovements = [...episodeMessages.shotMovements]
function requestDeleteShot(sb) {
  pendingDeleteShot.value = sb
}

function closeDeleteShotDialog() {
  if (deletingShot.value) return
  pendingDeleteShot.value = null
}

function getDeleteShotTitle(sb) {
  if (!sb) return ''
  const index = sbs.value.indexOf(sb)
  const number = index >= 0
    ? index + 1
    : Number(sb?.storyboard_number || sb?.storyboardNumber || sb?.id || 0)
  return sb.title || t('episode.storyboardDetail.shotTitleFallback', { number })
}

async function confirmDeleteShot() {
  const sb = pendingDeleteShot.value
  if (!sb) return
  const idx = sbs.value.indexOf(sb)
  deletingShot.value = true
  try {
    await storyboardAPI.del(sb.id)
    pendingDeleteShot.value = null
    await refresh()
    if (sbs.value.length) selectedSb.value = sbs.value[Math.min(Math.max(idx, 0), sbs.value.length - 1)]
    else selectedSb.value = null
  } catch (e) {
    toast.error(e.message)
  } finally {
    deletingShot.value = false
  }
}

watch(rawContent, v => { localRaw.value = v }, { immediate: true })
watch(scriptContent, v => { localScript.value = v }, { immediate: true })

async function refresh() {
  try {
    const previousSelectedStoryboardId = Number(selectedSb.value?.id || 0) || routeSelectedShotId.value || null
    drama.value = await dramaAPI.get(dramaId)
    const ep = drama.value.episodes?.find(e => (e.episode_number || e.episodeNumber) === episodeNumber)
    if (ep) {
      episode.value = ep
      try { episodeAudioCues.value = await audioCuesAPI.list('episode', ep.id) } catch { episodeAudioCues.value = [] }
      try { chars.value = await episodeAPI.characters(ep.id) } catch { chars.value = [] }
      try { scenes.value = await episodeAPI.scenes(ep.id) } catch { scenes.value = [] }
      try { propsItems.value = await episodeAPI.props(ep.id) } catch { propsItems.value = [] }
      sbs.value = await episodeAPI.storyboards(ep.id)
      pruneFailedComposeMessages()
      if (sbs.value.length) {
        selectedSb.value = previousSelectedStoryboardId
          ? sbs.value.find(item => Number(item?.id || 0) === previousSelectedStoryboardId) || sbs.value[0]
          : selectedSb.value
            ? sbs.value.find(item => Number(item?.id || 0) === Number(selectedSb.value?.id || 0)) || sbs.value[0]
            : sbs.value[0]
      } else {
        selectedSb.value = null
      }

      const epHasContent = !!(episode.value?.content)
      const epHasScript = !!(episode.value?.script_content || episode.value?.scriptContent)
      const epHasSbs = sbs.value.length > 0
      const epHasExtraction = hasExtractedEntities.value

      if (epHasSbs) scriptStep.value = 4
      else if (epHasScript && epHasExtraction) scriptStep.value = 2
      else if (epHasScript || epHasContent) scriptStep.value = 1
      else scriptStep.value = 0
      await refreshGenerationHistory()
      await loadLatestGridImage()
    }
  } catch (e) {
    toast.error(e.message)
  }
    try { mergeData.value = await mergeAPI.status(epId.value) } catch {}
    try { dramaMergeData.value = await mergeAPI.statusDrama(dramaId) } catch {}
    if (epId.value) {
      try { await workbench.refreshWorkbenchTelemetry() } catch {}
    }
  }

async function saveRaw() {
  await episodeAPI.update(epId.value, { content: localRaw.value })
  episode.value.content = localRaw.value
}
async function saveRawManually() {
  await saveRaw()
  toast.success(episodeMessages.script.raw.saved)
}
async function saveScr() {
  await episodeAPI.update(epId.value, { script_content: localScript.value })
  episode.value.script_content = localScript.value
}
async function doRewrite() {
  if (!ensureServiceReady('text')) return
  await saveRaw()
  const result = await runAgent('script_rewriter', episodeMessages.agentPrompts.rewrite, dramaId, epId.value)
  if (!result) return
  await refresh()
}
async function skipRewrite() {
  const raw = (localRaw.value || rawContent.value || '').trim()
  if (!raw) {
    toast.warning(episodeMessages.toasts.fillRawFirst)
    return
  }
  localScript.value = raw
  await saveScr()
  toast.success(episodeMessages.toasts.skipRewrite)
  scriptStep.value = 2
}
async function doExtract() {
  if (!ensureServiceReady('text')) return
  await saveScr()
  const result = await runAgent('extractor', episodeMessages.agentPrompts.extract, dramaId, epId.value)
  if (!result) return
  await refresh()
  if (!chars.value.length && !scenes.value.length && !propsItems.value.length) {
    toast.warning(episodeMessages.toasts.extractEmpty)
    return
  }
  toast.success(t('episode.toasts.extractDone', {
    characters: chars.value.length,
    scenes: scenes.value.length,
    props: propsItems.value.length,
  }))
}
async function doVoice() {
  if (!ensureServiceReady('text')) return
  if (!chars.value.length) {
    scriptStep.value = 2
    toast.warning(episodeMessages.toasts.extractFirst)
    return
  }
  const result = await runAgent('voice_assigner', episodeMessages.agentPrompts.voice, dramaId, epId.value)
  if (!result) return
  await refresh()
  if (!charsVoiced.value) {
    toast.warning(episodeMessages.toasts.voiceNoChanges)
    return
  }
  toast.success(t('episode.toasts.voiceAssigned', { count: charsVoiced.value }))
}
async function batchGenSamples() {
  if (!ensureServiceReady('audio')) return
  const pending = chars.value.filter(c => getCharacterVoiceId(c) && !getCharacterVoiceSampleUrl(c))
  if (!pending.length) {
    toast.info(charsVoiced.value ? episodeMessages.toasts.voiceSamplesReady : episodeMessages.toasts.assignVoiceFirst)
    return
  }

  let okCount = 0
  let failCount = 0

  for (const char of pending) {
    let attempt = 0
    let generated = false
    while (attempt < 3 && !generated) {
      attempt += 1
      try {
        await characterAPI.voiceSample(char.id, epId.value)
        okCount += 1
        generated = true
      } catch (e) {
        if (attempt < 3 && isRetryableVoiceSampleError(e)) {
          const retryDelayMs = parseRetryDelayMs(e?.message)
          if (retryDelayMs > 0) {
            await sleep(retryDelayMs)
            continue
          }
        }
        failCount += 1
        break
      }
    }
    await refresh()
  }

  if (okCount) toast.success(t('episode.toasts.voiceSamplesGenerated', { count: okCount }))
  if (failCount) toast.error(t('episode.toasts.voiceSamplesFailed', { count: failCount }))
}
function doBreakdown() {
  if (!ensureServiceReady('text')) return
  const cfg = effectiveVideoConfig.value
  const label = cfg ? `${cfg.name} (${cfg.provider})` : episodeCommon.defaultConfig
  runAgent('storyboard_breaker', t('episode.agentPrompts.storyboard', { label }), dramaId, epId.value).then((result) => {
    if (!result) return
    refresh()
  })
}
async function genSample(id) {
  if (!ensureServiceReady('audio')) return
  try {
    await characterAPI.voiceSample(id, epId.value)
    toast.success(episodeMessages.toasts.voiceSampleReady)
    refresh()
  } catch (e) { toast.error(e.message) }
}
async function addShot() {
  await storyboardAPI.create({
    episode_id: epId.value,
    storyboard_number: sbs.value.length + 1,
    title: t('episode.storyboardDetail.newShotTitle', { number: sbs.value.length + 1 }),
    duration: 10,
  })
  refresh()
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function buildCharacterImagePrompt(char) {
  return composeCharacterImagePrompt(char)
}

function buildSceneImagePrompt(scene) {
  return composeSceneImagePrompt(scene)
}

function getCharacterPrompt(char) {
  return buildCharacterImagePrompt(char)
}

function getScenePrompt(scene) {
  return buildSceneImagePrompt(scene)
}

function getShotFramePrompt(sb, frameType) {
  return buildShotImagePrompt(sb, frameType)
}

function getShotVideoPrompt(sb) {
  return composeShotVideoPrompt({
    storyboard: sb,
    scene: getStoryboardScene(sb),
    characters: getStoryboardCharacters(sb),
  })
}

async function copyPromptValue(value) {
  const text = String(value || '').trim()
  if (!text) {
    toast.warning(episodeMessages.toasts.promptUnavailable)
    return
  }
  try {
    await copyText(text)
    toast.success(episodeMessages.toasts.promptCopied)
  } catch (e) {
    toast.error(e?.message || episodeMessages.toasts.promptUnavailable)
  }
}

async function genCharImg(id) {
  if (!ensureServiceReady('image')) return
  try {
    const char = chars.value.find(item => item.id === id)
    const prompt = char ? getCharacterPrompt(char) : ''
    startCharImage(id)
    await characterAPI.generateImage(id, epId.value, prompt)
    toast.success(episodeMessages.toasts.charImageGenerating)
    await refresh()
    void monitorImageGeneration({ kind: 'character', id })
  } catch (e) {
    clearCharImagePending(id)
    toast.error(e.message)
  }
}
function batchCharImages() {
  if (!canBatchCharImages.value) {
    toast.info(episodeMessages.production.chars.emptyTitle)
    return
  }
  if (!ensureServiceReady('image')) return
  const items = visualChars.value
    .filter(c => !(c.image_url || c.imageUrl))
    .map(c => ({ id: c.id, prompt: getCharacterPrompt(c) }))
  const ids = items.map(item => item.id)
  if (!ids.length) { toast.info(episodeMessages.toasts.allCharImagesReady); return }
  startCharImages(ids)
  characterAPI.batchImages(items, epId.value).then(async () => {
    toast.success(episodeMessages.toasts.charBatchGenerating)
    await refresh()
    void Promise.allSettled(ids.map(id => monitorImageGeneration({ kind: 'character', id })))
  }).catch(e => {
    ids.forEach(clearCharImagePending)
    toast.error(e.message)
  })
}
async function genSceneImg(id) {
  if (!ensureServiceReady('image')) return
  try {
    startSceneImage(id)
    await sceneAPI.generateImage(id, epId.value, '')
    toast.success(episodeMessages.toasts.sceneImageGenerating)
    await refresh()
    void monitorImageGeneration({ kind: 'scene', id })
  } catch (e) {
    clearSceneImagePending(id)
    toast.error(e.message)
  }
}
function batchSceneImages() {
  if (!canBatchSceneImages.value) {
    toast.info(t('episode.production.scenes.summary', { count: 0 }))
    return
  }
  if (!ensureServiceReady('image')) return
  const ids = scenes.value.filter(s => !(s.image_url || s.imageUrl)).map(s => s.id)
  if (!ids.length) { toast.info(episodeMessages.toasts.allSceneImagesReady); return }
  startSceneImages(ids)
  ids.forEach(id => {
    sceneAPI.generateImage(id, epId.value, '')
      .then(async () => {
        await refresh()
        void monitorImageGeneration({ kind: 'scene', id })
      })
      .catch(e => {
        clearSceneImagePending(id)
        toast.error(e.message)
      })
  })
  toast.success(episodeMessages.toasts.sceneBatchGenerating)
}

async function attachCharacterImage(char) {
  const file = await pickImageFile()
  if (!file) return
  try {
    startCharImage(char.id)
    const uploaded = await uploadAPI.image(file)
    await characterAPI.update(char.id, {
      image_url: uploaded.path,
      local_path: uploaded.path,
    })
    clearCharImagePending(char.id)
    await refresh()
    toast.success(episodeMessages.toasts.charImageAttached)
  } catch (e) {
    clearCharImagePending(char.id)
    toast.error(e.message)
  }
}

async function attachSceneImage(scene) {
  const file = await pickImageFile()
  if (!file) return
  try {
    startSceneImage(scene.id)
    const uploaded = await uploadAPI.image(file)
    await sceneAPI.update(scene.id, {
      image_url: uploaded.path,
      local_path: uploaded.path,
      status: 'completed',
    })
    clearSceneImagePending(scene.id)
    await refresh()
    toast.success(episodeMessages.toasts.sceneImageAttached)
  } catch (e) {
    clearSceneImagePending(scene.id)
    toast.error(e.message)
  }
}

function copyCharacterPrompt(char) {
  return copyPromptValue(getCharacterPrompt(char))
}

function copyScenePrompt(scene) {
  return copyPromptValue(getScenePrompt(scene))
}

const IGNORE_TTS_SPEAKERS = /^(ambiente|som ambiente|efeitos? sonoros?|efeito|sfx|sound ?effect|bgm|trilha|musica de fundo|música de fundo|ambient)$/i
const IGNORE_TTS_TEXT = /^(sem|sem dialogo|sem diálogo|sem fala|sem narracao|sem narração|dispensa voz|dispensa audio|dispensa áudio|none|null|n\/a|na|som ambiente|efeitos? sonoros?|efeito|sfx|ambiente|trilha|musica de fundo|música de fundo|ambient)$/i

  function getDialogueSpeakerRaw(sb) {
    const dialogue = sb?.spoken_dialogue?.trim() || sb?.spokenDialogue?.trim() || sb?.dialogue?.trim() || ''
    const match = dialogue.match(/^(.+?)[:：]/)
    return match ? match[1].replace(/[（(].+?[)）]/g, '').trim() : ''
  }
  
  function getDialogueText(sb) {
    const dialogue = sb?.spoken_dialogue?.trim() || sb?.spokenDialogue?.trim() || sb?.dialogue?.trim() || ''
    return dialogue ? dialogue.replace(/^.+?[:：]\s*/, '').trim() : ''
  }

function isTTSIgnorable(sb) {
  const speaker = getDialogueSpeakerRaw(sb)
  const text = getDialogueText(sb)
    const dialogue = sb?.spoken_dialogue?.trim() || sb?.spokenDialogue?.trim() || sb?.dialogue?.trim() || ''
    if (!dialogue) return true
    if (speaker && IGNORE_TTS_SPEAKERS.test(speaker)) return true
    if (!text) return true
    if (IGNORE_TTS_TEXT.test(text)) return true
  return false
}

function hasDialogue(sb) { return !isTTSIgnorable(sb) }
function hasTTS(sb) { return !!(sb?.tts_audio_url || sb?.ttsAudioUrl) }
function getTTSUrl(sb) { return sb?.tts_audio_url || sb?.ttsAudioUrl || '' }
function buildMediaSrc(relativePath, versionSeed = '') {
  const safePath = String(relativePath || '').replace(/^\/+/, '')
  if (!safePath) return ''
  const seed = String(versionSeed || safePath)
  return `/${safePath}?v=${encodeURIComponent(seed)}`
}
function getStoryboardMediaVersion(sb, fallback = '') {
  return String(
    sb?.updated_at
    || sb?.updatedAt
    || sb?.created_at
    || sb?.createdAt
    || fallback
    || '',
  )
}
function getStoryboardMediaKey(prefix, sb, relativePath = '') {
  return `${prefix}:${Number(sb?.id || 0)}:${String(relativePath || '')}:${getStoryboardMediaVersion(sb, relativePath)}`
}
function getShotVoicePrompt(sb) {
  return getDialogueText(sb) || String(sb?.dialogue || '').trim() || ''
}
function getDialogueSpeaker(sb) {
  const speaker = getDialogueSpeakerRaw(sb)
  if (!speaker) return episodeMessages.production.dubbing.narrator
  return speaker
}
async function genShotTTS(sb) {
  if (!ensureServiceReady('audio')) return
  try {
    await storyboardAPI.generateTTS(sb.id)
    toast.success(t('episode.toasts.shotVoiceReady', { number: sb.storyboard_number || sb.storyboardNumber || sb.id }))
    await refresh()
  } catch (e) { toast.error(e.message) }
}
async function batchShotTTS() {
  if (!canBatchShotVoices.value) {
    toast.info(episodeMessages.toasts.noShotVoices)
    return
  }
  if (!ensureServiceReady('audio')) return
  const pending = sbs.value.filter(sb => hasDialogue(sb) && !hasTTS(sb))
  if (!pending.length) {
    toast.info(ttsEligibleCount.value ? episodeMessages.toasts.allShotVoicesReady : episodeMessages.toasts.noShotVoices)
    return
  }
  const results = await Promise.allSettled(pending.map(sb => storyboardAPI.generateTTS(sb.id)))
  const okCount = results.filter(r => r.status === 'fulfilled').length
  const failCount = results.length - okCount
  if (okCount) toast.success(t('episode.toasts.shotVoicesGenerated', { count: okCount }))
  if (failCount) toast.error(t('episode.toasts.shotVoicesFailed', { count: failCount }))
  await refresh()
}

async function attachShotAudio(sb) {
  const file = await pickAudioFile()
  if (!file) return
  try {
    const uploaded = await uploadAPI.audio(file)
    await storyboardAPI.update(sb.id, {
      tts_audio_url: uploaded.path,
      status: 'completed',
    })
    await refresh()
    toast.success(t('episode.toasts.shotAudioAttached', { number: sb.storyboard_number || sb.storyboardNumber || sb.id }))
  } catch (e) {
    toast.error(e.message)
  }
}

function copyShotVoicePrompt(sb) {
  return copyPromptValue(getShotVoicePrompt(sb))
}

function getFirstFrame(s) { return s?.first_frame_image || s?.firstFrameImage || null }
function getLastFrame(s) { return s?.last_frame_image || s?.lastFrameImage || null }
function getStoryboardCover(s) { return s?.composed_image || s?.composedImage || getFirstFrame(s) || getLastFrame(s) || null }
function getVideoUrl(s) { return s?.video_url || s?.videoUrl || null }
function getComposedVideoUrl(s) { return s?.composed_video_url || s?.composedVideoUrl || null }
function hasImg(s) { return !!getStoryboardCover(s) }
function hasVid(s) { return !!getVideoUrl(s) }
function hasComposeSource(s) { return hasVid(s) || hasImg(s) }
function hasComposed(s) { return !!getComposedVideoUrl(s) }

function getShotReferenceImages(sb) {
  const refs = []
  const pushRef = (value) => {
    if (!value || refs.includes(value) || refs.length >= 6) return
    refs.push(value)
  }
  const sceneId = sb?.scene_id || sb?.sceneId
  const scene = scenes.value.find(item => item.id === sceneId)
  pushRef(scene?.image_url || scene?.imageUrl)
  for (const charId of getStoryboardCharacterIds(sb)) {
    const char = chars.value.find(item => item.id === charId)
    pushRef(char?.image_url || char?.imageUrl)
  }
  for (const ref of getRefs(sb)) {
    pushRef(ref)
  }
  const first = getFirstFrame(sb)
  const last = getLastFrame(sb)
  pushRef(first)
  pushRef(last)
  return refs.filter(Boolean).slice(0, 6)
}

function buildShotImagePrompt(sb, frameType) {
  return composeShotFramePrompt({
    storyboard: sb,
    frameType,
    scene: getStoryboardScene(sb),
    characters: getStoryboardCharacters(sb),
  })
}

async function genShotFrame(sb, frameType) {
  if (!ensureServiceReady('image')) return
  const prompt = buildShotImagePrompt(sb, frameType)
  const referenceImages = getShotReferenceImages(sb)
  try {
    startShotFrame(sb.id, frameType)
    const body = {
      storyboard_id: sb.id,
      drama_id: dramaId,
      prompt,
      frame_type: frameType,
      reference_images: referenceImages.length ? referenceImages : undefined,
    }
    await imageAPI.generate(body)
    toast.success(frameType === 'first_frame' ? episodeMessages.toasts.firstFrameGenerating : episodeMessages.toasts.lastFrameGenerating)
    await refresh()
    void monitorImageGeneration({ kind: 'storyboard', id: sb.id, frameType })
  } catch (e) {
    clearShotFramePending(sb.id, frameType)
    toast.error(e.message)
  }
}

async function attachShotFrame(sb, frameType) {
  const file = await pickImageFile()
  if (!file) return
  try {
    startShotFrame(sb.id, frameType)
    const uploaded = await uploadAPI.image(file)
    await storyboardAPI.update(sb.id, {
      [frameType === 'last_frame' ? 'last_frame_image' : 'first_frame_image']: uploaded.path,
      status: 'completed',
    })
    clearShotFramePending(sb.id, frameType)
    await refresh()
    toast.success(t('episode.toasts.shotFrameAttached', {
      number: sb.storyboard_number || sb.storyboardNumber || sb.id,
      label: frameType === 'last_frame' ? episodeMessages.production.shots.lastFrame : episodeMessages.production.shots.firstFrame,
    }))
  } catch (e) {
    clearShotFramePending(sb.id, frameType)
    toast.error(e.message)
  }
}

function copyShotFramePrompt(sb, frameType) {
  return copyPromptValue(getShotFramePrompt(sb, frameType))
}

async function genVid(sb) {
  if (!ensureServiceReady('video')) return
  const params = {
    storyboard_id: sb.id,
    drama_id: dramaId,
    prompt: getShotVideoPrompt(sb),
    duration: Number(sb.duration || 5),
  }
  try {
    startVideo(sb.id)
    const generation = await videoAPI.generate(params)
    toast.success(episodeMessages.toasts.videoGenerating)
    await refresh()
    pollVideoGeneration(generation?.id, sb.id)
  } catch (e) {
    clearVideoPending(sb.id)
    toast.error(e.message)
  }
}

async function attachShotVideo(sb) {
  const file = await pickVideoFile()
  if (!file) return
  try {
    startVideo(sb.id)
    const uploaded = await uploadAPI.video(file)
    await storyboardAPI.update(sb.id, {
      video_url: uploaded.path,
      status: 'completed',
    })
    clearVideoPending(sb.id)
    await refresh()
    toast.success(episodeMessages.toasts.videoAttached)
  } catch (e) {
    clearVideoPending(sb.id)
    toast.error(e.message)
  }
}

function copyShotVideoPrompt(sb) {
  return copyPromptValue(getShotVideoPrompt(sb))
}

async function doCompose(sb) {
  if (!hasComposeSource(sb)) return
  if (hasDialogue(sb) && !hasTTS(sb)) {
    revealComposeValidation.value = true
    const issue = workbenchComposeValidation.value.issues.find(item => Number(item.entity_id || 0) === Number(sb.id))
    toast.warning(issue?.message || episodeMessages.toasts.composeFailed)
    return
  }
  const composeAudioIssue = workbenchComposeValidation.value.issues.find((item) => {
    if (String(item?.severity || 'error') !== 'error') return false
    const entityType = String(item.entity_type || '')
    const entityId = Number(item.entity_id || 0)
    const sceneId = Number(sb?.scene_id || sb?.sceneId || 0)
    return entityType === 'episode'
      || (entityType === 'scene' && sceneId > 0 && entityId === sceneId)
      || (entityType === 'storyboard' && entityId === Number(sb.id))
  })
  if (composeAudioIssue) {
    revealComposeValidation.value = true
    toast.warning(composeAudioIssue.message || episodeMessages.toasts.composeFailed)
    return
  }
  try {
    revealComposeValidation.value = false
    startCompose(sb.id)
    await composeAPI.shot(sb.id)
    toast.success(episodeMessages.toasts.composeDone)
    clearComposePending(sb.id)
    refresh()
  } catch (e) {
    setComposeFailed(sb.id, e.message)
    toast.error(e.message)
  }
}
function batchVideos() {
  if (!ensureServiceReady('video')) return
  const pendingIds = sbs.value.filter(s => !hasVid(s)).map(s => s.id)
  pendingIds.forEach(id => {
    const sb = sbs.value.find(item => item.id === id)
    if (sb) genVid(sb)
  })
  if (pendingIds.length) {
    startVideos(pendingIds)
    watchAsyncResult(() => pendingIds.every(id => {
      const target = sbs.value.find(s => s.id === id)
      const done = !!(target?.video_url || target?.videoUrl)
      if (done) clearVideoPending(id)
      return done
    }), 80, 4000)
  }
}
async function batchCompose() {
  if (workbenchComposeValidation.value.blocked) {
    revealComposeValidation.value = true
    toast.warning(workbenchComposeValidation.value.issues[0]?.message || episodeMessages.toasts.composeFailed)
    return
  }
  revealComposeValidation.value = false
  await composeAPI.all(epId.value)
  setPendingComposeIds(sbs.value.filter(sb => hasComposeSource(sb)).map(sb => sb.id))
  toast.success(episodeMessages.toasts.composeBatchStarted)
  pollComposeStatus(epId.value)
}
async function doMerge() {
  if (workbenchMergeValidation.value.blocked) {
    revealMergeValidation.value = true
    toast.warning(workbenchMergeValidation.value.issues[0]?.message || episodeMessages.toasts.mergeFailed)
    return
  }
  if (isMergeRunning.value) return
  revealMergeValidation.value = false
  mergeData.value = { ...(mergeData.value || {}), status: 'processing' }
  await mergeAPI.merge(epId.value, { transition: mergeTransition.value })
  toast.success(episodeMessages.toasts.mergeStarted)
  const poll = setInterval(async () => {
    try { mergeData.value = await mergeAPI.status(epId.value) } catch {}
    if (mergeData.value?.status === 'completed' || mergeData.value?.status === 'failed') {
      clearInterval(poll)
      mergeData.value.status === 'completed' ? toast.success(episodeMessages.toasts.mergeDone) : toast.error(episodeMessages.toasts.mergeFailed)
      try { await workbench.refreshWorkbenchTelemetry() } catch {}
    }
  }, 3000)
}

async function doDramaMerge() {
  if (finalizedDramaEpisodeCount.value < 2) {
    toast.warning(episodeMessages.toasts.dramaMergeNeedEpisodes)
    return
  }
  if (isDramaMergeRunning.value) return
  dramaMergeData.value = { ...(dramaMergeData.value || {}), status: 'processing' }
  await mergeAPI.mergeDrama(dramaId, { transition: dramaMergeTransition.value })
  toast.success(episodeMessages.toasts.dramaMergeStarted)
  const poll = setInterval(async () => {
    try { dramaMergeData.value = await mergeAPI.statusDrama(dramaId) } catch {}
    if (dramaMergeData.value?.status === 'completed' || dramaMergeData.value?.status === 'failed' || dramaMergeData.value?.status === 'stale') {
      clearInterval(poll)
      if (dramaMergeData.value?.status === 'completed') toast.success(episodeMessages.toasts.dramaMergeDone)
      else toast.error(episodeMessages.toasts.dramaMergeFailed)
    }
  }, 3000)
}

function getRefs(sb) {
  const raw = sb.reference_images || sb.referenceImages
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

async function loadConfigs() {
  try {
    const [txtCfgs, imgCfgs, vidCfgs, audCfgs] = await Promise.all([
      aiConfigAPI.list('text'),
      aiConfigAPI.list('image'),
      aiConfigAPI.list('video'),
      aiConfigAPI.list('audio'),
    ])
    textConfigs.value = txtCfgs || []
    imageConfigs.value = imgCfgs || []
    videoConfigs.value = vidCfgs || []
    audioConfigs.value = audCfgs || []
  } catch (e) { console.error('Failed to load AI configs', e) }
}

function inferVoiceGender(name, desc = []) {
  const text = `${name} ${Array.isArray(desc) ? desc.join(' ') : ''}`
  if (/(\bhomem\b|\bmasculin(?:a|o)?\b|\bboy\b|\bman\b|\bmale\b)/i.test(text)) return episodeMessages.voiceProfiles.male
  if (/(\bmulher\b|\bfeminin(?:a|o)?\b|\bgirl\b|\bwoman\b|\bfemale\b)/i.test(text)) return episodeMessages.voiceProfiles.female
  return episodeMessages.voiceProfiles.neutral
}

function normalizeVoiceGenderLabel(value) {
  const text = String(value || '').toLowerCase()
  if (['male', 'masculina', 'masculino', 'masculine'].includes(text)) return episodeMessages.voiceProfiles.male
  if (['female', 'feminina', 'feminino', 'feminine'].includes(text)) return episodeMessages.voiceProfiles.female
  if (['neutral', 'neutra', 'neutro', 'androgynous', 'androgina', 'androgino'].includes(text)) return episodeMessages.voiceProfiles.neutral
  return ''
}

function mapVoiceProfile(v) {
  const desc = Array.isArray(v.description) ? v.description : []
  const language = v.language || 'multilingue'
  return {
    id: v.voice_id,
    label: v.voice_name || v.voice_id,
    gender: normalizeVoiceGenderLabel(v.gender) || inferVoiceGender(v.voice_name || v.voice_id, desc),
    traits: desc.length ? desc.slice(0, 2).join(', ') : t('episode.voiceProfiles.defaultTraits', { language }),
    suitable: desc.length > 2 ? desc.slice(2).join(', ') : t('episode.voiceProfiles.defaultSuitable', { language }),
  }
}

async function loadVoices() {
  try {
    const provider = activeAudioProvider.value
    const rows = await voicesAPI.list(provider)
    voiceProfiles.value = rows?.length ? rows.map(mapVoiceProfile) : fallbackVoiceProfiles
  } catch (e) {
    console.error('Failed to load voices', e)
    voiceProfiles.value = fallbackVoiceProfiles
  }
}

watch([lockedAudioConfigId, audioConfigs], () => { loadVoices() }, { deep: true })
onMounted(() => { refresh(); loadConfigs(); loadVoices() })
</script>

<style scoped>
/* ===== Studio Layout ===== */
.studio {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  padding: 14px;
  gap: 12px;
  background:
    radial-gradient(circle at top left, rgba(255,255,255,0.7), transparent 28%),
    linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0)),
    var(--bg-base);
}

.studio-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
  padding: 8px 12px;
  border-radius: 18px;
  background: rgba(252, 253, 255, 0.84);
  border: 1px solid rgba(27, 41, 64, 0.08);
  box-shadow: 0 14px 36px rgba(20, 32, 54, 0.07), 0 3px 10px rgba(20, 32, 54, 0.04);
  backdrop-filter: blur(16px);
}

.studio-topbar-main,
.sidebar,
.main {
  background: rgba(252, 253, 255, 0.84);
  border: 1px solid rgba(27, 41, 64, 0.08);
  box-shadow: 0 18px 48px rgba(20, 32, 54, 0.08), 0 4px 14px rgba(20, 32, 54, 0.05);
  backdrop-filter: blur(16px);
}

.studio-topbar-main {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: 0;
  box-shadow: none;
  backdrop-filter: none;
  background: transparent;
  min-width: 0;
  overflow: hidden;
  width: 100%;
}

.back-btn.topbar-back {
  width: auto;
  min-width: 0;
  max-width: min(42vw, 136px);
  height: 28px;
  padding: 0 9px;
  border-radius: 999px;
  gap: 5px;
  white-space: nowrap;
  font-size: 11px;
}

.topbar-back svg {
  flex-shrink: 0;
}

.topbar-back-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.studio-identity {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  overflow: hidden;
}
.studio-overline {
  display: none;
  font-size: 8px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-3);
}

.studio-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.studio-title {
  min-width: 0;
  max-width: 100%;
  font-size: 14px;
  line-height: 1;
  letter-spacing: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.studio-episode-chip {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 7px;
  border-radius: 999px;
  background: rgba(19, 51, 121, 0.08);
  color: var(--accent-text);
  font-size: 9px;
  font-weight: 600;
}

.studio-meta-row {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
  min-width: 0;
}

.studio-meta-pill {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(18, 25, 42, 0.05);
  color: var(--text-2);
  font-size: 8px;
  font-weight: 600;
  white-space: nowrap;
}

.studio-meta-pill.is-stage {
  background: rgba(19, 51, 121, 0.08);
  color: var(--accent-text);
}
.studio-meta-pill.is-progress {
  background: rgba(45, 122, 69, 0.08);
  color: var(--success);
}
.studio-meta-inline {
  font-size: 9px;
  color: var(--text-3);
  font-weight: 600;
  white-space: nowrap;
}

.studio-topbar-side {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.studio-actions {
  display: flex;
  gap: 6px;
}
.studio-topbar .btn {
  height: 28px;
  padding: 0 10px;
  font-size: 11px;
  white-space: nowrap;
}

.studio-body {
  display: grid;
  grid-template-columns: 244px minmax(0, 1fr);
  gap: 10px;
  min-height: 0;
  flex: 1;
}

/* ===== Sidebar ===== */
.sidebar {
  width: auto;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  border-radius: var(--radius);
}
.back-btn {
  width: 40px; height: 40px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid rgba(27, 41, 64, 0.1); border-radius: var(--radius);
  background: rgba(255,255,255,0.8); color: var(--text-2);
  cursor: pointer; transition: all 0.15s;
  box-shadow: var(--shadow-xs);
}
.back-btn:hover { background: #fff; color: var(--text-0); }

/* Pipeline Nav */
.pipeline { flex: 1; overflow-y: auto; padding: 16px 14px 12px; display: flex; flex-direction: column; gap: 12px; }
.pipe-section { display: flex; flex-direction: column; gap: 4px; }
.pipe-section-label {
  font-size: 10px; font-weight: 600; color: #95a1b6;
  text-transform: uppercase; letter-spacing: 0.1em;
  padding: 2px 8px 3px;
}
.pipe-item {
  display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px;
  padding: 7px 10px;
  border-radius: var(--radius);
  font-size: 12px; font-weight: 600;
  background: none; border: 1px solid transparent; color: var(--text-2); cursor: pointer;
  transition: all 0.14s; width: 100%; text-align: left;
}
.pipe-item:hover { background: rgba(255,255,255,0.3); color: var(--text-0); }
.pipe-item.active {
  background: rgba(255,255,255,0.94);
  color: var(--text-0);
  border-color: rgba(27, 41, 64, 0.05);
  box-shadow: 0 8px 18px rgba(19, 33, 56, 0.045);
}
.pipe-item.done { color: var(--success); }
.pipe-item.partial { color: var(--warning); }
.pipe-item.blocked { color: var(--error); }
.pipe-item.not-applicable { color: var(--text-3); }
.pipe-item-sub {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  padding: 7px 10px;
  position: relative;
  min-height: 42px;
}

.pipe-item-sub:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 18px;
  top: 25px;
  bottom: -7px;
  width: 1px;
  background: rgba(27, 41, 64, 0.07);
}

.pipe-icon {
  width: 17px; height: 17px; border-radius: 999px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(246,248,252,0.98); border: 1px solid rgba(18,25,42,0.08);
  color: #aab4c6; flex-shrink: 0; transition: all 0.15s;
  position: relative;
  z-index: 1;
}
.pipe-item.active .pipe-icon { background: rgba(19, 51, 121, 0.07); border-color: rgba(19, 51, 121, 0.1); color: var(--accent-text); }
.pipe-item.done .pipe-icon { background: rgba(45, 122, 69, 0.96); border-color: rgba(45,122,69,0.18); color: #fff; }
.pipe-item.partial .pipe-icon { background: rgba(245, 158, 11, 0.14); border-color: rgba(245, 158, 11, 0.28); color: var(--warning); }
.pipe-item.blocked .pipe-icon { background: rgba(210, 79, 102, 0.12); border-color: rgba(210, 79, 102, 0.28); color: var(--error); }
.pipe-item.not-applicable .pipe-icon { background: rgba(143, 160, 184, 0.12); border-color: rgba(143, 160, 184, 0.22); color: var(--text-3); }
.icon-active { background: var(--accent-dark) !important; border-color: var(--accent-dark) !important; color: #fff !important; }
.icon-done { background: var(--success) !important; border-color: var(--success) !important; color: #fff !important; }
.icon-partial { background: #f59e0b !important; border-color: #f59e0b !important; color: #fff !important; }
.icon-blocked { background: var(--error) !important; border-color: var(--error) !important; color: #fff !important; }
.icon-not-applicable { background: rgba(143, 160, 184, 0.22) !important; border-color: rgba(143, 160, 184, 0.3) !important; color: var(--text-3) !important; }
.pipe-partial-mark { width: 7px; height: 2px; border-radius: 999px; background: currentColor; display: block; }
.pipe-blocked-mark { font-size: 10px; font-weight: 600; line-height: 1; }
.pipe-na-mark { width: 5px; height: 5px; border-radius: 999px; background: currentColor; opacity: 0.8; display: block; }

.pipe-label { flex: 1; font-size: 11.5px; }
.pipe-copy { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.pipe-sub {
  font-size: 8.5px;
  line-height: 1.35;
  color: var(--text-3);
  font-weight: 500;
}
.pipe-badge {
  font-size: 9px; font-weight: 600; padding: 1px 5px;
  border-radius: 99px; background: var(--bg-3); color: var(--text-3);
  font-family: var(--font-mono);
}
.pipe-badge.badge-done { background: var(--success-bg); color: var(--success); }
.pipe-spinner { width: 10px; height: 10px; border: 1.5px solid var(--accent-bg); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }

/* Sidebar Bottom */
.sidebar-bottom {
  padding: 12px 14px 14px;
  border-top: 1px solid rgba(27, 41, 64, 0.08);
  display: flex; flex-direction: column; gap: 8px;
  flex-shrink: 0;
  background: linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.72));
}
.sidebar-jumper {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 3px 0 2px;
}
.sidebar-jump-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  border: none;
  background: rgba(143, 160, 184, 0.34);
  cursor: pointer;
  transition: transform 0.14s, background 0.14s, box-shadow 0.14s;
}
.sidebar-jump-dot:hover {
  transform: scale(1.08);
}
.sidebar-jump-dot.active {
  background: var(--accent-dark);
  box-shadow: 0 0 0 2px rgba(76, 125, 255, 0.14);
}
.sidebar-jump-dot.done {
  background: var(--success);
}
.sidebar-jump-dot.partial {
  background: #f59e0b;
}
.sidebar-jump-dot.blocked {
  background: var(--error);
}
.sidebar-jump-dot.not-applicable {
  background: rgba(143, 160, 184, 0.56);
}
.sidebar-jump-dot.active.done {
  background: #1e3f8a;
}
.progress-wrap { display: flex; flex-direction: column; gap: 5px; }
.progress-head { display: flex; justify-content: space-between; }
.progress-label { font-size: 10.5px; color: var(--text-3); font-weight: 500; }
.progress-val { font-size: 10.5px; color: var(--text-2); font-family: var(--font-mono); font-weight: 600; }
.progress-track { height: 6px; background: rgba(194, 207, 227, 0.92); border-radius: 99px; overflow: hidden; }
.progress-fill { height: 100%; background: var(--accent-gradient); border-radius: 99px; transition: width 0.5s var(--ease-out); }
.refresh-btn {
  width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 8px; font-size: 11.5px; color: var(--text-2);
  background: rgba(255,255,255,0.86); border: 1px solid rgba(27, 41, 64, 0.08); border-radius: 999px;
  cursor: pointer; transition: all 0.15s;
}
.refresh-btn:hover { background: #fff; color: var(--text-0); }

/* ===== Main Content ===== */
.main { flex: 1; display: flex; flex-direction: column; overflow-x: hidden; overflow-y: auto; min-width: 0; min-height: 0; border-radius: 30px; }
.content-panel {
  flex: 1 0 auto;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  min-height: clamp(320px, 46vh, 680px);
}
.stage-subnav {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(27, 41, 64, 0.08);
  background: linear-gradient(180deg, rgba(255,255,255,0.86), rgba(255,255,255,0.52));
  overflow-x: auto;
  flex-shrink: 0;
}
.stage-subnav-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid rgba(27, 41, 64, 0.08);
  background: rgba(255,255,255,0.7);
  color: var(--text-2);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.15s ease;
}
.stage-subnav-item:hover {
  background: #fff;
  color: var(--text-0);
}
.stage-subnav-item.active {
  background: rgba(19, 51, 121, 0.08);
  border-color: rgba(19, 51, 121, 0.12);
  color: #1e3f8a;
}
.stage-subnav-item.done {
  color: var(--text-1);
}
.stage-subnav-item.partial {
  color: var(--warning);
  border-color: rgba(245, 158, 11, 0.18);
}
.stage-subnav-item.blocked {
  color: var(--error);
  border-color: rgba(210, 79, 102, 0.2);
}
.stage-subnav-item.not-applicable {
  color: var(--text-3);
  border-color: rgba(143, 160, 184, 0.18);
}
.stage-subnav-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--success);
  box-shadow: 0 0 0 4px rgba(45, 122, 69, 0.1);
}
.stage-subnav-dot.partial {
  background: #f59e0b;
  box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.12);
}
.stage-subnav-dot.blocked {
  background: var(--error);
  box-shadow: 0 0 0 4px rgba(210, 79, 102, 0.12);
}
.stage-subnav-dot.not-applicable {
  background: rgba(143, 160, 184, 0.7);
  box-shadow: 0 0 0 4px rgba(143, 160, 184, 0.12);
}

/* Toolbar */
.step-toolbar {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 14px; border-bottom: 1px solid rgba(27, 41, 64, 0.08);
  background: linear-gradient(180deg, rgba(255,255,255,0.8), rgba(255,255,255,0.42)); flex-shrink: 0;
}
.prod-toolbar { background: linear-gradient(180deg, rgba(255,255,255,0.8), rgba(255,255,255,0.42)); }
.toolbar-left { display: flex; align-items: center; gap: 8px; flex: 1; }
.toolbar-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.step-indicator { display: flex; align-items: center; gap: 8px; }
.step-num {
  width: 26px; height: 26px; border-radius: 10px;
  display: inline-flex; align-items: center; justify-content: center;
  background: rgba(19, 51, 121, 0.08);
  font-family: var(--font-mono); font-size: 10px; font-weight: 600; color: var(--accent-text); letter-spacing: 0.05em;
}
.step-name { font-size: 13px; font-weight: 600; color: var(--text-1); font-family: var(--font-display); }
.char-count { font-size: 11px; color: var(--text-3); font-family: var(--font-mono); }

/* Editor Area */
.step-editor { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.fill-textarea {
  flex: 1; border: none; border-radius: 0; padding: 26px 28px;
  font-size: 13.5px; line-height: 1.9; resize: none; outline: none;
  font-family: var(--font-body); background: linear-gradient(180deg, rgba(255,255,255,0.28), rgba(255,255,255,0.12)); color: var(--text-0);
}
.fill-textarea:focus { box-shadow: none; }

/* Step Empty State */
.step-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  flex: 1; min-height: 300px; gap: 10px; padding: 46px;
  animation: fadeIn 0.3s var(--ease-out);
}
.empty-visual {
  width: 72px; height: 72px; border-radius: 22px;
  background: rgba(255,255,255,0.8); color: var(--accent);
  border: 1px solid rgba(27, 41, 64, 0.08);
  box-shadow: var(--shadow-sm);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 8px;
}
.empty-title { font-size: 22px; font-weight: 600; font-family: var(--font-display); color: var(--text-0); }
.empty-desc { font-size: 13px; color: var(--text-2); max-width: 420px; text-align: center; line-height: 1.8; }
.step-empty-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: center; }

/* Step Loading */
.step-loading {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  flex: 1; gap: 12px;
}
.loading-text { font-size: 13px; color: var(--text-2); }

/* Step Navigator Bubble */
.step-bubble {
  position: static;
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px 12px;
  background: linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0.58));
  border-top: 1px solid rgba(27, 41, 64, 0.08);
  margin-top: auto;
}
.bubble-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 12px; border-radius: 999px; font-size: 11.5px; font-weight: 500;
  border: 1px solid rgba(27, 41, 64, 0.08); background: rgba(255,255,255,0.84); color: var(--text-2); cursor: pointer;
  transition: all 0.15s; white-space: nowrap;
}
.bubble-btn:hover:not(:disabled) { background: #fff; color: var(--text-0); }
.bubble-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.bubble-btn.primary { margin-left: auto; background: linear-gradient(135deg, #557ff4, #345fcc); color: #fff; box-shadow: 0 6px 16px rgba(53, 95, 206, 0.2); border-color: transparent; }
.bubble-btn.primary:hover:not(:disabled) { filter: brightness(1.08); }
.bubble-btn.primary:disabled { filter: none; box-shadow: none; opacity: 0.5; }
.bubble-dots { display: flex; gap: 7px; padding: 0 4px; }
.bubble-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: rgba(143, 160, 184, 0.4); cursor: pointer; transition: all 0.15s;
  border: none;
}
.bubble-dot.done { background: var(--success); }
.bubble-dot.partial { background: #f59e0b; }
.bubble-dot.current { background: var(--accent-dark); transform: scale(1.2); box-shadow: 0 0 0 2px rgba(76, 125, 255, 0.14); }

/* Extract grid */
.extract-stage { flex: 1; min-height: 0; overflow: hidden; padding: 12px 16px; display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 12px; align-items: stretch; }
.extract-grid { min-width: 0; min-height: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; align-items: stretch; }
.extract-summary { padding: 16px; display: flex; flex-direction: column; gap: 14px; align-self: stretch; position: sticky; top: 0; max-height: 100%; }
.extract-summary-kicker { font-size: 10px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-3); }
.extract-summary-title { font-size: 20px; line-height: 1.05; font-family: var(--font-display); color: var(--text-0); }
.extract-summary-desc { font-size: 12px; color: var(--text-2); line-height: 1.7; }
.extract-summary-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.extract-summary-stat { padding: 10px 12px; border-radius: 14px; background: rgba(19, 51, 121, 0.05); border: 1px solid rgba(19, 51, 121, 0.08); display: flex; flex-direction: column; gap: 4px; }
.extract-summary-stat span { font-size: 10px; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.08em; }
.extract-summary-stat strong { font-size: 18px; color: var(--text-0); font-family: var(--font-display); }
.extract-summary-note { padding: 10px 12px; border-radius: 14px; background: rgba(255,255,255,0.56); border: 1px solid rgba(27, 41, 64, 0.08); font-size: 11px; line-height: 1.7; color: var(--text-2); }
.extract-card { overflow: hidden; min-height: 0; display: flex; flex-direction: column; }
.extract-card-head {
  display: flex; align-items: center; gap: 8px;
  padding: 11px 14px; font-size: 12px; font-weight: 600;
  border-bottom: 1px solid var(--border); background: var(--bg-1);
  color: var(--text-1);
}
.extract-list { padding: 8px 14px; flex: 1; min-height: 0; overflow-y: auto; }
.extract-row { display: flex; align-items: center; gap: 10px; padding: 7px 0; }
.extract-row + .extract-row { border-top: 1px solid var(--border); }
.char-avatar {
  width: 30px; height: 30px; border-radius: 50%;
  background: var(--accent-bg); color: var(--accent-text);
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 600; flex-shrink: 0;
}
.scene-icon {
  width: 30px; height: 30px; border-radius: 6px;
  background: var(--bg-2); border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  color: var(--text-3); flex-shrink: 0;
}
.extract-info { min-width: 0; }
.extract-name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.extract-name { font-size: 13px; font-weight: 600; }
.extract-meta { font-size: 11px; color: var(--text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.extract-meta.wrap { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }

/* Voice grid */
.voice-stage { flex: 1; min-height: 0; overflow-y: auto; padding: 14px 16px; display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 12px; }
.voice-stage-panel {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-self: start;
  position: sticky;
  top: 0;
  min-height: 0;
  max-height: calc(100vh - 210px);
  overflow: hidden;
}
.voice-stage-kicker { font-size: 10px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-3); }
.voice-stage-title { font-size: 20px; line-height: 1.05; font-family: var(--font-display); color: var(--text-0); }
.voice-stage-desc { font-size: 12px; color: var(--text-2); line-height: 1.7; }
.voice-stage-stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.voice-stage-stat { padding: 10px 12px; border-radius: 14px; background: rgba(19, 51, 121, 0.05); border: 1px solid rgba(19, 51, 121, 0.08); display: flex; flex-direction: column; gap: 3px; }
.voice-stage-stat-label { font-size: 10px; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.08em; }
.voice-stage-stat strong { font-size: 18px; color: var(--text-0); font-family: var(--font-display); }
.voice-library-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-3);
}
.voice-library {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}
.voice-library-item { padding: 10px 12px; border-radius: 14px; background: rgba(255,255,255,0.56); border: 1px solid rgba(27, 41, 64, 0.08); display: flex; flex-direction: column; gap: 4px; }
.voice-library-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.voice-library-name { font-size: 13px; font-weight: 600; color: var(--text-0); }
.voice-library-traits { font-size: 11px; color: var(--text-1); }
.voice-library-fit { font-size: 10px; color: var(--text-3); line-height: 1.5; }

.voice-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; align-content: start; }
.voice-card { padding: 16px; display: flex; flex-direction: column; gap: 12px; border-radius: 22px; min-height: 0; }
.voice-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.voice-char { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
.voice-name { min-width: 0; flex: 1; }
.voice-name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.voice-card-copy { min-height: 58px; }
.voice-card-text { font-size: 12px; line-height: 1.7; color: var(--text-2); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.voice-select-block { display: flex; flex-direction: column; gap: 6px; }
.voice-block-label { font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-3); }
.voice-profile-card { padding: 12px; border-radius: 16px; background: linear-gradient(135deg, rgba(19, 51, 121, 0.08), rgba(255,255,255,0.78)); border: 1px solid rgba(19, 51, 121, 0.1); display: flex; flex-direction: column; gap: 4px; }
.voice-profile-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.voice-profile-name { font-size: 13px; font-weight: 600; color: var(--accent-text); }
.voice-profile-traits { font-size: 11px; color: var(--text-1); }
.voice-profile-fit { font-size: 10px; color: var(--text-2); line-height: 1.5; }
.voice-actions-row { display: flex; align-items: center; gap: 8px; }
.voice-player audio { width: 100%; height: 30px; border-radius: var(--radius); }
.char-avatar.lg { width: 38px; height: 38px; font-size: 16px; }

/* Split layout (storyboard) */
.split-layout { flex: 1; display: flex; min-height: 0; overflow: hidden; }
.shot-list { width: 296px; flex-shrink: 0; overflow-y: auto; border-right: 1px solid var(--border); background: var(--bg-0); }
.shot-list-head {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 11px 12px 10px;
  border-bottom: 1px solid rgba(27, 41, 64, 0.06);
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(10px);
}
.shot-list-title { font-size: 13px; font-weight: 600; color: var(--text-0); }
.shot-list-sub { margin-top: 3px; font-size: 11px; color: var(--text-3); line-height: 1.45; }
.shot-list-body { padding: 6px; }
.shot-item {
  position: relative; padding: 10px 11px; cursor: pointer;
  border: 1px solid transparent; border-left: 3px solid transparent;
  transition: all 0.15s;
  display: flex; flex-direction: column; gap: 5px;
  border-radius: var(--radius);
}
.shot-item + .shot-item { margin-top: 6px; }
.shot-item:hover { background: var(--bg-hover); border-color: rgba(27, 41, 64, 0.06); }
.shot-item.active {
  background: var(--bg-0);
  border-left-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent-glow);
  z-index: 1;
}
.shot-item-header { display: flex; align-items: center; gap: 8px; }
.shot-num {
  font-size: 11px; font-family: var(--font-mono); font-weight: 600;
  color: var(--accent); background: var(--accent-bg);
  padding: 2px 6px; border-radius: 4px; flex-shrink: 0;
  letter-spacing: 0.03em;
}
.shot-item.active .shot-num { background: var(--accent); color: #fff; }
.shot-status { display: flex; gap: 4px; margin-left: auto; flex-shrink: 0; }
.shot-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--bg-3); flex-shrink: 0; }
.shot-dot.has-img { background: var(--success); }
.shot-dot.has-video { background: var(--info); }
.shot-dot.has-dialogue { background: var(--warning); }
.shot-body { }
.shot-desc { font-size: 12px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; color: var(--text-1); }
.shot-item.active .shot-desc { color: var(--text-0); }
.shot-meta { display: flex; align-items: center; gap: 6px; }
.shot-location {
  font-size: 10px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.shot-dialogue {
  font-size: 10px; color: var(--text-3); margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  padding-left: 2px; border-left: 2px solid var(--border);
  padding-left: 6px;
}

.detail-panel { flex: 1; display: flex; flex-direction: column; overflow-y: auto; min-width: 0; }
.detail-head { display: flex; align-items: center; gap: 8px; padding: 9px 14px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.detail-head-copy { display: flex; flex-direction: column; gap: 2px; }
.detail-head-title { font-size: 14px; font-weight: 600; color: var(--text-0); }
.detail-head-sub { font-size: 11px; color: var(--text-3); }
.detail-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
.detail-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(220px, 0.9fr);
  gap: 12px;
  padding: 12px;
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(20,39,82,0.08), rgba(255,255,255,0.68));
  border: 1px solid rgba(27, 41, 64, 0.08);
}
.detail-hero-copy { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.detail-hero-label {
  font-size: 10px; font-weight: 600; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--text-3);
}
.detail-hero-text { font-size: 13px; color: var(--text-1); line-height: 1.7; }
.detail-status-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.detail-preview-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.detail-preview-card { display: flex; flex-direction: column; gap: 6px; }
.detail-preview-title { font-size: 11px; font-weight: 600; color: var(--text-2); }
.detail-preview-media {
  position: relative; aspect-ratio: 16/9; overflow: hidden;
  border-radius: 14px; background: rgba(18,25,42,0.08);
  border: 1px solid rgba(27, 41, 64, 0.08);
}
.detail-preview-media img { width: 100%; height: 100%; object-fit: cover; display: block; }
.detail-preview-empty {
  width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
  color: var(--text-3); font-size: 12px;
}
.detail-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(255,255,255,0.72);
  border: 1px solid rgba(27, 41, 64, 0.08);
}
.detail-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.detail-section-title { font-size: 12px; font-weight: 600; color: var(--text-0); }
.detail-section-copy { font-size: 11px; color: var(--text-3); }

/* Field */
.field { display: flex; flex-direction: column; gap: 4px; }
.field-label {
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--text-2);
}
.field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.field-copy-btn {
  flex-shrink: 0;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 999px;
}
.field-help { font-size: 12px; color: var(--text-3); line-height: 1.45; }
.field-row { display: flex; gap: 10px; }
.field-grid { display: grid; gap: 10px 12px; }
.field-grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.field-grid-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.locked-config {
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(19, 51, 121, 0.08);
  border: 1px solid rgba(19, 51, 121, 0.12);
  color: var(--text-1);
  font-size: 11px;
  font-weight: 600;
}
.locked-config-banner {
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--text-2);
}
.role-pills { display: flex; flex-wrap: wrap; gap: 8px; }
.role-pill {
  height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(27, 41, 64, 0.12);
  background: rgba(255,255,255,0.86);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.role-pill:hover { border-color: var(--accent); color: var(--text-0); }
.role-pill.active {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
  box-shadow: 0 8px 18px rgba(29, 77, 176, 0.18);
}

/* Production tabs */
.prod-tabs { display: flex; gap: 0; background: var(--bg-2); border-radius: var(--radius); padding: 2px; }
.prod-tab {
  display: flex; align-items: center; gap: 4px; padding: 6px 12px; font-size: 12px;
  border: none; background: transparent; color: var(--text-2); cursor: pointer;
  border-radius: calc(var(--radius) - 2px); transition: all 0.15s; font-weight: 500;
}
.prod-tab:hover { color: var(--text-0); }
.prod-tab.active { background: var(--bg-0); color: var(--text-0); font-weight: 600; box-shadow: var(--shadow-xs); }
.prod-tab.is-complete { color: var(--success); }
.prod-tab.is-partial { color: var(--warning); }
.prod-tab.is-blocked { color: var(--error); }
.prod-tab.is-not-applicable,
.prod-tab.is-pending { color: var(--text-3); }
.prod-tab.active.is-complete,
.prod-tab.active.is-partial,
.prod-tab.active.is-blocked,
.prod-tab.active.is-not-applicable,
.prod-tab.active.is-pending { color: var(--text-0); }
.prod-tab-badge { font-size: 10px; font-family: var(--font-mono); padding: 0 4px; background: var(--bg-3); color: var(--text-2); border-radius: 99px; }
.prod-tab.is-complete .prod-tab-badge { background: var(--success-bg); color: var(--success); }
.prod-tab.is-partial .prod-tab-badge { background: var(--warning-bg); color: var(--warning); }
.prod-tab.is-blocked .prod-tab-badge { background: var(--error-bg); color: var(--error); }
.prod-tab.active .prod-tab-badge { background: var(--accent-bg); color: var(--accent-text); }

/* Production content */
.prod-content { flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 12px; }
.prod-section-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.compose-section-bar {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) auto;
  align-items: center;
  gap: 12px;
}
.prod-inline-config {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 14px;
  background: rgba(255,255,255,0.72);
  border: 1px solid rgba(27, 41, 64, 0.08);
  min-width: 0;
}
.prod-inline-config-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.prod-inline-help { font-size: 11px; line-height: 1.4; max-width: none; }
.compose-section-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: flex-end;
  gap: 4px;
}
.compose-progress-value {
  font-size: 11px;
  color: var(--text-3);
}

.dub-grid { display: flex; flex-direction: column; gap: 10px; }
.dub-card { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; border-radius: 20px; background: linear-gradient(180deg, rgba(255,255,255,0.74), rgba(248,251,255,0.58)); }
.dub-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.dub-copy { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.dub-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dub-desc { font-size: 13px; line-height: 1.6; color: var(--text-1); }
.dub-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 11px; }
.dub-foot { display: flex; align-items: center; gap: 10px; padding-top: 8px; border-top: 1px solid rgba(27, 41, 64, 0.08); }
.dub-audio { flex: 1; min-width: 0; height: 30px; }

/* Asset grid */
.asset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
.asset-card {
  display: flex; flex-direction: column; overflow: hidden; height: 100%;
  transition: transform 0.18s var(--ease-out), box-shadow 0.18s var(--ease-out), border-color 0.18s var(--ease-out);
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(255,255,255,0.74), rgba(248,251,255,0.58));
}
.asset-card:hover { transform: translateY(-2px); box-shadow: 0 16px 30px rgba(20, 32, 54, 0.08); }
.asset-cover { position: relative; aspect-ratio: 1; background: var(--bg-2); overflow: hidden; }
.asset-cover.wide { aspect-ratio: 16/9; }
.asset-cover img { width: 100%; height: 100%; object-fit: cover; }
.previewable-image { cursor: zoom-in; transition: transform 0.18s var(--ease-out), filter 0.18s var(--ease-out); }
.previewable-image:hover { transform: scale(1.015); filter: saturate(1.04); }
.asset-cover-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(7,11,21,0.58);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
}
.asset-cover-badge.is-ready {
  background: rgba(36, 125, 72, 0.92);
}
.asset-cover-badge.is-pending {
  background: rgba(19, 51, 121, 0.92);
}
.asset-cover-badge.is-failed {
  background: rgba(164, 41, 67, 0.94);
}
.asset-cover-empty { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-3); }
.asset-body {}
.media-card-body {
  padding: 10px 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 1;
  min-height: 0;
}
.media-card-title {
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
}
.media-card-submeta {
  font-size: 10px;
  color: var(--text-3);
}
.media-card-status {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  color: var(--text-3);
}
.asset-name { font-size: 12px; font-weight: 600; line-height: 1.4; }
.asset-meta { font-size: 10px; color: var(--text-3); }
.asset-foot {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  padding: 8px 10px 10px;
  border-top: 1px solid var(--border);
}
.asset-foot-status { min-width: 0; }
.media-card-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-left: 0;
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
}
.media-card-actions-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.media-card-actions .btn {
  justify-content: center;
  min-width: 0;
  height: 30px;
  min-height: 30px;
  padding: 0 8px;
  border-radius: 10px;
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.media-card-actions .btn.btn-sm {
  height: 30px;
  min-height: 30px;
  padding: 0 8px;
  border-radius: 10px;
  font-size: 11px;
  gap: 4px;
  line-height: 1;
}
.media-card-action-main { width: 100%; }
.asset-error {
  padding: 0 10px 10px;
  font-size: 11px;
  line-height: 1.45;
  color: var(--error);
}

/* Frame grid */
.frame-grid { display: flex; flex-direction: column; gap: 8px; }
.frame-row {
  display: flex; align-items: center; gap: 14px;
  padding: 12px 14px; cursor: pointer;
  border-radius: var(--radius-lg);
  transition: all 0.15s;
  border: 1.5px solid transparent;
}
.frame-row:hover { background: var(--bg-0); border-color: var(--border); }
.frame-row.active {
  background: var(--bg-0);
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}
.frame-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.frame-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.frame-top-badges { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 6px; }
.frame-num {
  font-size: 13px; font-family: var(--font-mono); font-weight: 600;
  color: var(--accent);
}
.frame-badge {
  font-size: 11px; font-weight: 600; padding: 2px 8px;
  border-radius: 20px;
  background: var(--accent-bg); color: var(--accent);
  border: 1px solid var(--accent-glow);
  white-space: nowrap;
}
.frame-desc {
  font-size: 12px; line-height: 1.5; color: var(--text-1);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.frame-meta { display: flex; align-items: center; gap: 6px; }
.frame-review-badge,
.frame-continuity-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 999px;
  white-space: nowrap;
}
.frame-review-badge {
  border: 1px solid rgba(27, 41, 64, 0.08);
  background: rgba(89, 101, 126, 0.1);
  color: var(--text-2);
}
.frame-review-badge.is-approved {
  background: rgba(56, 178, 112, 0.12);
  color: var(--success);
}
.frame-review-badge.is-pending_review {
  background: rgba(255, 174, 51, 0.18);
  color: #8d5b00;
}
.frame-review-badge.is-changes_requested {
  background: rgba(235, 87, 87, 0.14);
  color: #b43b3b;
}
.frame-continuity-badge {
  border: 1px dashed rgba(76, 125, 255, 0.32);
  background: rgba(76, 125, 255, 0.08);
  color: var(--accent);
}
.frame-review-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.frame-thumbs { display: flex; gap: 8px; flex-shrink: 0; }
.frame-thumb-wrap { display: flex; flex-direction: column; gap: 3px; align-items: center; }
.frame-thumb-label { font-size: 10px; font-weight: 600; color: var(--text-3); }
.frame-thumb-actions { width: 100%; display: flex; gap: 4px; }
.frame-thumb-action { flex: 1; justify-content: center; }
.frame-thumb {
  position: relative; width: 130px; aspect-ratio: 16/9;
  border-radius: 6px; overflow: hidden;
  background: var(--bg-2); cursor: pointer;
  transition: all 0.15s; border: 1.5px solid var(--border);
}
.frame-thumb:hover { border-color: var(--accent); box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
.frame-thumb img { width: 100%; height: 100%; object-fit: cover; }
.frame-thumb-empty { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-3); }
.frame-re {
  position: absolute; top: 3px; right: 3px; width: 18px; height: 18px;
  border-radius: 50%; background: rgba(0,0,0,0.5); color: #fff;
  display: none; align-items: center; justify-content: center;
}
.frame-thumb:hover .frame-re { display: flex; }
.frame-scroll { flex: 1; overflow-y: auto; padding: 10px 12px; }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--bg-3); flex-shrink: 0; }
.dot.ok { background: var(--success); }
.dot.pending {
  background: var(--accent-dark);
  box-shadow: 0 0 0 3px rgba(76, 125, 255, 0.14);
}
.dot.fail {
  background: var(--error);
  box-shadow: 0 0 0 3px rgba(197, 62, 86, 0.14);
}
.tag-review.is-approved {
  background: rgba(56, 178, 112, 0.12);
  color: var(--success);
}
.tag-review.is-pending_review {
  background: rgba(255, 174, 51, 0.18);
  color: #8d5b00;
}
.tag-review.is-changes_requested {
  background: rgba(235, 87, 87, 0.14);
  color: #b43b3b;
}

/* Prod grid */
.prod-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
.prod-card {
  display: flex; flex-direction: column; overflow: hidden; height: 100%;
  transition: transform 0.18s var(--ease-out), box-shadow 0.18s var(--ease-out), border-color 0.18s var(--ease-out);
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(255,255,255,0.74), rgba(248,251,255,0.58));
}
.prod-card:hover { transform: translateY(-2px); box-shadow: 0 16px 30px rgba(20, 32, 54, 0.08); }
.prod-cover { position: relative; aspect-ratio: 16/9; background: var(--bg-2); overflow: hidden; }
.prod-cover img { width: 100%; height: 100%; object-fit: cover; }
.prod-video { width: 100%; height: 100%; object-fit: cover; background: #000; display: block; }
.prod-cover-empty { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-3); }
.prod-idx {
  position: absolute; top: 5px; left: 5px; font-size: 10px; font-weight: 600;
  font-family: var(--font-mono); background: rgba(18, 24, 34, 0.56); color: #fff; padding: 2px 7px; border-radius: 999px;
}
.prod-overlay-badge {
  position: absolute; bottom: 5px; right: 5px; font-size: 10px; font-weight: 600;
  background: var(--success); color: #fff; padding: 1px 5px; border-radius: 3px;
}
.prod-info { flex: 1; }
.prod-desc { font-size: 12px; line-height: 1.4; }
.prod-meta-line { font-size: 10px; color: var(--text-3); }
.prod-dots { margin-top: 0; }
.prod-error {
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.45;
  color: var(--error);
}
.prod-actions {
  padding: 8px 10px 10px;
  border-top: 1px solid rgba(27, 41, 64, 0.08);
}

.audio-board {
  display: grid;
  gap: 12px;
}

.audio-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}

.audio-group-head,
.audio-scope-head,
.audio-cue-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.audio-group-head > :first-child,
.audio-scope-head > :first-child,
.audio-cue-head > :first-child {
  flex: 1 1 340px;
  min-width: 0;
}

.audio-group-title,
.audio-scope-title,
.audio-cue-title {
  font-weight: 600;
  color: var(--text-1);
}

.audio-group-sub,
.audio-scope-sub,
.audio-cue-sub {
  margin-top: 4px;
  margin-bottom: 8px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-3);
}

.audio-group-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-content: flex-start;
  flex: 0 1 420px;
  min-width: 260px;
  max-width: 100%;
}

.audio-empty {
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-3);
}

.audio-scope-list,
.audio-cue-list {
  display: grid;
  gap: 8px;
}

.audio-scope-card,
.audio-cue-card {
  border: 1px solid rgba(27, 41, 64, 0.08);
  border-radius: 16px;
  background: rgba(255,255,255,0.68);
  padding: 10px 12px 12px;
  min-width: 0;
}

.audio-cue-card.compact {
  background: rgba(248, 251, 255, 0.72);
}

.audio-cue-player {
  width: 100%;
  margin-top: 2px;
  margin-bottom: 6px;
}

.audio-scope-card > .field + .field-grid,
.audio-cue-card > .field + .field-grid {
  margin-top: 16px;
}

.audio-scope-card > .field-grid + .field-grid,
.audio-cue-card > .field-grid + .field-grid {
  margin-top: 12px;
}

.asset-foot-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.field-toggle {
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 6px;
  min-height: 100%;
}

.field-toggle .field-label {
  margin-bottom: 2px;
}

.audio-toggle {
  position: relative;
  width: 36px;
  height: 20px;
  flex-shrink: 0;
  cursor: pointer;
}

.audio-toggle input {
  position: absolute;
  inset: 0;
  opacity: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  cursor: pointer;
}

.audio-toggle-slider {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: rgba(27, 41, 64, 0.12);
  border: 1px solid rgba(27, 41, 64, 0.08);
  transition: background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.audio-toggle-slider::before {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 6px rgba(27, 41, 64, 0.18);
  transition: transform 0.18s ease;
}

.audio-toggle input:checked + .audio-toggle-slider {
  background: linear-gradient(135deg, var(--accent), var(--accent-dark));
  border-color: transparent;
  box-shadow: 0 6px 16px rgba(29, 77, 176, 0.22);
}

.audio-toggle input:checked + .audio-toggle-slider::before {
  transform: translateX(16px);
}

.audio-toggle input:focus-visible + .audio-toggle-slider {
  box-shadow: 0 0 0 3px rgba(76, 125, 255, 0.18);
}

.audio-remove-btn {
  width: 28px;
  height: 28px;
  min-width: 28px;
  min-height: 28px;
  padding: 0;
  border-radius: 10px;
  color: var(--error);
  border-color: rgba(197, 62, 86, 0.16);
  background: rgba(255, 244, 246, 0.9);
  box-shadow: none;
  flex: 0 0 28px;
}

.audio-remove-btn svg {
  width: 12px;
  height: 12px;
}

.audio-remove-btn:hover {
  color: var(--error);
  background: rgba(255, 234, 239, 0.96);
  border-color: rgba(197, 62, 86, 0.24);
}

.detail-delete-btn {
  color: var(--error);
}
.detail-delete-btn:hover {
  background: var(--error-bg);
  color: var(--error);
}

.shot-delete-overlay {
  z-index: 118;
  background: rgba(35, 48, 74, 0.38);
  backdrop-filter: blur(8px);
}
.shot-delete-dialog {
  width: min(420px, calc(100vw - 32px));
  padding: 28px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  box-shadow: var(--shadow-elevated);
  animation: scaleIn 0.2s var(--ease-out);
}
.shot-delete-head {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}
.shot-delete-icon {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: var(--radius);
  background: var(--error-bg);
  color: var(--error);
  display: flex;
  align-items: center;
  justify-content: center;
}
.shot-delete-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.shot-delete-title {
  font-family: var(--font-display);
  font-size: 19px;
  font-weight: 600;
  color: var(--text-0);
}
.shot-delete-desc {
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-3);
}
.shot-delete-target {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 4px 12px;
  padding: 12px 14px;
  border-radius: var(--radius);
  background: rgba(248, 251, 255, 0.84);
  border: 1px solid rgba(27, 41, 64, 0.08);
}
.shot-delete-target-label {
  grid-column: 1 / -1;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-3);
}
.shot-delete-target-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-display);
  font-size: 14px;
  color: var(--text-0);
}
.shot-delete-target-meta {
  align-self: center;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
  white-space: nowrap;
}
.shot-delete-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.btn-danger {
  background: var(--error);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 8px 20px rgba(210, 79, 102, 0.22), 0 2px 6px rgba(145, 42, 62, 0.16);
}
.btn-danger:hover {
  background: var(--error);
  color: #fff;
  filter: brightness(1.05);
  transform: translateY(-1px);
  box-shadow: 0 12px 24px rgba(210, 79, 102, 0.26), 0 4px 10px rgba(145, 42, 62, 0.18);
}

/* Image viewer */
.image-viewer-overlay {
  z-index: 120;
  padding: clamp(16px, 3vw, 32px);
  background: rgba(18, 24, 34, 0.68);
  backdrop-filter: blur(10px);
}
.image-viewer-dialog {
  width: min(1040px, calc(100vw - 96px));
  max-width: 100%;
  max-height: calc(100vh - 64px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,251,255,0.92));
}
.image-viewer-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(27, 41, 64, 0.08);
}
.image-viewer-title {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-1);
  font-family: var(--font-display);
}
.image-viewer-body {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  overflow: auto;
  min-height: 0;
}
.image-viewer-img {
  display: block;
  max-width: 100%;
  width: auto;
  height: auto;
  max-height: calc(100vh - 168px);
  border-radius: 18px;
  box-shadow: 0 18px 48px rgba(8, 14, 24, 0.22);
  background: rgba(255,255,255,0.9);
}

/* Grid tool dialog */
.grid-tool-overlay {
  z-index: 119;
  padding: clamp(16px, 3vw, 28px);
  background: rgba(18, 24, 34, 0.62);
  backdrop-filter: blur(10px);
}
.grid-tool { width: min(1320px, calc(100vw - 40px)); max-height: calc(100vh - 48px); display: flex; flex-direction: column; overflow: hidden; animation: scaleIn 0.2s var(--ease-out); }
.grid-tool-head { display: flex; align-items: center; gap: 8px; padding: 16px 20px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.grid-tool-body { flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
.grid-tool-body-preview { overflow: hidden; min-height: 0; padding-bottom: 10px; }
.grid-tool-foot { display: flex; align-items: center; gap: 8px; padding-top: 12px; border-top: 1px solid var(--border); margin-top: 4px; }
.grid-preview-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.72fr) minmax(340px, 400px);
  gap: 14px;
  min-height: 0;
  flex: 1;
  align-items: start;
}
.grid-preview-pane {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.grid-assignment-pane {
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(27, 41, 64, 0.08);
  border-radius: 18px;
  background: rgba(255,255,255,0.66);
  overflow: hidden;
  max-height: min(70vh, 840px);
}
.grid-assign-head {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(27, 41, 64, 0.08);
  background: linear-gradient(180deg, rgba(255,255,255,0.9), rgba(255,255,255,0.72));
}
.grid-assign-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-0);
  font-family: var(--font-display);
}
.grid-assign-subtitle {
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-3);
}
.grid-assign-pagination {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(27, 41, 64, 0.08);
  background: rgba(255,255,255,0.86);
}
.grid-assign-columns {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 96px minmax(0, 1fr);
  gap: 8px;
  padding: 7px 12px;
  border-bottom: 1px solid rgba(27, 41, 64, 0.08);
  background: rgba(246, 248, 252, 0.92);
  font-size: 10px;
  font-weight: 600;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* Prompt preview */
.grid-prompt-summary { background: var(--bg-2); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 14px; }
.grid-prompt-label { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600; color: var(--text-2); margin-bottom: 6px; }
.grid-prompt-text { font-size: 12px; color: var(--text-1); line-height: 1.7; }

.grid-blank-preview {
  display: grid;
  gap: 4px;
  border: 1.5px dashed var(--border-strong);
  border-radius: var(--radius);
  padding: 8px;
  min-height: 200px;
}
.grid-blank-cell {
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 70px;
}
.grid-blank-cell.empty { opacity: 0.4; }
.grid-blank-cell-index { font-size: 10px; font-weight: 600; color: var(--accent); font-family: var(--font-mono); }
.grid-blank-cell-desc { font-size: 11px; color: var(--text-2); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.grid-mode-tabs { display: flex; gap: 6px; }
.grid-mode-tab { flex: 1; display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border: 1.5px solid var(--border); border-radius: var(--radius); background: var(--bg-0); cursor: pointer; transition: all 0.15s; text-align: left; }
.grid-mode-tab:hover { border-color: var(--border-strong); }
.grid-mode-tab.active { border-color: var(--accent); background: var(--accent-bg); }
.grid-config { display: flex; gap: 12px; align-items: flex-end; }
.grid-pick-list { display: flex; flex-direction: column; gap: 2px; max-height: 260px; overflow-y: auto; border: 1px solid var(--border); border-radius: var(--radius); padding: 4px; }
.grid-pick-item { position: relative; display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; cursor: pointer; transition: background 0.1s, border-color 0.1s, box-shadow 0.1s; border: 1px solid transparent; }
.grid-pick-item:hover { background: var(--bg-hover); }
.grid-pick-item.selected { background: var(--accent-bg); border-color: rgba(76, 125, 255, 0.2); }
.grid-pick-input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.grid-pick-control {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  border: 1px solid var(--border-strong);
  border-radius: 5px;
  background: rgba(255,255,255,0.78);
  transition: all 0.15s ease;
  position: relative;
}
.grid-pick-input[type="radio"] + .grid-pick-control {
  border-radius: 999px;
}
.grid-pick-item:hover .grid-pick-control {
  border-color: var(--accent);
  background: rgba(255,255,255,0.92);
}
.grid-pick-input:focus-visible + .grid-pick-control {
  box-shadow: 0 0 0 3px rgba(76, 125, 255, 0.16);
  border-color: var(--accent);
}
.grid-pick-input[type="checkbox"]:checked + .grid-pick-control {
  background: var(--accent-bg);
  border-color: var(--accent);
}
.grid-pick-input[type="checkbox"]:checked + .grid-pick-control::after {
  content: '';
  position: absolute;
  left: 5px;
  top: 2px;
  width: 4px;
  height: 8px;
  border: solid var(--accent-dark);
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
.grid-pick-input[type="radio"]:checked + .grid-pick-control {
  border-color: var(--accent);
  background: rgba(255,255,255,0.92);
}
.grid-pick-input[type="radio"]:checked + .grid-pick-control::after {
  content: '';
  position: absolute;
  inset: 3px;
  border-radius: 999px;
  background: var(--accent);
}
.grid-preview-wrap {
  border-radius: var(--radius);
  overflow: auto;
  border: 1px solid var(--border);
  background: rgba(14, 19, 28, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  max-height: min(70vh, 860px);
  padding: 10px;
}
.grid-preview-stage {
  position: relative;
  width: fit-content;
  max-width: 100%;
  margin: auto;
  line-height: 0;
}
.grid-preview-img {
  display: block;
  width: auto;
  max-width: 100%;
  max-height: min(66vh, 820px);
  object-fit: contain;
}
.grid-overlay { position: absolute; inset: 0; display: grid; }
.grid-overlay-cell {
  border: 1px dashed rgba(255,255,255,0.42);
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  padding: 4px 6px;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}
.grid-overlay-cell.active {
  background: rgba(255,255,255,0.08);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.28);
}
.grid-cell-label { font-size: 10px; font-weight: 600; color: #fff; background: rgba(0,0,0,0.5); padding: 1px 5px; border-radius: 3px; }
.grid-adjust-summary { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 0 2px; }
.grid-assign-info {
  display: flex;
  flex-direction: column;
  gap: 0;
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding: 4px 12px 10px;
}
.grid-assign-row {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 112px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px dashed rgba(27, 41, 64, 0.08);
}
.grid-assign-row.active {
  background: rgba(32, 86, 190, 0.05);
  border-radius: 12px;
  padding-left: 6px;
  padding-right: 6px;
}
.grid-assign-row:last-child { border-bottom: 0; }
.grid-assign-index {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
  font-family: var(--font-mono);
}
.grid-assign-bind {
  font-size: 11px;
  color: var(--text-2);
  line-height: 1.45;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.grid-history-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
  padding: 10px 12px 12px;
  border: 1px solid rgba(27, 41, 64, 0.08);
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(255,255,255,0.82), rgba(255,255,255,0.64));
}
.grid-history-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.grid-history-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-0);
  font-family: var(--font-display);
}
.grid-history-subtitle {
  font-size: 11px;
  color: var(--text-3);
}
.grid-history-list {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(160px, 182px);
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 2px;
}
.grid-history-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  border: 1px solid rgba(27, 41, 64, 0.08);
  border-radius: 16px;
  background: rgba(255,255,255,0.78);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}
.grid-history-item:hover {
  border-color: rgba(33, 88, 255, 0.18);
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.08);
  transform: translateY(-1px);
}
.grid-history-item.active {
  border-color: rgba(33, 88, 255, 0.26);
  background: linear-gradient(180deg, rgba(244,248,255,0.96), rgba(255,255,255,0.86));
  box-shadow: 0 14px 28px rgba(33, 88, 255, 0.12);
}
.grid-history-thumb {
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid rgba(27, 41, 64, 0.08);
  background: rgba(14, 19, 28, 0.05);
}
.grid-history-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.grid-history-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.grid-history-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.grid-history-meta {
  font-size: 10.5px;
  color: var(--text-3);
  line-height: 1.45;
  word-break: break-word;
}

.latest-grid-strip {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid rgba(27, 41, 64, 0.08);
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(255,255,255,0.84), rgba(255,255,255,0.62));
}
.latest-grid-strip-thumb {
  width: 72px;
  height: 48px;
  padding: 0;
  border: 1px solid rgba(27, 41, 64, 0.08);
  border-radius: 10px;
  overflow: hidden;
  background: rgba(14, 19, 28, 0.06);
  cursor: zoom-in;
  box-shadow: none;
}
.latest-grid-strip-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.latest-grid-strip-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.latest-grid-strip-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.latest-grid-strip-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-0);
  font-family: var(--font-display);
}
.latest-grid-strip-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 10px;
  color: var(--text-3);
}
.latest-grid-strip-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* Export */
.export-split { flex: 1; display: flex; min-height: 0; min-width: 0; overflow: hidden; }
.export-main { flex: 1; display: flex; flex-direction: column; align-items: stretch; justify-content: flex-start; padding: 24px; min-width: 0; overflow: auto; }
.export-shell {
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
  box-shadow: none;
}
.export-settings {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  min-width: 0;
}
.export-config {
  width: 100%;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  min-width: 0;
  overflow: hidden;
}
.export-config-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.export-transition-help {
  font-size: 12px;
  line-height: 1.45;
}
.export-panels {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  min-width: 0;
}
.export-task-card {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  overflow: hidden;
}
.export-task-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.export-task-copy {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  flex: 1 1 220px;
}
.export-task-meta,
.export-status-copy {
  font-size: 12px;
  line-height: 1.45;
}
.export-video { width: 100%; border-radius: var(--radius); background: #000; max-height: 38vh; object-fit: contain; }
.export-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-width: 0; }
.export-bar .btn,
.export-bar .btn.btn-primary {
  margin-left: 0;
  max-width: 100%;
  white-space: normal;
}
.export-empty {
  flex: 1;
  min-height: clamp(180px, 28vh, 260px);
  margin: 0;
  padding: 24px;
  overflow: hidden;
}
.export-list { width: 240px; flex-shrink: 0; min-height: 0; border-left: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; }
.export-list-head { padding: 11px 14px; font-size: 11px; font-weight: 600; color: var(--text-3); border-bottom: 1px solid var(--border); text-transform: uppercase; letter-spacing: 0.06em; }
.export-list-body { flex: 1; overflow-y: auto; padding: 6px; }
.exp-row { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: var(--radius); }
.exp-row:hover { background: var(--bg-hover); }

/* Professional typography pass */
.studio-shell,
.episode-workbench,
.episode-content,
.production-panel {
  font-size: var(--type-base);
  line-height: var(--leading-ui);
}

.studio-title,
.empty-title,
.extract-summary-title,
.voice-stage-title,
.detail-head-title,
.shot-list-title,
.asset-name,
.voice-library-name,
.modal-title {
  font-family: var(--font-display);
  font-weight: var(--weight-semibold);
  letter-spacing: 0;
}

.studio-title {
  font-size: var(--type-lg);
  line-height: var(--leading-tight);
}

.empty-title,
.extract-summary-title,
.voice-stage-title {
  font-size: var(--type-2xl);
  line-height: var(--leading-tight);
}

.detail-head-title,
.shot-list-title,
.voice-library-name {
  font-size: var(--type-base);
}

.studio-overline,
.extract-summary-kicker,
.voice-stage-kicker,
.voice-block-label,
.detail-section-title,
.export-list-head,
.grid-prompt-label,
.frame-thumb-label {
  font-size: var(--type-xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.05em;
}

.step-name,
.prod-tab,
.asset-name,
.extract-name,
.field-label,
.voice-profile-name {
  font-size: var(--type-md);
  font-weight: var(--weight-medium);
}

.detail-hero-text,
.grid-prompt-text,
.prod-desc,
.dub-desc,
.field-help,
.shot-desc {
  font-size: var(--type-sm);
  line-height: var(--leading-copy);
  font-weight: var(--weight-regular);
}

.btn,
.prod-tab.active,
.asset-foot-actions button,
.audio-group-actions button {
  font-weight: var(--weight-medium);
}

/* Shared */
.dim { color: var(--text-3); }

@media (max-width: 1240px) {
  .studio-body {
    grid-template-columns: 1fr;
  }

  .studio-topbar {
    flex-direction: column;
    align-items: stretch;
  }

  .studio-topbar-side {
    justify-content: space-between;
  }

  .split-layout,
  .export-split {
    flex-direction: column;
  }

  .sidebar {
    max-height: 340px;
  }

  .shot-list,
  .export-list {
    width: 100%;
  }

  .detail-panel {
    min-height: 420px;
  }

  .field-grid-4 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 10px;
  }

  .image-viewer-overlay {
    padding: 16px;
  }

  .image-viewer-dialog {
    width: calc(100vw - 32px);
    max-height: calc(100vh - 32px);
  }

  .grid-tool {
    width: calc(100vw - 24px);
    max-height: calc(100vh - 24px);
  }

  .compose-section-bar {
    grid-template-columns: 1fr;
    align-items: stretch;
  }

  .compose-section-actions {
    align-items: flex-start;
    justify-content: flex-start;
  }

  .grid-preview-layout {
    grid-template-columns: 1fr;
  }

  .grid-preview-wrap,
  .grid-preview-img {
    max-height: 42vh;
  }

  .grid-assignment-pane {
    max-height: 42vh;
  }

  .grid-assign-columns {
    display: none;
  }

  .grid-assign-row {
    grid-template-columns: 1fr;
    align-items: stretch;
  }

  .export-settings,
  .export-panels {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 860px) {
  .studio {
    padding: 12px;
    gap: 12px;
  }

  .studio-topbar-main {
    align-items: flex-start;
  }

  .studio-topbar-side,
  .studio-actions {
    flex-wrap: wrap;
  }

  .toolbar-right,
  .step-bubble,
  .export-bar,
  .export-config {
    flex-wrap: wrap;
  }

  .extract-grid,
  .voice-grid,
  .asset-grid,
  .prod-grid {
    grid-template-columns: 1fr;
  }

  .voice-stage {
    grid-template-columns: 1fr;
  }

  .field-grid-2,
  .field-grid-4 {
    gap: 8px;
  }

  .field-head {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .audio-group {
    padding: 10px;
  }

  .audio-scope-card,
  .audio-cue-card {
    padding: 10px;
  }

  .extract-stage {
    grid-template-columns: 1fr;
  }

  .extract-summary {
    position: static;
  }

  .voice-stage-panel {
    position: static;
    max-height: none;
    overflow: visible;
  }

  .frame-row {
    flex-direction: column;
    align-items: stretch;
  }

  .detail-hero {
    grid-template-columns: 1fr;
  }

  .export-main {
    padding: 14px;
  }

  .export-shell {
    padding: 14px;
  }

  .field-grid-2,
  .field-grid-4 {
    grid-template-columns: 1fr;
  }

  .audio-group-head,
  .audio-scope-head,
  .audio-cue-head {
    flex-direction: column;
    align-items: stretch;
  }

  .audio-group-actions {
    width: 100%;
  }

  .asset-foot-actions {
    justify-content: flex-start;
  }

  .frame-thumbs {
    width: 100%;
  }

  .frame-thumb {
    width: 100%;
  }

  .latest-grid-strip {
    grid-template-columns: 1fr;
  }

  .grid-history-list {
    grid-auto-columns: minmax(148px, 168px);
  }

  .latest-grid-strip-thumb {
    width: 100%;
    height: auto;
    aspect-ratio: 16 / 9;
  }

  .latest-grid-strip-actions {
    justify-content: flex-start;
  }
}

@media (max-width: 520px) {
  .back-btn.topbar-back {
    width: 32px;
    max-width: 32px;
    padding: 0;
  }

  .topbar-back-label {
    display: none;
  }
}
</style>

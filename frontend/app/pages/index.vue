<template>
  <div class="story-home" :class="{ 'agent-active': scriptFlowActive }" @click="closeFloatingMenus">
    <input ref="productionMediaInput" type="file" accept="image/*" multiple hidden @change="handleProductionMediaUpload" @cancel="cancelCanvasImageUpload" />
    <input ref="canvasReferenceInput" type="file" accept="image/*" multiple hidden @change="handleCanvasReferenceUpload" />
    <div v-if="scriptFlowActive" class="agent-shell" :class="{ 'screen-shell': productionCanvasOpen }">
      <header class="agent-topbar" :class="{ 'screen-topbar': productionCanvasOpen }">
        <template v-if="productionCanvasOpen">
          <div class="screen-topbar-left">
            <button class="screen-back-button" type="button" aria-label="Voltar para ativos" @click.stop="closeProductionCanvas">
              <ArrowLeft :size="18" />
            </button>
            <strong>Tela</strong>
            <span class="screen-saved-dot" :class="{ saving: canvasSaveStatus === 'saving', error: canvasSaveStatus === 'error' }"></span>
            <span class="screen-save-label" aria-live="polite">{{ canvasSaveLabel }}</span>
          </div>
        </template>
        <template v-else>
          <div class="agent-back">
            <button class="agent-back-button" type="button" aria-label="Voltar" @click.stop="leaveScriptFlow">
              <ArrowLeft :size="18" />
            </button>
            <strong>{{ generatedScriptReady ? 'AI Generated Script' : 'Pippit Agent' }}</strong>
          </div>

          <div class="agent-steps" aria-label="Etapas de geração">
            <button class="agent-step" :class="{ active: agentStep === 1, done: agentStep > 1, clickable: canOpenAgentStep(1) }" type="button" :disabled="!canOpenAgentStep(1)" @click.stop="openAgentStep(1)"><span><Check v-if="agentStep > 1" :size="15" /><template v-else>1</template></span><strong>Roteiro</strong></button>
            <i></i>
            <button class="agent-step" :class="{ active: agentStep === 2, done: agentStep > 2, clickable: canOpenAgentStep(2) }" type="button" :disabled="!canOpenAgentStep(2)" @click.stop="openAgentStep(2)"><span><Check v-if="agentStep > 2" :size="15" /><template v-else>2</template></span><strong>Ativos de produção</strong></button>
            <i></i>
            <button class="agent-step" :class="{ active: agentStep === 3, clickable: canOpenAgentStep(3) }" type="button" :disabled="!canOpenAgentStep(3)" @click.stop="openAgentStep(3)"><span><Check v-if="agentStep > 3" :size="15" /><template v-else>3</template></span><strong>Episódios</strong></button>
          </div>
        </template>

        <div class="agent-actions">
          <div class="agent-control-wrap">
            <button class="agent-chip style-chip" :class="{ active: styleLibraryOpen }" type="button" aria-haspopup="dialog" :aria-expanded="styleLibraryOpen" @click.stop="toggleStyleLibrary">
              <Layers3 :size="15" />
              <span>Biblioteca de esti...</span>
              <ChevronDown :size="14" />
            </button>
          </div>

          <div class="agent-control-wrap">
            <button class="agent-chip ratio-chip" :class="{ active: openControl === 'agent-ratio' }" type="button" aria-haspopup="menu" :aria-expanded="openControl === 'agent-ratio'" @click.stop="toggleControl('agent-ratio')">
              <Scan :size="15" />
              <strong>{{ agentRatioDisplay }}</strong>
              <ChevronDown :size="14" />
            </button>
            <div v-if="openControl === 'agent-ratio'" class="control-popover ratio-popover agent-ratio-popover" role="menu" @click.stop>
              <button v-for="ratio in ratioOptions" :key="`agent-${ratio}`" class="ratio-option" :class="{ selected: selectedRatio === ratio }" type="button" role="menuitemradio" :aria-checked="selectedRatio === ratio" @click="selectRatio(ratio)">
                <span class="ratio-shape"></span>
                <span>{{ ratio }}</span>
              </button>
            </div>
          </div>

          <div class="story-menu-wrap">
            <button class="round-control language-trigger" type="button" aria-label="Idioma" @click.stop="toggleLanguageMenu"><Globe2 :size="23" /><b :data-label="selectedLanguageCode">{{ selectedLanguageCode }}</b></button>
            <div v-if="showLanguageMenu" class="language-menu floating-panel" @click.stop>
              <button v-for="language in languages" :key="`agent-${language}`" class="language-option" :class="{ selected: language === selectedLanguage }" type="button" @click="selectLanguage(language)">
                <Check v-if="language === selectedLanguage" :size="17" /><span v-else></span>{{ language }}
              </button>
            </div>
          </div>

          <div class="story-menu-wrap">
            <button class="avatar-button" type="button" aria-label="Conta" @click.stop="toggleAccountMenu"><img :src="brandLogo" alt="" /></button>
            <div v-if="showAccountMenu" class="account-menu floating-panel" @click.stop>
              <div class="account-identity"><span class="account-avatar"><img :src="brandLogo" alt="" /></span><strong>user{{ accountId }}</strong><span>g***a@gmail.com</span></div>
              <button class="account-row" type="button"><CircleUserRound :size="20" /> Informações da conta</button>
              <button class="account-row" type="button"><CreditCard :size="20" /> Planos e preços</button>
              <button class="account-row" type="button"><ShieldCheck :size="20" /> Autorização de conta</button>
              <button class="account-row has-arrow" type="button"><FileText :size="20" /> Termos e Políticas <ChevronRight :size="18" /></button>
              <button class="account-row" type="button"><LogOut :size="20" /> Sair</button>
            </div>
          </div>
        </div>
      </header>

      <main v-if="productionAnalysisGenerating" class="agent-main production-analysis-main">
        <section class="agent-title-block production-continue-title">
          <h1>Continuar</h1>
        </section>
        <section class="production-analysis-card">
          <div class="production-analysis-scroll">
            <article v-for="episode in analysisPreviewEpisodes" :key="'analysis-' + episode.episode_number" class="analysis-episode">
              <h3>Episódio {{ episode.episode_number }}</h3>
              <p><strong>Resumo do enredo:</strong>{{ episode.summary }}</p>
            </article>
          </div>
          <div class="script-loading-row production-analysis-loading"><LoaderCircle :size="17" /><span>Analisando a história... <small>(cerca de 5 min de espera)</small></span></div>
        </section>
      </main>

      <main
        v-else-if="productionAssetsReady && productionCanvasOpen"
        ref="canvasViewportRef"
        class="production-canvas-main"
        :class="{ panning: canvasPanning }"
        @pointerdown="startCanvasPan"
        @pointermove="updateCanvasPointerPosition"
        @wheel.ctrl.prevent="handleCanvasCtrlWheel"
        @scroll.passive="handleCanvasViewportScroll"
        @dragover.prevent="handleCanvasReferenceDropOver"
        @drop.prevent="handleCanvasReferenceDrop"
      >
        <aside class="canvas-side-tools" :class="{ adding: addNodeMenuOpen }" @mouseleave="scheduleAddNodeMenuClose">
          <button class="canvas-add-button" type="button" :aria-label="addNodeMenuOpen ? 'Fechar criacao' : 'Adicionar ativo'" @mouseenter="openAddNodeMenu" @focus="openAddNodeMenu" @click.stop="toggleAddNodeMenu">
            <X v-if="addNodeMenuOpen" :size="24" />
            <Plus v-else :size="24" />
          </button>
          <button class="canvas-tool-button" type="button" :class="{ 'library-open': productionLibraryOpen }" aria-label="Biblioteca" @click.stop="toggleProductionLibrary"><Folder :size="20" /></button>
          <button class="canvas-tool-button" type="button" aria-label="Ajuda" @click.stop="toggleScreenHelp"><HelpCircle :size="20" /></button>
        </aside>

        <section v-if="addNodeMenuOpen" class="add-node-menu" @mouseenter="cancelAddNodeMenuClose" @mouseleave="scheduleAddNodeMenuClose" @click.stop>
          <h3>Add node</h3>
          <button v-for="option in addNodeOptions" :key="option.id" type="button" :class="{ muted: option.muted }" @click="createProductionNode(option.id)">
            <span><component :is="option.icon" :size="21" /></span>
            <strong>{{ option.label }}</strong>
            <small v-if="option.description">{{ option.description }}</small>
          </button>
        </section>

        <section v-if="screenHelpOpen" class="screen-help-menu" @click.stop>
          <button type="button"><BookOpen :size="18" />Use tutorial</button>
          <button type="button" @click="shortcutsModalOpen = true; screenHelpOpen = false"><Keyboard :size="18" />Shortcut</button>
        </section>

        <section v-if="productionLibraryOpen" class="production-library-panel" @click.stop>
          <nav class="production-library-tabs" role="tablist" aria-label="Biblioteca de ativos">
            <button v-for="tab in productionTabs" :key="'library-' + tab.id" type="button" :class="{ active: activeProductionTab === tab.id }" @click="setProductionTab(tab.id)">
              <span>{{ productionLibraryTabName(tab) }}</span>
              <em>{{ tab.count }}</em>
            </button>
          </nav>

          <div v-if="(activeProductionTab === 'objects' || activeProductionTab === 'media') && !activeProductionItems.length" class="production-empty-library">
            <div class="library-create-wrapper empty-create-wrapper" @mouseenter="showLibraryCreateMenu = true" @mouseleave="showLibraryCreateMenu = false">
              <button class="library-create-card" type="button" @click="createProductionNode(activeProductionTab)"><Plus :size="27" /></button>
              <div v-if="showLibraryCreateMenu" class="library-create-dropdown" style="left: 50%; transform: translateX(-50%);">
                <button type="button" @click="openCanvasImageUpload(activeProductionTab); showLibraryCreateMenu = false">
                  <UploadCloud :size="16" />
                  <span>Upload de arquivo local</span>
                </button>
                <button type="button" @click="openCanvasImageLibrary(activeProductionTab); showLibraryCreateMenu = false">
                  <Folder :size="16" />
                  <span>Escolher da biblioteca</span>
                </button>
                <button type="button" @click="createProductionNode(activeProductionTab); showLibraryCreateMenu = false">
                  <Image :size="16" />
                  <span>Criar no canvas</span>
                </button>
              </div>
            </div>
            <span>{{ activeProductionTab === 'objects' ? 'Novo objeto' : 'Nova midia' }}</span>
            <div>
              <h2>{{ activeProductionTab === 'objects' ? 'Ainda nao ha objetos' : 'No material yet' }}</h2>
              <p>{{ activeProductionTab === 'objects' ? 'Os objetos que voce criou ou carregou aparecerao aqui' : 'As midias que voce criou ou carregou aparecerao aqui' }}</p>
            </div>
          </div>

          <div v-else class="production-library-grid" :class="'library-' + activeProductionTab">
            <div v-if="activeProductionTab === 'objects' || activeProductionTab === 'media'" class="library-create-wrapper inline-create-wrapper" @mouseenter="showLibraryCreateMenu = true" @mouseleave="showLibraryCreateMenu = false">
              <button class="library-asset-card library-inline-create" type="button" @click="createProductionNode(activeProductionTab)">
                <div class="library-asset-preview library-create-preview">
                  <div class="dashed-circle"><Plus :size="22" /></div>
                </div>
                <strong>{{ activeProductionTab === 'objects' ? 'Novo objeto' : 'Nova mídia' }}</strong>
              </button>
              <div v-if="showLibraryCreateMenu" class="library-create-dropdown">
                <button type="button" @click="openCanvasImageUpload(activeProductionTab); showLibraryCreateMenu = false">
                  <UploadCloud :size="16" />
                  <span>Upload de arquivo local</span>
                </button>
                <button type="button" @click="openCanvasImageLibrary(activeProductionTab); showLibraryCreateMenu = false">
                  <Folder :size="16" />
                  <span>Escolher da biblioteca</span>
                </button>
                <button type="button" @click="createProductionNode(activeProductionTab); showLibraryCreateMenu = false">
                  <Image :size="16" />
                  <span>Criar no canvas</span>
                </button>
              </div>
            </div>
            <button v-for="group in groupedActiveProductionItems" :key="'lib-' + activeProductionTab + '-' + group.index" class="library-asset-card" type="button" @click="selectProductionLibraryAsset(group.item, group.index)">
              <div class="library-asset-preview">
                <img v-if="productionAssetImageSource(group.item)" :src="productionAssetImageSource(group.item)" :alt="group.item.name" />
                <CircleUserRound v-else-if="activeProductionTab === 'roles'" :size="46" />
                <Sparkles v-else-if="activeProductionTab === 'objects'" :size="46" />
                <Image v-else :size="50" />
              </div>
              <strong>{{ group.item.name }}</strong>
              <span>{{ group.totalImages + (group.totalImages === 1 ? ' image total' : ' images total') }}</span>
            </button>
          </div>
        </section>

        <section ref="canvasBoardRef" class="production-canvas-board" :style="canvasBoardStyle" @click="handleCanvasBoardClick">
          <svg
            class="canvas-connection-layer"
            :class="{ elevated: hoveredCanvasConnectionId || selectedCanvasConnectionId }"
            :viewBox="`0 0 ${canvasBoardMetrics.width} ${canvasBoardMetrics.height}`"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <g
              v-for="path in canvasConnectionPaths"
              :key="path.id"
              class="canvas-connection"
              :class="{
                hovered: hoveredCanvasConnectionId === path.id,
                selected: selectedCanvasConnectionId === path.id,
                'active-flow': isCanvasConnectionFlowActive(path)
              }"
              @mouseenter="hoverCanvasConnection(path.id)"
              @mouseleave="hoverCanvasConnection('')"
              @click.stop="selectCanvasConnection(path.id)"
            >
              <path class="hit" :d="path.d" />
              <path class="visible" :d="path.d" />
              <path class="flow-line" :d="path.d" />
              <template v-if="hoveredCanvasConnectionId === path.id || selectedCanvasConnectionId === path.id">
                <circle v-for="point in path.editPoints" :key="point.id" class="edit-point" :class="point.kind" :cx="point.x" :cy="point.y" r="4" />
              </template>
            </g>
            <path v-if="canvasHandlePreviewPath" class="preview" :d="canvasHandlePreviewPath" />
          </svg>
          <button
            v-if="selectedCanvasConnectionCutMenu"
            class="canvas-connection-cut"
            :style="selectedCanvasConnectionCutMenu.style"
            type="button"
            @click.stop="cutSelectedCanvasConnection"
          >
            <Scissors :size="15" /> Cut
          </button>
          <Teleport to="body">
            <section v-if="canvasNodeContextMenu.open" class="canvas-node-context-menu" :style="canvasNodeContextMenuStyle" @click.stop @pointerdown.stop>
              <button type="button" @click="copyCanvasContextNode">
                <span>Copiar nó</span>
                <em>Ctrl+C</em>
              </button>
              <button type="button" :disabled="!canvasContextNodeHasImage" @click="copyCanvasContextImage">
                <span>Copy image</span>
              </button>
              <button type="button" @click="duplicateCanvasContextNode">
                <span>Duplicar</span>
              </button>
              <button type="button" @click="deleteCanvasContextNode">
                <span>Excluir</span>
                <em>Delete</em>
              </button>
            </section>
          </Teleport>
          <div class="canvas-role-cluster">
            <article v-for="(item, index) in productionAssets.roles" :key="'role-canvas-' + index" class="canvas-node canvas-role-node" :data-canvas-key="canvasNodeKey('roles', index)" :class="{ enlarged: isBlankProductionAsset(item), linking: isCanvasNodeLinking('roles', index), active: isCanvasNodeActive('roles', index) }" :style="canvasNodeStyle('roles', index)" @click.stop="handleCanvasNodeClick('roles', index)" @contextmenu.capture.prevent.stop="openCanvasNodeContextMenu($event, 'roles', index)">
              <header @pointerdown.stop="startCanvasNodeDrag($event, 'roles', index)"><UserRound :size="15" />{{ item.name }}</header>
              <button class="canvas-side-add left" :class="{ active: isCanvasLinkHandleActive('roles', index, 'left') }" type="button" aria-label="Ligar role pela esquerda" data-link-type="roles" :data-link-index="index" data-link-side="left" @pointerdown.stop.prevent="startCanvasHandleDrag($event, 'roles', index, 'left')" @click.stop.prevent><Plus :size="28" /></button>
              <div v-if="!productionAssetImageSource(item) && isCanvasImageControlsVisible('roles', index)" class="canvas-media-actions" @pointerdown.stop>
                <button type="button" :disabled="productionMediaUploading" @click.stop="openCanvasImageUpload('roles', index)"><Upload :size="17" /> {{ isCanvasImageUploading('roles', index) ? 'Enviando...' : 'Upload' }}</button>
                <button type="button" @click.stop="openCanvasImageLibrary('roles', index)"><SquareArrowUp :size="17" /> Selecionar na biblioteca de Ativos</button>
              </div>
              <div class="canvas-node-card" :class="{ uploading: isCanvasImageUploading('roles', index), generating: isCanvasImageGenerating('roles', index) }" :aria-busy="isCanvasImageUploading('roles', index) || isCanvasImageGenerating('roles', index)" @pointerdown.stop="startCanvasNodeDrag($event, 'roles', index)">
                <span v-if="item.main" class="canvas-main-pill">Protagonist</span>
                <div class="canvas-node-preview">
                  <span v-if="isCanvasImageGenerating('roles', index)" class="canvas-generating-preview"><LoaderCircle :size="36" class="animate-spin" /><strong>Generating</strong></span>
                  <img v-else-if="productionAssetImageSource(item)" :src="productionAssetImageSource(item)" :alt="item.name" draggable="false" @dragstart.prevent />
                  <UserRound v-else :size="32" />
                </div>
                <button v-if="productionAssetImageSource(item) && !isCanvasImageGenerating('roles', index)" class="canvas-media-replace" type="button" aria-label="Substituir imagem do role" @pointerdown.stop @click.stop="openCanvasImageUpload('roles', index)"><Upload :size="17" /></button>
                <button v-if="productionAssetImageSource(item) && !isCanvasImageGenerating('roles', index)" class="canvas-media-library-button" type="button" aria-label="Selecionar outra imagem na biblioteca" @pointerdown.stop @click.stop="openCanvasImageLibrary('roles', index)"><SquareArrowUp :size="17" /></button>
                <p><strong>{{ roleAppearanceName(item) }}</strong><em>{{ productionAssetStatusLabel(item, 'roles') }}</em></p>
                <small>{{ productionAssetEpisodeLabel(item) }}</small>
                <button class="canvas-node-options" type="button" aria-label="Opções" @pointerdown.stop @click.stop="toggleProductionAssetMenu(item, index, 'roles')"><MoreHorizontal :size="22" /></button>
              </div>
              <section v-if="isRoleEditorOpen(index)" class="canvas-role-editor-panel" :class="roleEditorPlacement" @pointerdown.stop @click.stop>
                <label class="canvas-scene-editor-field">
                  <span>Nome do role</span>
                  <button class="canvas-role-editor-input canvas-scene-editor-select" type="button" :class="{ open: roleEditorMenu === 'name' }" @click="toggleRoleEditorMenu('name')">
                    <strong>{{ roleEditorDraft.name || 'Unnamed role' }}</strong>
                    <em>{{ roleEditorDraft.main ? 'Role principal' : 'Role' }}</em>
                    <ChevronDown :size="16" />
                  </button>
                  <div v-if="roleEditorMenu === 'name'" class="canvas-scene-editor-dropdown name-dropdown">
                    <button v-for="option in roleEditorRoleOptions" :key="'role-name-' + option" type="button" :class="{ selected: option === roleEditorDraft.name }" @click="selectRoleEditorName(option)">{{ option }}</button>
                  </div>
                </label>
                <label>
                  <span>Nome da aparência</span>
                  <div class="canvas-role-editor-input">
                    <input v-model="roleEditorDraft.appearanceName" type="text" />
                  </div>
                </label>
                <label class="canvas-scene-editor-field">
                  <span>Episódios</span>
                  <button class="canvas-role-editor-input canvas-scene-editor-select" type="button" :class="{ open: roleEditorMenu === 'episodes' }" @click="toggleRoleEditorMenu('episodes')">
                    <strong>{{ roleEditorDraft.episodes || '1' }}</strong>
                    <ChevronDown :size="16" />
                  </button>
                  <div v-if="roleEditorMenu === 'episodes'" class="canvas-scene-editor-dropdown episode-dropdown">
                    <button v-for="option in roleEditorEpisodeOptions" :key="'role-episode-' + option.value" type="button" :class="{ selected: isRoleEditorEpisodeSelected(option.value) }" @click="toggleRoleEditorEpisode(option.value)">
                      <span class="scene-editor-check"><Check v-if="isRoleEditorEpisodeSelected(option.value)" :size="13" /></span>
                      {{ option.label }}
                    </button>
                  </div>
                </label>
                <footer>
                  <button class="canvas-role-editor-cancel" type="button" @click="cancelRoleEditor">Cancel</button>
                  <button class="canvas-role-editor-save" type="button" @click="saveRoleEditor">Save</button>
                </footer>
              </section>
              <button class="canvas-side-add right" :class="{ active: isCanvasLinkHandleActive('roles', index, 'right') }" type="button" aria-label="Ligar role pela direita" data-link-type="roles" :data-link-index="index" data-link-side="right" @pointerdown.stop.prevent="startCanvasHandleDrag($event, 'roles', index, 'right')" @click.stop.prevent><Plus :size="28" /></button>
              <section
                v-if="isCanvasContextMenuFor('roles', index)"
                class="canvas-context-menu anchored"
                :class="canvasContextLinkSource.side"
                @pointerdown.stop
                @click.stop
              >
                <h3>{{ canvasContextMenuTitle }}</h3>
                <button
                  v-for="option in activeCanvasContextOptions"
                  :key="'role-context-' + option.id"
                  type="button"
                  :class="{ selected: option.id === canvasContextSelectedOptionId }"
                  @click="selectCanvasContextOption(option.id)"
                >
                  <component :is="option.icon" :size="18" />
                  <span>{{ option.label }}</span>
                </button>
              </section>
            </article>
          </div>

          <div class="canvas-scene-cluster">
            <div
              v-for="group in sceneGroupBackdrops"
              :key="group.id"
              class="canvas-scene-group-backdrop"
              :style="group.style"
              aria-hidden="true"
            ></div>
            <article v-for="(item, index) in productionAssets.scenes" :key="'scene-canvas-' + index" class="canvas-node canvas-scene-node" :data-canvas-key="canvasNodeKey('scenes', index)" :class="['scene-pos-' + (index % 6), { linking: isCanvasNodeLinking('scenes', index), active: isCanvasNodeActive('scenes', index) }]" :style="canvasNodeStyle('scenes', index)" @click.stop="handleCanvasNodeClick('scenes', index)" @contextmenu.capture.prevent.stop="openCanvasNodeContextMenu($event, 'scenes', index)">
              <header @pointerdown.stop="startCanvasNodeDrag($event, 'scenes', index)"><Image :size="14" />{{ item.name }}</header>
              <button class="canvas-side-add left" :class="{ active: isCanvasLinkHandleActive('scenes', index, 'left') }" type="button" aria-label="Ligar cena pela esquerda" data-link-type="scenes" :data-link-index="index" data-link-side="left" @pointerdown.stop.prevent="startCanvasHandleDrag($event, 'scenes', index, 'left')" @click.stop.prevent><Plus :size="28" /></button>
              <div v-if="!productionAssetImageSource(item) && isCanvasImageControlsVisible('scenes', index)" class="canvas-media-actions" @pointerdown.stop>
                <button type="button" :disabled="productionMediaUploading" @click.stop="openCanvasImageUpload('scenes', index)"><Upload :size="17" /> {{ isCanvasImageUploading('scenes', index) ? 'Enviando...' : 'Upload' }}</button>
                <button type="button" @click.stop="openCanvasImageLibrary('scenes', index)"><SquareArrowUp :size="17" /> Selecionar na biblioteca de Ativos</button>
              </div>
              <div class="canvas-node-card" :class="{ uploading: isCanvasImageUploading('scenes', index), generating: isCanvasImageGenerating('scenes', index) }" :aria-busy="isCanvasImageUploading('scenes', index) || isCanvasImageGenerating('scenes', index)" @pointerdown.stop="startCanvasNodeDrag($event, 'scenes', index)">
                <div class="canvas-node-preview">
                  <span v-if="isCanvasImageGenerating('scenes', index)" class="canvas-generating-preview"><LoaderCircle :size="36" class="animate-spin" /><strong>Generating</strong></span>
                  <img v-else-if="productionAssetImageSource(item)" :src="productionAssetImageSource(item)" :alt="item.name" draggable="false" @dragstart.prevent />
                  <Image v-else :size="38" />
                </div>
                <button v-if="productionAssetImageSource(item) && !isCanvasImageGenerating('scenes', index)" class="canvas-scene-replace" type="button" aria-label="Substituir imagem da cena" @pointerdown.stop @click.stop="openCanvasImageUpload('scenes', index)"><Upload :size="17" /></button>
                <button v-if="productionAssetImageSource(item) && !isCanvasImageGenerating('scenes', index)" class="canvas-media-library-button" type="button" aria-label="Selecionar outra imagem na biblioteca" @pointerdown.stop @click.stop="openCanvasImageLibrary('scenes', index)"><SquareArrowUp :size="17" /></button>
                <p><strong>{{ item.description || item.name + '_Base_Noite' }}</strong><em>{{ item.status || 'A ser adicionado' }}</em></p>
                <small>{{ productionAssetEpisodeLabel(item) }}</small>
                <button class="canvas-node-options" type="button" aria-label="Opções" @pointerdown.stop @click.stop="toggleProductionAssetMenu(item, index, 'scenes')"><MoreHorizontal :size="22" /></button>
              </div>
              <section v-if="isSceneEditorOpen(index)" class="canvas-role-editor-panel canvas-scene-editor-panel" :class="sceneEditorPlacement" @pointerdown.stop @click.stop>
                <label class="canvas-scene-editor-field">
                  <span>Enter scene name</span>
                  <button class="canvas-role-editor-input canvas-scene-editor-select" type="button" :class="{ open: sceneEditorMenu === 'name' }" @click="toggleSceneEditorMenu('name')">
                    <strong>{{ sceneEditorDraft.name || 'Unnamed scene' }}</strong>
                    <em>Select an existing scene</em>
                    <ChevronDown :size="16" />
                  </button>
                  <div v-if="sceneEditorMenu === 'name'" class="canvas-scene-editor-dropdown name-dropdown">
                    <button v-for="option in sceneEditorSceneOptions" :key="'scene-name-' + option" type="button" :class="{ selected: option === sceneEditorDraft.name }" @click="selectSceneEditorName(option)">{{ option }}</button>
                  </div>
                </label>
                <label>
                  <span>Nome da perspectiva</span>
                  <div class="canvas-role-editor-input">
                    <input v-model="sceneEditorDraft.perspectiveName" type="text" />
                  </div>
                </label>
                <label class="canvas-scene-editor-field">
                  <span>Episódio</span>
                  <button class="canvas-role-editor-input canvas-scene-editor-select" type="button" :class="{ open: sceneEditorMenu === 'episodes' }" @click="toggleSceneEditorMenu('episodes')">
                    <strong>{{ sceneEditorDraft.episodes || '1' }}</strong>
                    <ChevronDown :size="16" />
                  </button>
                  <div v-if="sceneEditorMenu === 'episodes'" class="canvas-scene-editor-dropdown episode-dropdown">
                    <button v-for="option in sceneEditorEpisodeOptions" :key="'scene-episode-' + option.value" type="button" :class="{ selected: isSceneEditorEpisodeSelected(option.value) }" @click="toggleSceneEditorEpisode(option.value)">
                      <span class="scene-editor-check"><Check v-if="isSceneEditorEpisodeSelected(option.value)" :size="13" /></span>
                      {{ option.label }}
                    </button>
                  </div>
                </label>
                <footer>
                  <button class="canvas-role-editor-cancel" type="button" @click="cancelSceneEditor">Cancel</button>
                  <button class="canvas-role-editor-save" type="button" @click="saveSceneEditor">Save</button>
                </footer>
              </section>
              <button class="canvas-side-add right" :class="{ active: isCanvasLinkHandleActive('scenes', index, 'right') }" type="button" aria-label="Ligar cena pela direita" data-link-type="scenes" :data-link-index="index" data-link-side="right" @pointerdown.stop.prevent="startCanvasHandleDrag($event, 'scenes', index, 'right')" @click.stop.prevent><Plus :size="28" /></button>
              <section
                v-if="isCanvasContextMenuFor('scenes', index)"
                class="canvas-context-menu anchored"
                :class="canvasContextLinkSource.side"
                @pointerdown.stop
                @click.stop
              >
                <h3>{{ canvasContextMenuTitle }}</h3>
                <button
                  v-for="option in activeCanvasContextOptions"
                  :key="'scene-context-' + option.id"
                  type="button"
                  :class="{ selected: option.id === canvasContextSelectedOptionId }"
                  @click="selectCanvasContextOption(option.id)"
                >
                  <component :is="option.icon" :size="18" />
                  <span>{{ option.label }}</span>
                </button>
              </section>
            </article>
          </div>

          <div class="canvas-asset-cluster">
            <template v-for="type in ['objects', 'media']" :key="'canvas-cluster-' + type">
              <article
                v-for="(item, index) in productionAssets[type]"
                :key="type + '-canvas-' + index"
                class="canvas-node canvas-asset-node"
                :class="{ 'canvas-image-node': isCanvasImageAsset(type), 'canvas-media-node': type === 'media', active: isCanvasNodeActive(type, index) }"
                :data-canvas-key="canvasNodeKey(type, index)"
                :style="canvasNodeStyle(type, index)"
                @click.stop="handleCanvasNodeClick(type, index)"
                @contextmenu.capture.prevent.stop="openCanvasNodeContextMenu($event, type, index)"
              >
                <button class="canvas-side-add left" :class="{ active: isCanvasLinkHandleActive(type, index, 'left') }" type="button" :aria-label="'Ligar ' + type + ' pela esquerda'" :data-link-type="type" :data-link-index="index" data-link-side="left" @pointerdown.stop.prevent="startCanvasHandleDrag($event, type, index, 'left')" @click.stop.prevent><Plus :size="28" /></button>
                <div v-if="isCanvasImageAsset(type)" class="canvas-media-label" @pointerdown.stop="startCanvasNodeDrag($event, type, index)">
                  <component :is="type === 'objects' ? Sparkles : Image" :size="14" />
                  <span>{{ type === 'objects' ? (item.name || 'Object') : 'Image' }}</span>
                </div>
                <div v-if="isCanvasImageAsset(type) && !productionAssetImageSource(item) && isCanvasImageControlsVisible(type, index)" class="canvas-media-actions" @pointerdown.stop>
                  <button type="button" :disabled="productionMediaUploading" @click.stop="openCanvasImageUpload(type, index)"><Upload :size="17" /> {{ isCanvasImageUploading(type, index) ? 'Enviando...' : 'Upload' }}</button>
                  <button type="button" @click.stop="openCanvasImageLibrary(type, index)"><SquareArrowUp :size="17" /> Selecionar na biblioteca de Ativos</button>
                </div>
                <div class="canvas-node-card" :class="{ 'canvas-media-card': isCanvasImageAsset(type), uploading: isCanvasImageUploading(type, index), generating: isCanvasImageGenerating(type, index) }" :aria-busy="isCanvasImageUploading(type, index) || isCanvasImageGenerating(type, index)" @pointerdown.stop="startCanvasNodeDrag($event, type, index)">
                  <div class="canvas-node-preview">
                    <span v-if="isCanvasImageGenerating(type, index)" class="canvas-generating-preview"><LoaderCircle :size="36" class="animate-spin" /><strong>Generating</strong></span>
                    <img v-else-if="productionAssetImageSource(item)" :src="productionAssetImageSource(item)" :alt="item.name" draggable="false" @dragstart.prevent />
                    <component :is="type === 'objects' ? Sparkles : Image" v-else :size="40" />
                  </div>
                  <button v-if="isCanvasImageAsset(type) && productionAssetImageSource(item) && !isCanvasImageGenerating(type, index)" class="canvas-media-replace" type="button" aria-label="Substituir imagem" @pointerdown.stop @click.stop="openCanvasImageUpload(type, index)">
                    <Upload :size="17" />
                  </button>
                  <button v-if="isCanvasImageAsset(type) && productionAssetImageSource(item) && !isCanvasImageGenerating(type, index)" class="canvas-media-library-button" type="button" aria-label="Selecionar outra imagem na biblioteca" @pointerdown.stop @click.stop="openCanvasImageLibrary(type, index)">
                    <SquareArrowUp :size="17" />
                  </button>
                </div>
                <button class="canvas-side-add right" :class="{ active: isCanvasLinkHandleActive(type, index, 'right') }" type="button" :aria-label="'Ligar ' + type + ' pela direita'" :data-link-type="type" :data-link-index="index" data-link-side="right" @pointerdown.stop.prevent="startCanvasHandleDrag($event, type, index, 'right')" @click.stop.prevent><Plus :size="28" /></button>
                <section
                  v-if="isCanvasContextMenuFor(type, index)"
                  class="canvas-context-menu anchored"
                  :class="canvasContextLinkSource.side"
                  @pointerdown.stop
                  @click.stop
                >
                  <h3>{{ canvasContextMenuTitle }}</h3>
                  <button
                    v-for="option in activeCanvasContextOptions"
                    :key="type + '-context-' + option.id"
                    type="button"
                    :class="{ selected: option.id === canvasContextSelectedOptionId }"
                    @click="selectCanvasContextOption(option.id)"
                  >
                    <component :is="option.icon" :size="18" />
                    <span>{{ option.label }}</span>
                  </button>
                </section>
              </article>
            </template>
          </div>
        </section>

        <section
          v-if="canvasGenerationChatOpen"
          class="canvas-generation-chat"
          :class="{ expanded: canvasChatExpanded }"
          :style="canvasGenerationChatStyle"
          @pointerdown.stop
          @click.stop="handleCanvasGenerationChatClick"
        >
          <button class="canvas-chat-expand" type="button" :aria-label="canvasChatExpanded ? 'Recolher prompt' : 'Expandir prompt'" @click.stop.prevent="toggleCanvasChatExpanded">
            <Maximize2 :size="18" />
          </button>
          <div v-if="canvasPromptMentionChips.length" class="canvas-prompt-reference-row">
            <span
              v-for="chip in canvasPromptMentionChips"
              :key="chip.key"
              class="canvas-prompt-reference-chip"
              :draggable="activeCanvasReferenceOccurrenceKey !== chip.key"
              @dragstart.capture="handleCanvasReferenceDragStart($event, chip)"
              @dragend="handleCanvasReferenceDragEnd"
            >
              <span class="canvas-prompt-reference-thumb">
                <img v-if="chip.source" :src="chip.source" :alt="chip.name" draggable="false" />
                <component :is="chip.type === 'roles' ? CircleUserRound : Image" v-else :size="20" />
              </span>
              <button
                v-if="chip.count > 1"
                class="canvas-prompt-reference-count"
                type="button"
                aria-label="Ver ocorrências"
                draggable="false"
                @pointerdown.stop
                @dragstart.prevent.stop
                @mouseenter.stop="openCanvasReferenceOccurrences(chip.key, $event)"
                @mouseleave.stop="closeCanvasReferenceOccurrences(chip.key)"
                @focus="openCanvasReferenceOccurrences(chip.key, $event)"
                @blur="closeCanvasReferenceOccurrences(chip.key)"
                @click.stop="openCanvasReferenceOccurrences(chip.key, $event)"
              >
                {{ chip.count }}
              </button>
              <span
                v-if="activeCanvasReferenceOccurrenceKey === chip.key"
                class="canvas-reference-occurrence-popover"
                :style="{ maxHeight: canvasReferenceOccurrenceMaxHeight + 'px' }"
                @mouseenter="openCanvasReferenceOccurrences(chip.key)"
                @mouseleave="closeCanvasReferenceOccurrences(chip.key)"
              >
                <span
                  v-for="occurrence in chip.occurrences"
                  :key="occurrence.id"
                  class="canvas-reference-occurrence-row"
                  :class="{ selected: activeCanvasReferenceOccurrenceId === occurrence.id }"
                  draggable="false"
                  @pointerdown.stop
                  @dragstart.prevent.stop
                  @click.stop="selectCanvasPromptMentionOccurrence(occurrence.id)"
                >
                  <button
                    class="canvas-reference-occurrence-select"
                    type="button"
                    draggable="false"
                    @dragstart.prevent
                    @click.stop="selectCanvasPromptMentionOccurrence(occurrence.id)"
                  >
                    {{ occurrence.label }}
                  </button>
                  <button
                    class="canvas-reference-occurrence-remove"
                    type="button"
                    aria-label="Remover menção"
                    draggable="false"
                    @dragstart.prevent
                    @click.stop="removeCanvasPromptMentionOccurrence(occurrence.id)"
                  >
                    <X :size="16" />
                  </button>
                </span>
              </span>
              <button type="button" aria-label="Remover referência" @click="removeCanvasPromptMention(chip)">
                <X :size="14" />
              </button>
            </span>
          </div>
          <div
            ref="canvasChatPromptInput"
            class="canvas-prompt-editor"
            :class="{ 'drag-target': canvasPromptDraggingReference }"
            contenteditable="true"
            spellcheck="false"
            role="textbox"
            :data-placeholder="canvasGenerationPlaceholder"
            @input="handleCanvasPromptInput"
            @keyup="updateCanvasInlineMentionMenu"
            @keydown="handleCanvasPromptKeydown"
            @keydown.enter.stop
            @scroll.passive="closeCanvasInlineMentionMenu"
            @mouseover="handleCanvasPromptMentionHover"
            @mouseout="handleCanvasPromptMentionOut"
            @dragover.prevent.stop="handleCanvasPromptDragOver"
            @dragleave="handleCanvasPromptDragLeave"
            @drop.prevent.stop="handleCanvasPromptDrop"
          ></div>
          <Teleport to="body">
            <section
              v-if="canvasInlineMentionMenu.open"
              class="canvas-chat-popover canvas-mention-menu canvas-inline-mention-menu"
              :style="{ left: canvasInlineMentionMenu.x + 'px', top: canvasInlineMentionMenu.y + 'px' }"
              @pointerdown.prevent
              @click.stop
            >
              <h3>Mencionar</h3>
              <div v-if="canvasInlineMentionQuery" class="canvas-mention-recents inline-results">
                <button
                  v-for="item in canvasInlineMentionItems"
                  :key="'inline-mention-' + item.key"
                  type="button"
                  :class="{ active: item.key === activeCanvasInlineMentionKey }"
                  @click="insertCanvasInlineMention(item)"
                >
                  <span class="canvas-mention-thumb">
                    <img v-if="item.source" :src="item.source" :alt="item.name" />
                    <component :is="item.type === 'roles' ? CircleUserRound : Image" v-else :size="15" />
                  </span>
                  <strong>{{ item.name }}</strong>
                </button>
                <p v-if="!canvasInlineMentionItems.length">Nenhum item encontrado</p>
              </div>
              <template v-else>
                <div class="canvas-mention-recents">
                  <button
                    v-for="item in canvasInlineMentionVisibleItems"
                    :key="'inline-quick-' + item.key"
                    type="button"
                    :class="{ active: item.key === activeCanvasInlineMentionKey }"
                    @click="insertCanvasInlineMention(item)"
                  >
                    <span class="canvas-mention-thumb">
                      <img v-if="item.source" :src="item.source" :alt="item.name" />
                      <component :is="item.type === 'roles' ? CircleUserRound : Image" v-else :size="15" />
                    </span>
                    <strong>{{ item.name }}</strong>
                  </button>
                </div>
                <button
                  v-for="group in canvasMentionGroups"
                  :key="'inline-group-' + group.id"
                  type="button"
                  @mouseenter="openCanvasMentionGroup(group.id)"
                  @focus="openCanvasMentionGroup(group.id)"
                  @click="toggleCanvasMentionGroup(group.id)"
                >
                  <span><component :is="group.icon" :size="16" /></span>
                  <strong>{{ group.label }}</strong>
                  <em>{{ expandedCanvasMentionGroup === group.id ? 'Collapse' : 'Expand' }}</em>
                  <ChevronRight :size="15" />
                </button>
              </template>
              <div v-if="!canvasInlineMentionQuery && expandedCanvasMentionGroup" class="canvas-mention-items">
                <button v-for="item in activeCanvasMentionItems" :key="'inline-group-item-' + item.key" type="button" @click="insertCanvasInlineMention(item)">
                  <span class="canvas-mention-thumb">
                    <img v-if="item.source" :src="item.source" :alt="item.name" />
                    <component :is="item.type === 'roles' ? CircleUserRound : Image" v-else :size="15" />
                  </span>
                  <strong>{{ item.name }}</strong>
                </button>
              </div>
            </section>
          </Teleport>
          <Teleport to="body">
            <section
              v-if="canvasMentionPreview"
              class="canvas-mention-hover-card"
              :style="{ left: canvasMentionPreview.x + 'px', top: canvasMentionPreview.y + 'px' }"
              aria-hidden="true"
            >
              <span class="canvas-mention-hover-visual">
                <img v-if="canvasMentionPreview.source" :src="canvasMentionPreview.source" :alt="canvasMentionPreview.name" />
                <component :is="canvasMentionPreview.type === 'roles' ? CircleUserRound : Image" v-else :size="25" />
              </span>
              <span class="canvas-mention-hover-text">
                <span>{{ canvasMentionPreview.type === 'roles' ? 'Role' : canvasMentionPreview.type === 'scenes' ? 'Scene' : 'Image' }}</span>
                <strong>{{ canvasMentionPreview.name }}</strong>
              </span>
            </section>
          </Teleport>
          <Teleport to="body">
            <span
              v-if="canvasReferenceDragPreview"
              class="canvas-reference-drag-preview"
              :style="{ left: canvasReferenceDragPreview.x + 'px', top: canvasReferenceDragPreview.y + 'px' }"
              aria-hidden="true"
            >
              <img v-if="canvasReferenceDragPreview.source" :src="canvasReferenceDragPreview.source" :alt="canvasReferenceDragPreview.name" draggable="false" />
              <component :is="canvasReferenceDragPreview.type === 'roles' ? CircleUserRound : Image" v-else :size="14" />
              <span>{{ canvasReferenceDragPreview.name }}</span>
            </span>
          </Teleport>
          <div class="canvas-chat-toolbar">
            <button class="canvas-chat-add-reference" type="button" aria-label="Adicionar imagem de referência" title="Adicionar imagem de referência" :disabled="canvasReferenceUploading" @click="openCanvasReferenceUpload"><LoaderCircle v-if="canvasReferenceUploading" :size="16" class="animate-spin" /><Plus v-else :size="17" /></button>
            <button type="button" aria-label="Mencionar" @click="toggleCanvasChatMenu('mention')"><AtSign :size="16" /></button>
            <button class="canvas-chat-style-trigger" type="button" :class="{ active: styleLibraryOpen }" @click="openCanvasStyleLibrary">
              <Palette :size="16" /> <span>Style</span> <ChevronDown class="canvas-chat-chevron" :size="14" />
            </button>
            <button class="canvas-chat-model-trigger" type="button" :class="{ active: canvasChatMenu === 'model' }" @click="toggleCanvasChatMenu('model')">
              <span class="canvas-model-mark"></span> <strong>{{ selectedCanvasImageModelLabel }}</strong> <ChevronDown class="canvas-chat-chevron" :size="14" />
            </button>
            <button class="canvas-chat-ratio-trigger" type="button" :class="{ active: canvasChatMenu === 'ratio' }" @click="toggleCanvasChatMenu('ratio')">
              <span>{{ canvasChatRatioDisplay }}</span><i aria-hidden="true"></i><span>{{ canvasChatResolution }}</span><ChevronDown class="canvas-chat-chevron" :size="14" />
            </button>
            <span class="canvas-chat-spacer"></span>
            <button class="canvas-chat-optimize" type="button" aria-label="Otimizar prompt" title="Otimizar prompt" :disabled="canvasPromptOptimizing || !canvasGenerationPrompt.trim()" @click="optimizeCanvasPrompt"><LoaderCircle v-if="canvasPromptOptimizing" :size="17" class="animate-spin" /><Sparkles v-else :size="17" /></button>
            <button class="canvas-chat-send" type="button" :disabled="canvasSendLoading || !canvasGenerationPrompt.trim()" @click="generateCanvasImage"><LoaderCircle v-if="canvasSendLoading" :size="20" class="animate-spin" /><ArrowUp v-else :size="20" /></button>
          </div>

          <section v-if="canvasChatMenu === 'mention'" class="canvas-chat-popover canvas-mention-menu">
            <h3>Mencionar</h3>
            <div class="canvas-mention-recents">
              <button v-for="item in canvasMentionQuickItems" :key="'quick-' + item.key" type="button" @click="insertCanvasMention(item)">
                <span class="canvas-mention-thumb">
                  <img v-if="item.source" :src="item.source" :alt="item.name" />
                  <component :is="item.type === 'roles' ? CircleUserRound : Image" v-else :size="15" />
                </span>
                <strong>{{ item.name }}</strong>
              </button>
            </div>
            <button
              v-for="group in canvasMentionGroups"
              :key="'mention-' + group.id"
              type="button"
              @mouseenter="openCanvasMentionGroup(group.id)"
              @focus="openCanvasMentionGroup(group.id)"
              @click="toggleCanvasMentionGroup(group.id)"
            >
              <span><component :is="group.icon" :size="16" /></span>
              <strong>{{ group.label }}</strong>
              <em>{{ expandedCanvasMentionGroup === group.id ? 'Collapse' : 'Expand' }}</em>
              <ChevronRight :size="15" />
            </button>
            <div v-if="expandedCanvasMentionGroup" class="canvas-mention-items">
              <button v-for="item in activeCanvasMentionItems" :key="item.key" type="button" @click="insertCanvasMention(item)">
                <span class="canvas-mention-thumb">
                  <img v-if="item.source" :src="item.source" :alt="item.name" />
                  <component :is="item.type === 'roles' ? CircleUserRound : Image" v-else :size="15" />
                </span>
                <strong>{{ item.name }}</strong>
              </button>
            </div>
          </section>

          <section v-if="canvasChatMenu === 'model'" class="canvas-chat-popover canvas-model-menu">
            <h3>Model selection</h3>
            <button v-for="model in canvasImageModelOptions" :key="model.key" type="button" :class="{ selected: selectedCanvasImageModelKey === model.key }" @click="selectCanvasImageModel(model.key)">
              <span class="canvas-model-mark"></span>
              <strong>{{ model.label }}</strong>
              <small>{{ model.description }}</small>
              <Check v-if="selectedCanvasImageModelKey === model.key" :size="18" />
            </button>
          </section>

          <section v-if="canvasChatMenu === 'ratio'" class="canvas-chat-popover canvas-ratio-menu">
            <h3>Resolução</h3>
            <div class="canvas-resolution-row">
              <button type="button" :class="{ selected: canvasChatResolution === '3K' }" @click="canvasChatResolution = '3K'">3K</button>
              <button type="button" :class="{ selected: canvasChatResolution === '4K' }" @click="canvasChatResolution = '4K'">4K</button>
            </div>
            <h3>Aspect ratio</h3>
            <div class="canvas-ratio-grid">
              <button v-for="ratio in canvasChatRatioOptions" :key="'chat-ratio-' + ratio" type="button" :class="{ selected: canvasChatRatio === ratio }" @click="selectCanvasChatRatio(ratio)">
                <span class="canvas-ratio-shape" :class="'ratio-' + ratio.replace(':', '-')"></span>
                <strong>{{ ratio }}</strong>
                <Check v-if="canvasChatRatio === ratio" :size="14" />
              </button>
            </div>
          </section>

        </section>

        <div class="canvas-bottom-tools">
          <button type="button" aria-label="Desfazer"><RotateCcw :size="19" /></button>
          <button type="button" aria-label="Visão em grade"><Grid3X3 :size="18" /></button>
          <button type="button" :class="{ active: canvasConnectMode }" aria-label="Conexões" @click.stop="toggleCanvasConnectMode"><Share2 :size="18" /></button>
          <button type="button" aria-label="Mapa"><MapPin :size="18" /></button>
          <button class="active" type="button" aria-label="Auto ajuste" @click.stop="autoFitCanvas"><Scan :size="19" /></button>
          <span></span>
          <button type="button" aria-label="Diminuir zoom" :disabled="canvasZoom <= canvasZoomMin" @click.stop="decreaseCanvasZoom">-</button>
          <strong>{{ canvasZoom }}%</strong>
          <button type="button" aria-label="Aumentar zoom" :disabled="canvasZoom >= canvasZoomMax" @click.stop="increaseCanvasZoom">+</button>
        </div>
      </main>

      <main v-else-if="productionAssetsReady" class="agent-main production-assets-main">
        <div class="production-assets-toolbar">
          <nav class="production-tabs" aria-label="Tipos de ativos">
            <button
              v-for="tab in productionTabs"
              :key="'assets-' + tab.id"
              type="button"
              :class="{ active: activeProductionTab === tab.id }"
              @click="setProductionTab(tab.id)"
            >
              <component :is="tab.icon" :size="16" />
              {{ tab.label }} <em>{{ tab.count }}</em>
            </button>
          </nav>
          <button class="edit-screen-button" type="button" @click="openProductionCanvasOverview">
            Editar na tela <ChevronRight :size="14" />
          </button>
        </div>

        <section class="asset-setup-panel" :class="{ selecting: productionAssetSelectionActive }">
          <template v-if="productionAssetSelectionActive">
            <h2>{{ productionSelectionTitle }}</h2>
            <div class="asset-selection-actions">
              <button class="asset-select-all" :class="{ selected: allActiveProductionAssetsSelected }" type="button" aria-label="Selecionar todos" @click="toggleAllProductionAssets">
                <Check v-if="allActiveProductionAssetsSelected" :size="13" />
              </button>
              <span>Selecionar tudo</span>
              <button class="asset-exit-button" type="button" @click="exitProductionAssetSelection">Sair</button>
              <button class="asset-bulk-delete-button" type="button" :disabled="!selectedProductionAssetKeys.length" @click="requestDeleteSelectedProductionAssets">
                <Trash2 :size="14" /> Excluir {{ selectedProductionAssetKeys.length || '' }}
              </button>
              <button class="asset-generate-button" type="button" :disabled="!selectedProductionAssetKeys.length" @click="exitProductionAssetSelection">Gerar {{ selectedProductionAssetKeys.length || '' }}</button>
            </div>
          </template>
          <template v-else>
            <div>
              <h2>{{ productionPanelTitle }}</h2>
              <p>{{ productionPanelSubtitle }}</p>
            </div>
            <button type="button" @click="enterProductionAssetSelection">Selecionar</button>
          </template>
        </section>

        <section class="asset-card-grid" :class="['asset-grid-' + activeProductionTab, { 'asset-grid-image': isCanvasImageAsset(activeProductionTab) }]">
          <article
            v-for="(item, index) in activeProductionItems"
            :key="'asset-' + activeProductionTab + '-' + index"
            class="asset-card"
            :class="{ selectable: productionAssetSelectionActive, selected: isProductionAssetSelected(item, index) }"
            role="button"
            tabindex="0"
            @click="handleProductionAssetCardClick(item, index)"
            @keydown.enter.prevent="handleProductionAssetCardClick(item, index)"
          >
            <span v-if="productionAssetSelectionActive" class="asset-card-check">
              <Check v-if="isProductionAssetSelected(item, index)" :size="13" />
            </span>
            <div v-else class="asset-card-menu-wrap">
              <button
                class="asset-card-menu-trigger"
                :class="{ active: openProductionAssetMenuKey === productionAssetKey(item, index) }"
                type="button"
                aria-label="Opções do ativo"
                @click.stop="toggleProductionAssetMenu(item, index)"
              >
                <MoreHorizontal :size="19" />
              </button>
              <div v-if="openProductionAssetMenuKey === productionAssetKey(item, index)" class="asset-card-menu" @click.stop>
                <button type="button" @click="requestDeleteProductionAsset(item, index)"><Trash2 :size="15" /> Excluir</button>
              </div>
            </div>
            <span v-if="item.main" class="main-role-pill">Main role</span>
            <div class="asset-preview">
              <img v-if="productionAssetImageSource(item)" :src="productionAssetImageSource(item)" :alt="item.name" />
              <CircleUserRound v-else-if="activeProductionTab === 'roles'" :size="44" />
              <Image v-else :size="44" />
            </div>
            <h3>{{ item.name }}</h3>
            <p>{{ productionAssetStatusLabel(item, activeProductionTab) }}</p>
          </article>

          <article
            class="asset-card new-asset-card"
            :class="{ blocked: productionAssetSelectionActive, 'new-media-card': isCanvasImageAsset(activeProductionTab) }"
            role="button"
            :aria-disabled="productionAssetSelectionActive"
            :tabindex="productionAssetSelectionActive ? -1 : 0"
            @click="handleProductionCreateCard"
            @keydown.enter.prevent="handleProductionCreateCard"
          >
            <div class="asset-preview add-asset-preview">
              <Plus class="create-plus-icon" :size="40" />
              <X v-if="isCanvasImageAsset(activeProductionTab)" class="create-close-icon" :size="40" />
            </div>
            <h3>{{ activeProductionTab === 'media' ? 'Nova mídia' : activeProductionTab === 'objects' ? 'Novo objeto' : `New ${activeProductionTab === 'roles' ? 'role' : 'scene'}` }}</h3>
            <p v-if="!isCanvasImageAsset(activeProductionTab)">Criar na tela</p>
            <div v-if="isCanvasImageAsset(activeProductionTab)" class="asset-create-menu" @click.stop>
              <button type="button" @click="openCanvasImageUpload(activeProductionTab, productionAssets[activeProductionTab].length)"><UploadCloud :size="17" /> Carregar do computador</button>
              <button type="button" @click="createProductionAssetFromGrid"><ExternalLink :size="17" /> Criar na tela</button>
            </div>
          </article>
        </section>
      </main>

      <main v-else-if="episodeStageOpen" class="agent-main episode-stage-main">
        <section class="episode-stage-head">
          <div>
            <h1>Episódios</h1>
            <p><strong>{{ episodeSummaries.length }} episódios</strong><span></span>Gere roteiros de gravação para os episódios selecionados.</p>
          </div>
          <div class="episode-stage-actions">
            <template v-if="batchSelectionActive">
              <button type="button" @click="cancelBatchSelection">Cancelar</button>
              <button type="button" @click="selectAllEpisodes"><ListChecks :size="15" />Selecionar tudo</button>
              <button v-if="selectedEpisodeIds.length" class="episode-stage-delete-action" type="button" @click="deleteSelectedEpisodes"><Trash2 :size="15" />Excluir</button>
              <button v-if="selectedEpisodeIds.length" type="button" :disabled="episodeScriptsGenerating" @click="generateSelectedEpisodeScripts"><WandSparkles :size="15" />Gerar todos</button>
            </template>
            <template v-else>
              <button type="button" @click="openAddEpisodeModal"><Plus :size="16" />Adicionar episódio</button>
              <button type="button" @click="toggleBatchSelection"><ListChecks :size="15" />Selecionar</button>
            </template>
          </div>
        </section>

        <section v-if="episodeSummaries.length" class="episode-card-grid" :class="{ selecting: batchSelectionActive }">
          <article
            v-for="episode in episodeSummaries"
            :key="'episode-stage-' + episode.id"
            class="episode-stage-card"
            :class="{ selected: selectedEpisodeIds.includes(episode.id), generating: isEpisodeGenerating(episode.id) }"
            @click="handleEpisodeCardClick(episode)"
          >
            <button v-if="batchSelectionActive" class="episode-card-select" type="button" :aria-label="`Selecionar episódio ${episode.id}`" @click.stop="toggleEpisodeSelection(episode.id)"><Check v-if="selectedEpisodeIds.includes(episode.id)" :size="12" /></button>
            <div class="episode-card-thumb">
              <Video :size="25" />
            </div>
            <div class="episode-card-copy">
              <span>{{ isEpisodeGenerating(episode.id) ? 'Gerando' : 'A gerar' }}</span>
              <h2>Episódio {{ episode.id }}: {{ episode.title }}</h2>
              <p>{{ episodeRoleCount(episode) }} papéis · {{ episodeSceneCount(episode) }} cenas</p>
              <small v-if="batchSelectionActive">O clipe gerado será exibido aqui</small>
              <button
                v-if="!batchSelectionActive"
                type="button"
                :disabled="episodeScriptsGenerating"
                @click.stop="generateEpisodeScripts(1, [episode.id], true)"
              ><WandSparkles :size="14" />Gerar roteiro de gravação</button>
            </div>
          </article>
        </section>

        <section v-else class="episode-stage-empty">
          <h2>Nenhum episódio criado</h2>
          <p>Adicione um episódio para montar a lista de gravação.</p>
          <button type="button" @click="openAddEpisodeModal"><Plus :size="16" />Adicionar episódio</button>
        </section>
      </main>

      <main v-else class="agent-main">
        <section class="agent-title-block" :class="{ 'episodes-title-block': episodeOutlinesReady }">
          <div class="agent-title-row">
            <div>
              <h1>{{ episodeOutlinesReady ? `${scriptDraft.episodes} episódios` : 'Estrutura do roteiro' }}</h1>
              <p>{{ agentStageSubtitle }}</p>
            </div>
            <div v-if="episodeOutlinesReady" class="episode-batch-actions">
              <template v-if="batchSelectionActive">
                <button type="button" @click="cancelBatchSelection">Cancelar</button>
                <button type="button" @click="selectAllEpisodes"><Check :size="15" /> Selecionar tudo</button>
                <button class="batch-generate-button" type="button" :disabled="!selectedPendingEpisodeIds.length" @click="generateSelectedEpisodes"><WandSparkles :size="14" /> Gerar em lote</button>
              </template>
              <button v-else class="batch-selection-button" type="button" @click="toggleBatchSelection"><Check :size="15" /> Seleção em lote</button>
            </div>
          </div>
        </section>
        <section class="script-structure-card" :class="{ generating: scriptGenerating || episodeOutlineGenerating || episodeScriptsGenerating, 'episodes-ready': episodeOutlinesReady }">
          <div class="script-card-scroll">
            <details class="script-section" :open="!generatedScriptReady && !episodeOutlineGenerating">
              <summary><ChevronRight class="summary-chevron" :size="16" /> Ideia original</summary>
              <p v-if="scriptGenerating || generatedScriptReady" class="script-locked-value">{{ scriptDraft.idea }}</p>
              <textarea v-else class="script-idea-input" v-model="scriptDraft.idea" rows="2" spellcheck="true" placeholder="Descreva a ideia original"></textarea>
            </details>

            <div v-if="scriptGenerating" class="script-loading-row"><LoaderCircle :size="17" /><span>Expandindo ideia do roteiro...</span></div>

            <template v-else>
              <details class="script-section expanded" :open="!episodeOutlineGenerating && !episodeOutlinesReady">
                <summary><ChevronRight class="summary-chevron" :size="16" /> Resumo do roteiro</summary>
                <template v-if="summaryLocked">
                  <div class="script-summary-readonly-grid">
                    <div><span>Número personalizado de episódios</span><strong>{{ scriptDraft.episodes }}</strong></div>
                    <div><span>Tipo de história</span><strong>{{ scriptDraft.storyType }}</strong></div>
                    <div><span>Público-alvo</span><strong>{{ scriptDraft.audience }}</strong></div>
                  </div>
                  <div class="script-summary-readonly-copy">
                    <div><span>Gancho principal</span><p>{{ scriptDraft.hook }}</p></div>
                    <div><span>Sinopse curta</span><p>{{ scriptDraft.shortSynopsis }}</p></div>
                    <div><span>Bio do personagem</span><p>{{ scriptDraft.characterBio }}</p></div>
                  </div>
                </template>
                <template v-else>
                  <div class="script-summary-grid">
                    <div class="script-inline-field">
                      <label for="script-episode-count">Número personalizado de episódios</label>
                      <div class="episode-number-control">
                        <input id="script-episode-count" v-model.number="scriptDraft.episodes" type="number" min="1" max="999" @change="syncEpisodeCountFromDraft" />
                        <div class="episode-stepper" aria-label="Alterar número de episódios">
                          <button type="button" aria-label="Aumentar episódios" :disabled="scriptDraft.episodes >= 999" @click="stepEpisodeCount(1)">
                            <ChevronUp :size="11" />
                          </button>
                          <button type="button" aria-label="Diminuir episódios" :disabled="scriptDraft.episodes <= 1" @click="stepEpisodeCount(-1)">
                            <ChevronDown :size="11" />
                          </button>
                        </div>
                      </div>
                    </div>
                    <label class="script-inline-field">
                      <span>Tipo de história</span>
                      <input v-model="scriptDraft.storyType" type="text" />
                    </label>
                    <label class="script-inline-field">
                      <span>Público-alvo</span>
                      <input v-model="scriptDraft.audience" type="text" />
                    </label>
                  </div>
                  <article class="script-editable-field"><label for="script-synopsis">Sinopse</label><textarea id="script-synopsis" v-model="scriptDraft.synopsis" rows="9" spellcheck="true" placeholder="Edite a sinopse do roteiro"></textarea></article>
                  <article class="script-editable-field"><label for="script-hook">Gancho principal</label><textarea id="script-hook" v-model="scriptDraft.hook" rows="2" spellcheck="true"></textarea></article>
                  <article class="script-editable-field"><label for="script-short-synopsis">Sinopse curta</label><textarea id="script-short-synopsis" v-model="scriptDraft.shortSynopsis" rows="3" spellcheck="true"></textarea></article>
                  <article class="script-editable-field"><label for="script-character-bio">Bio do personagem</label><textarea id="script-character-bio" v-model="scriptDraft.characterBio" rows="7" spellcheck="true"></textarea></article>
                </template>
              </details>
              <div v-if="episodeOutlineGenerating" class="script-loading-row episode-outline-loading"><LoaderCircle :size="17" /><span>Gerando esboço do episódio... <small>(cerca de 1 min de espera)</small></span></div>
              <details v-if="episodeOutlinesReady" class="script-section episode-script-section" open>
                <summary><ChevronRight class="summary-chevron" :size="16" /> Roteiro do episódio <button class="expand-script-chip" type="button" @click.prevent.stop="toggleAllEpisodeScripts">{{ allEpisodeScriptsExpanded ? 'Recolher roteiro' : 'Expandir roteiro' }}</button></summary>
                <div class="episode-outline-list" :class="{ 'selection-mode': batchSelectionActive }">
                  <details v-for="episode in episodeSummaries" :key="episode.id" :open="episode.expanded" :class="{ selected: !episode.scriptReady && selectedEpisodeIds.includes(episode.id), ready: episode.scriptReady, failed: episode.generationError, disabled: batchSelectionActive && episode.scriptReady }" @toggle="syncEpisodeExpanded($event, episode.id)">
                    <summary @click="handleEpisodeSummaryClick($event, episode.id)">
                      <span v-if="batchSelectionActive && !episode.scriptReady" class="episode-select-box"><Check v-if="selectedEpisodeIds.includes(episode.id)" :size="11" /></span><span v-else-if="batchSelectionActive" class="episode-select-box disabled"><Check :size="11" /></span>
                      <ChevronRight v-else class="episode-row-chevron" :size="13" />
                      <strong>{{ episode.id }}.</strong>
                      <span>{{ episode.title }}</span>
                      <em v-if="isEpisodeGenerating(episode.id)" class="episode-generating-pill">Gerando</em>
                      <em v-else-if="episode.scriptReady" class="episode-ready-pill">Concluído</em>
                    </summary>
                    <textarea v-if="episode.scriptReady" v-model="episode.script" class="episode-script-text episode-script-editor" spellcheck="true" @input="queueEpisodeAutosave"></textarea>
                    <p v-else>{{ episode.summary }}</p>
                    <div v-if="episode.generationError && !isEpisodeGenerating(episode.id)" class="episode-inline-error"><span>{{ episode.generationError }}</span></div>
                    <div v-if="isEpisodeGenerating(episode.id)" class="episode-inline-loading"><LoaderCircle :size="14" /><span>Gerando roteiro... <small>(cerca de 1-3 min de espera)</small></span></div>
                    <button v-if="!episode.scriptReady && !isEpisodeGenerating(episode.id)" class="episode-generate-button" type="button" :disabled="episodeScriptsGenerating" @click="generateEpisodeScripts(1, [episode.id])"><WandSparkles :size="13" /> Gerar</button>
                  </details>
                </div>
              </details>
            </template>
          </div>
        </section>
      </main>

      <div v-if="!productionAnalysisGenerating && !productionAssetsReady && !episodeStageOpen" class="agent-status-bar" :class="{ 'episodes-ready': episodeOutlinesReady && !episodeScriptsGenerating }">
        <span class="agent-bot-dot"><WandSparkles :size="15" /></span>
        <strong>{{ agentStatusText }}</strong>
        <button v-if="scriptGenerating || episodeOutlineGenerating || episodeScriptsGenerating" type="button" @click="stopScriptGeneration">Stop</button>
        <template v-else-if="episodeOutlinesReady && allEpisodeScriptsReady">
          <button type="button" @click="requestOpenProductionAssetsStep">Continuar ?</button>
        </template>
        <template v-else-if="episodeOutlinesReady">
          <button class="generate-all-episodes" type="button" :disabled="pendingEpisodeCount === 0 || (batchSelectionActive && !selectedPendingEpisodeIds.length)" @click="batchSelectionActive ? generateSelectedEpisodes() : generateAllPendingEpisodes()"><Sparkles :size="12" /> {{ episodeGenerateButtonLabel }}</button>
          <button type="button" :disabled="pendingEpisodeCount === 0" @click="generateNextEpisodeScript"><Sparkles :size="12" /> Gerar 1 episódio</button>
        </template>
        <button v-else type="button" :disabled="creatingProject" @click="continueGeneratedScript">{{ creatingProject ? 'Criando...' : 'Continuar ?' }}</button>
      </div>

      <div v-if="productionAssetsReady" class="agent-status-bar production-assets-status">
        <span class="agent-bot-dot"><WandSparkles :size="15" /></span>
        <strong>Os Ativos de produção serão usados para gerar clipes. Adicione ou ajuste antes de continuar</strong>
        <button class="asset-back-button" type="button" aria-label="Voltar para roteiros" @click="backToEpisodeScripts"><ArrowLeft :size="15" /></button>
        <button type="button" @click="requestOpenEpisodesStep">Continuar <ChevronRight :size="15" /></button>
      </div>
    </div>
    <header v-else class="story-topbar">
      <button class="story-brand" type="button" @click.stop="navigateTo('/')">
        <span class="story-brand-mark">
          <img :src="brandLogo" alt="Huobao Drama" />
        </span>
        <span class="story-brand-name">Huobao</span>
      </button>

      <div class="story-account">

        <div class="story-menu-wrap">
          <button class="round-control language-trigger" type="button" aria-label="Idioma" @click.stop="toggleLanguageMenu">
            <Globe2 :size="23" />
            <b :data-label="selectedLanguageCode">{{ selectedLanguageCode }}</b>
          </button>
          <div v-if="showLanguageMenu" class="language-menu floating-panel" @click.stop>
            <button
              v-for="language in languages"
              :key="language"
              class="language-option"
              :class="{ selected: language === selectedLanguage }"
              type="button"
              @click="selectLanguage(language)"
            >
              <Check v-if="language === selectedLanguage" :size="17" />
              <span v-else></span>
              {{ language }}
            </button>
          </div>
        </div>

        <div class="story-menu-wrap">
          <button class="avatar-button" type="button" aria-label="Conta" @click.stop="toggleAccountMenu">
            <img :src="brandLogo" alt="" />
          </button>
          <div v-if="showAccountMenu" class="account-menu floating-panel" @click.stop>
            <div class="account-identity">
              <span class="account-avatar">
                <img :src="brandLogo" alt="" />
              </span>
              <strong>user{{ accountId }}</strong>
              <span>g***a@gmail.com</span>
            </div>
            <button class="account-row" type="button"><CircleUserRound :size="20" /> Informacoes da conta</button>
            <button class="account-row" type="button"><CreditCard :size="20" /> Planos e precos</button>
            <button class="account-row" type="button"><ShieldCheck :size="20" /> Autorizacao de conta</button>
            <button class="account-row has-arrow" type="button"><FileText :size="20" /> Termos e Politicas <ChevronRight :size="18" /></button>
            <button class="account-row" type="button"><LogOut :size="20" /> Sair</button>
          </div>
        </div>
      </div>
    </header>

    <main v-if="!scriptFlowActive" class="story-main">
      <section class="story-hero">
        <h1>Story Studio</h1>
        <p>Your AI story agent for short drama, AI films, and more</p>
      </section>

      <section class="story-composer" aria-label="Story Studio">
        <div class="composer-tabs">
          <button
            v-for="tab in composerTabs"
            :key="tab.id"
            class="composer-tab"
            :class="{ active: activeComposer === tab.id }"
            type="button"
            @click="activeComposer = tab.id"
          >
            <component :is="tab.icon" :size="15" />
            {{ tab.label }}
          </button>
        </div>

        <div class="composer-panel">
          <div v-if="activeComposer === 'upload'" class="upload-drop">
            <input
              ref="fileInput"
              class="sr-only"
              type="file"
              accept=".txt,.md,.doc,.docx"
              @change="handleFileUpload"
            />
            <div class="upload-actions">
              <button class="primary-black" type="button" @click="fileInput?.click()">
                <Plus :size="17" />
                Carregar roteiro
              </button>
              <button class="soft-button" type="button" @click="openPasteModal">Colar texto</button>
            </div>
            <p>Arraste o arquivo aqui para carregar (.txt/.docx, max. 100 mil caracteres)</p>
          </div>

          <div v-else-if="activeComposer === 'ai'" class="ai-writer">
            <textarea
              v-model="aiPrompt"
              maxlength="100000"
              placeholder="Descreva o cenario, personagens, trama, final e mais da historia"
            ></textarea>
            <div class="ai-controls">
              <div class="ai-control-wrap">
                <button
                  class="ai-chip"
                  :class="{ active: styleLibraryOpen }"
                  type="button"
                  aria-haspopup="dialog"
                  :aria-expanded="styleLibraryOpen"
                  @click.stop="toggleStyleLibrary"
                >
                  <img v-if="selectedStyleItem?.image" class="ai-chip-thumb" :src="assetUrl(selectedStyleItem.image)" :alt="selectedStyleItem.label" />
                  <WandSparkles v-else-if="selectedStyleItem?.automatic" :size="16" />
                  <Palette v-else :size="16" />
                  <span>{{ selectedStyleItem?.label || 'Biblioteca de estilos' }}</span>
                  <ChevronDown :size="15" />
                </button>
              </div>

              <div class="ai-control-wrap">
                <button
                  class="ai-chip"
                  :class="{ active: openControl === 'ratio' }"
                  type="button"
                  aria-haspopup="menu"
                  :aria-expanded="openControl === 'ratio'"
                  @click.stop="toggleControl('ratio')"
                >
                  <Scan :size="16" />
                  <span>{{ selectedRatio }}</span>
                  <ChevronDown :size="15" />
                </button>
                <div v-if="openControl === 'ratio'" class="control-popover ratio-popover" role="menu" @click.stop>
                  <button
                    v-for="ratio in ratioOptions"
                    :key="ratio"
                    class="ratio-option"
                    :class="{ selected: selectedRatio === ratio }"
                    type="button"
                    role="menuitemradio"
                    :aria-checked="selectedRatio === ratio"
                    @click="selectRatio(ratio)"
                  >
                    <span class="ratio-shape"></span>
                    <span>{{ ratio }}</span>
                  </button>
                </div>
              </div>

              <div class="ai-control-wrap">
                <button
                  class="ai-chip"
                  :class="{ active: openControl === 'episodes' }"
                  type="button"
                  aria-haspopup="menu"
                  :aria-expanded="openControl === 'episodes'"
                  @click.stop="toggleControl('episodes')"
                >
                  <ListChecks :size="16" />
                  <span>{{ productionProfileLabel }}</span>
                  <ChevronDown :size="15" />
                </button>
                <div v-if="openControl === 'episodes'" class="control-popover cinematic-setup-popover" role="dialog" aria-label="Configuração da produção" @click.stop>
                  <header>
                    <div>
                      <strong>Configuração da produção</strong>
                      <span>A skill recomenda partes e painéis depois de analisar a ideia.</span>
                    </div>
                    <span class="cinematic-engine-badge" :class="{ ready: cinematicEngineReady }">
                      {{ cinematicEngineReady ? 'Skill ativa' : 'Skill local' }}
                    </span>
                  </header>

                  <div class="cinematic-setup-grid">
                    <label>
                      <span>Temporadas</span>
                      <input v-model.number="cinematicConfig.seasons" type="number" min="1" max="20" @change="syncCinematicEpisodeTotal" />
                    </label>
                    <label>
                      <span>Episódios por temporada</span>
                      <input v-model.number="cinematicConfig.episodesPerSeason" type="number" min="1" max="999" @change="syncCinematicEpisodeTotal" />
                    </label>
                    <label>
                      <span>Duração por episódio</span>
                      <select v-model.number="cinematicConfig.durationSeconds">
                        <option :value="60">1 minuto</option>
                        <option :value="120">2 minutos</option>
                        <option :value="180">3 minutos</option>
                        <option :value="300">5 minutos</option>
                        <option :value="600">10 minutos</option>
                      </select>
                    </label>
                    <label>
                      <span>Ritmo das cenas</span>
                      <select v-model="cinematicConfig.pace">
                        <option value="auto">IA recomenda</option>
                        <option value="lento">Lento</option>
                        <option value="medio">Médio</option>
                        <option value="rapido">Rápido</option>
                      </select>
                    </label>
                  </div>

                  <div class="cinematic-total-row">
                    <span>Total do projeto</span>
                    <strong>{{ cinematicTotalEpisodes }} episódios</strong>
                  </div>

                  <details class="cinematic-advanced">
                    <summary>
                      <span>Opções avançadas</span>
                      <ChevronDown :size="14" />
                    </summary>
                    <div class="cinematic-advanced-grid">
                      <label>
                        <span>Director Mode</span>
                        <select v-model="cinematicConfig.directorMode">
                          <option value="auto">IA define</option>
                          <option value="suspense psicologico">Suspense psicológico</option>
                          <option value="novela dramatica">Novela dramática</option>
                          <option value="sci-fi neon">Sci-fi neon</option>
                          <option value="acao rapida">Ação rápida</option>
                          <option value="romance emocional">Romance emocional</option>
                          <option value="terror atmosferico">Terror atmosférico</option>
                        </select>
                      </label>
                      <label>
                        <span>Formato</span>
                        <select v-model="cinematicConfig.formatPreset">
                          <option value="serie vertical">Série vertical</option>
                          <option value="cinematic wide">Cinematic wide</option>
                          <option value="tiktok reels curto">TikTok / Reels</option>
                          <option value="youtube episodio">YouTube episódio</option>
                          <option value="trailer">Trailer</option>
                        </select>
                      </label>
                      <label>
                        <span>Idioma do roteiro</span>
                        <select v-model="cinematicConfig.scriptLanguage">
                          <option value="pt-BR">Português BR</option>
                          <option value="en-US">English</option>
                          <option value="es">Español</option>
                        </select>
                      </label>
                      <label>
                        <span>Idioma dos prompts</span>
                        <select v-model="cinematicConfig.promptLanguage">
                          <option value="English">English</option>
                          <option value="pt-BR">Português BR</option>
                        </select>
                      </label>
                    </div>
                    <button class="avatar-zero-demo-link" type="button" @click="loadAvatarZeroDemo">
                      <Sparkles :size="14" />
                      Carregar demo Avatar.Zero
                    </button>
                  </details>
                </div>
              </div>

              <button class="generate-button" type="button" :disabled="!aiPrompt.trim() || creatingProject || cinematicPlanning" @click="createFromPrompt">
                <LoaderCircle v-if="cinematicPlanning" :size="15" class="animate-spin" />
                {{ cinematicPlanning ? 'Analisando...' : 'Analisar' }}
              </button>
            </div>
          </div>

          <div v-else class="screen-builder">
            <div class="screen-builder-copy">
              <Layers3 :size="22" />
              <strong>Tela</strong>
              <span>Crie um projeto vazio e entre no estúdio para montar episódios, cenas e storyboards.</span>
            </div>
            <button class="primary-black" type="button" :disabled="creatingProject" @click="createBlankProject">
              <Plus :size="17" />
              Novo projeto
            </button>
          </div>
        </div>

        <div class="composer-note">
          <span><Info :size="16" /> Garanta que você possui o direito autoral</span>
          <button class="skip-analysis-link" type="button" :disabled="creatingProject" @click="createBlankProject">
            {{ creatingProject ? 'Criando...' : 'Pule a análise do roteiro e entre na tela' }}
          </button>
        </div>
      </section>

      <section class="projects-section">
        <div class="projects-head">
          <h2>Meus projetos</h2>
          <button type="button" @click="navigateTo('/settings')">Todos <ChevronRight :size="15" /></button>
        </div>

        <div v-if="loading" class="projects-grid">
          <div v-for="i in 4" :key="i" class="project-skeleton"></div>
        </div>

        <div v-else class="projects-grid">
          <article
            v-for="project in dramas"
            :key="project.id"
            class="project-tile"
            :class="{ selected: isProjectSelected(project.id), example: isExampleProject(project) }"
            @click="handleProjectClick(project)"
          >
            <button
              v-if="!isExampleProject(project)"
              class="select-check"
              type="button"
              :aria-label="`Selecionar ${project.title}`"
              @click.stop="toggleProjectSelection(project.id)"
            >
              <Check :size="15" />
            </button>
            <div class="project-preview">
              <template v-if="projectImages(project).length">
                <img
                  v-for="(image, index) in projectImages(project)"
                  :key="`${project.id}-${image}-${index}`"
                  :src="assetUrl(image)"
                  :alt="project.title"
                  loading="lazy"
                />
              </template>
              <div v-else class="preview-empty">
                <CircleUserRound :size="28" />
              </div>
              <span v-if="isExampleProject(project)" class="sample-badge">Exemplo</span>
            </div>
            <div class="project-copy">
              <h3>{{ project.title }}</h3>
              <div class="project-meta-line">
                <time>{{ fmtDate(project.updated_at || project.updatedAt || project.created_at) }}</time>
                <span>{{ project.episodes?.length || project.total_episodes || 0 }} ep.</span>
              </div>
            </div>
          </article>

          <article v-if="!dramas.length" class="project-tile empty-project" @click="createBlankProject">
            <div class="project-preview">
              <div class="preview-empty"><Plus :size="28" /></div>
            </div>
            <div class="project-copy">
              <h3>AI Generated Script</h3>
              <div class="project-meta-line">
                <time>{{ fmtDate(new Date().toISOString()) }}</time>
                <span>0 ep.</span>
              </div>
            </div>
          </article>
        </div>
      </section>
    </main>

    <button class="help-button" type="button" aria-label="Ajuda" @click.stop="showHelp = !showHelp">
      <HelpCircle :size="24" />
    </button>
    <div v-if="showHelp" class="help-popover floating-panel">
      Cole um roteiro, gere uma ideia com IA ou abra um projeto existente para continuar a produção.
    </div>

    <Teleport to="body">
      <div v-if="styleLibraryOpen && (activeComposer === 'ai' || scriptFlowActive)" class="style-library-overlay" @click.self="closeStyleLibrary">
        <div class="style-library-panel" role="dialog" aria-modal="true" aria-labelledby="style-library-title" @click.stop>
          <div class="style-library-head">
            <h3 id="style-library-title">Biblioteca de estilos</h3>
            <div class="style-library-actions">
              <button
                v-if="!styleSearchOpen"
                class="style-search"
                type="button"
                aria-label="Buscar estilos"
                @click="openStyleSearch"
              >
                <Search :size="18" />
              </button>
              <button class="style-close" type="button" aria-label="Fechar biblioteca de estilos" @click="closeStyleLibrary">
                <X :size="18" />
              </button>
            </div>
          </div>

          <label v-if="styleSearchOpen" class="style-search-field">
            <Search :size="17" />
            <input ref="styleSearchInput" v-model="styleSearchQuery" type="search" placeholder="Pesquisar estilos" @input="resetStyleGridScroll" />
            <button
              class="style-search-clear"
              type="button"
              :aria-label="styleSearchQuery ? 'Limpar busca' : 'Fechar busca'"
              @click="closeStyleSearch"
            >
              <X :size="16" />
            </button>
          </label>

          <div class="style-category-row" role="tablist" aria-label="Categorias de estilo">
            <button
              v-for="category in styleCategories"
              :key="category"
              class="style-category"
              :class="{ selected: selectedStyleCategory === category }"
              type="button"
              role="tab"
              :aria-selected="selectedStyleCategory === category"
              @click="selectStyleCategory(category)"
            >
              {{ category }}
            </button>
          </div>

          <div class="style-grid-shell">
            <div v-if="!filteredStyleLibraryItems.length" class="style-empty-state">
              Nenhum estilo encontrado
            </div>
            <div v-else ref="styleGridRef" class="style-card-grid" @scroll="syncStyleScroll">
              <button
                v-for="style in filteredStyleLibraryItems"
                :key="style.value"
                class="style-card"
                :class="{ selected: selectedStyle === style.value, 'auto-style-card': style.automatic }"
                type="button"
                @click="selectStyle(style.value)"
              >
                <img v-if="style.image" :src="assetUrl(style.image)" :alt="style.label" loading="lazy" />
                <div v-else-if="style.automatic" class="auto-style-icon">
                  <WandSparkles :size="26" />
                </div>
                <span :class="{ 'auto-style-label': style.automatic }">{{ style.label }}</span>
              </button>
            </div>
            <span v-if="showStyleScrollCue" class="style-scroll-cue" aria-hidden="true">
              <span :style="{ transform: `translateY(${styleScrollThumbOffset})` }"></span>
            </span>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="showPaste" class="pippit-overlay" @click.self="closePasteModal">
        <div class="paste-modal" role="dialog" aria-modal="true" aria-labelledby="paste-title">
          <header>
            <h2 id="paste-title">Colar texto</h2>
            <button type="button" aria-label="Fechar" @click="closePasteModal"><X :size="24" /></button>
          </header>
          <div class="paste-area">
            <textarea v-model="pasteText" maxlength="100000" autofocus placeholder="Insira seu roteiro aqui"></textarea>
            <span>{{ pasteText.length }}/100000</span>
          </div>
          <footer>
            <button class="modal-exit" type="button" @click="closePasteModal">Sair</button>
            <button class="modal-done" type="button" :disabled="!pasteText.trim() || creatingProject" @click="createFromPaste">
              {{ creatingProject ? 'Criando...' : 'Concluído' }}
            </button>
          </footer>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="showCinematicReview" class="pippit-overlay cinematic-review-overlay" @click.self="closeCinematicReview">
        <section class="cinematic-review-modal" role="dialog" aria-modal="true" aria-labelledby="cinematic-review-title">
          <header class="cinematic-review-head">
            <div>
              <span>Pré-produção com IA</span>
              <h2 id="cinematic-review-title">Recomendação para este roteiro</h2>
              <p>A melhor configuração já está selecionada. Ajuste somente se precisar.</p>
            </div>
            <button type="button" aria-label="Fechar" @click="closeCinematicReview"><X :size="20" /></button>
          </header>

          <div class="cinematic-review-summary">
            <span>{{ cinematicConfig.seasons }} {{ cinematicConfig.seasons === 1 ? 'temporada' : 'temporadas' }}</span>
            <span>{{ cinematicTotalEpisodes }} episódios</span>
            <span>{{ formatCinematicDuration(cinematicConfig.durationSeconds) }} por episódio</span>
            <span>{{ cinematicPlan?.project?.director_mode || cinematicConfig.directorMode }}</span>
          </div>

          <div class="cinematic-recommendation-grid">
            <article>
              <div class="recommendation-label">
                <span>Partes por episódio</span>
                <em>{{ cinematicPartConfidence }}% confiança</em>
              </div>
              <strong>{{ selectedCinematicParts }}</strong>
              <select v-model.number="selectedCinematicParts">
                <option v-for="option in cinematicPartOptions" :key="`part-${option.value}`" :value="option.value">
                  {{ option.value }} · {{ option.label }}
                </option>
              </select>
              <p>{{ cinematicPartReason }}</p>
              <small>{{ cinematicPartRisk }}</small>
            </article>

            <article>
              <div class="recommendation-label">
                <span>Painéis por parte</span>
                <em>{{ cinematicPanelConfidence }}% confiança</em>
              </div>
              <strong>{{ selectedCinematicPanels }}</strong>
              <select v-model.number="selectedCinematicPanels">
                <option v-for="option in cinematicPanelOptions" :key="`panel-${option.value}`" :value="option.value">
                  {{ option.value }} · {{ option.label }}
                </option>
              </select>
              <p>{{ cinematicPanelReason }}</p>
              <small>Layout sugerido: {{ cinematicPlan?.recommendations?.selected?.layout || 'dinâmico' }}</small>
            </article>
          </div>

          <div class="cinematic-estimate">
            <div><strong>{{ cinematicEstimate.total_parts }}</strong><span>partes</span></div>
            <div><strong>{{ cinematicEstimate.total_panels }}</strong><span>painéis</span></div>
            <div><strong>{{ cinematicEstimate.image_prompts }}</strong><span>prompts de imagem</span></div>
            <div><strong>{{ cinematicEstimate.video_prompts }}</strong><span>prompts de vídeo</span></div>
            <div><strong>{{ cinematicEstimate.review_load }}</strong><span>carga de revisão</span></div>
          </div>

          <div v-if="cinematicConfig.useAvatarZeroReferences" class="cinematic-reference-preview">
            <img src="/images/avatar-zero-design-sheet.jpg" alt="Design sheet Avatar.Zero" />
            <img src="/images/avatar-zero-storyboard.jpg" alt="Storyboard Avatar.Zero" />
            <div>
              <strong>Referências Avatar.Zero</strong>
              <span>Design sheet e storyboard serão usados como direção visual aprovada.</span>
            </div>
          </div>

          <details class="cinematic-review-details">
            <summary>
              <span>Ver arco, bíblia visual e regras de continuidade</span>
              <ChevronDown :size="15" />
            </summary>
            <div class="cinematic-review-detail-grid">
              <section>
                <strong>Arco da temporada</strong>
                <p>{{ cinematicPlan?.season_arc?.main_arc }}</p>
              </section>
              <section>
                <strong>Bíblia visual</strong>
                <p>{{ cinematicPlan?.visual_bible?.logline }}</p>
              </section>
              <section class="continuity-detail">
                <strong>Continuidade obrigatória</strong>
                <p>Fotos, livros, cartas e telas devem ficar orientados para o personagem, nunca invertidos, espelhados ou de cabeça para baixo.</p>
              </section>
            </div>
          </details>

          <footer>
            <button class="cinematic-review-back" type="button" @click="closeCinematicReview">Voltar e editar</button>
            <button class="cinematic-review-confirm" type="button" :disabled="creatingProject" @click="confirmCinematicGeneration">
              <LoaderCircle v-if="creatingProject" :size="15" class="animate-spin" />
              {{ creatingProject ? 'Gerando...' : 'Aprovar e gerar roteiro' }}
            </button>
          </footer>
        </section>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="showDeleteConfirm" class="pippit-overlay delete-confirm-overlay" @click.self="closeDeleteConfirm">
        <div class="delete-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title">
          <button class="delete-confirm-close" type="button" aria-label="Fechar" :disabled="deletingProjects" @click="closeDeleteConfirm">
            <X :size="22" />
          </button>
          <h2 id="delete-confirm-title">{{ deleteConfirmTitle }}</h2>
          <p>Os projetos não podem ser recuperados após serem excluídos. Tem certeza que deseja excluí-los?</p>
          <footer>
            <button class="delete-cancel-button" type="button" :disabled="deletingProjects" @click="closeDeleteConfirm">Agora não</button>
            <button class="delete-confirm-button" type="button" :disabled="deletingProjects" @click="deleteSelectedProjects">
              {{ deletingProjects ? 'Excluindo...' : 'Excluir' }}
            </button>
          </footer>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="mediaAssetLibraryOpen" class="media-library-overlay" @click.self="closeCanvasMediaLibrary">
        <section class="media-library-modal" role="dialog" aria-modal="true" aria-labelledby="media-library-title" @click.stop>
          <header>
            <div>
              <h2 id="media-library-title">Selecionar imagens</h2>
              <p>{{ mediaAssetLibraryItems.length }} {{ mediaAssetLibraryItems.length === 1 ? 'ativo' : 'ativos' }}</p>
            </div>
            <div class="media-library-header-actions">
              <button class="media-library-select-toggle" type="button" :class="{ active: mediaLibraryBulkSelect }" @click="toggleMediaLibraryBulkSelect">{{ mediaLibraryBulkSelect ? 'Cancelar seleção' : 'Selecionar em massa' }}</button>
              <button type="button" aria-label="Fechar" @click="closeCanvasMediaLibrary"><X :size="18" /></button>
            </div>
          </header>

          <div class="media-library-content">
            <div v-if="mediaAssetLibraryLoading" class="media-library-state"><LoaderCircle :size="22" /> Carregando imagens...</div>
            <div v-else-if="!mediaAssetLibraryItems.length" class="media-library-state"><Image :size="28" /> Nenhuma imagem disponível</div>
            <div v-else class="media-library-grid">
              <button
                v-for="(asset, assetIndex) in mediaAssetLibraryItems"
                :key="mediaLibraryAssetKey(asset, assetIndex)"
                class="media-library-card"
                :class="{ selected: selectedMediaLibraryAssetKey === mediaLibraryAssetKey(asset, assetIndex), checked: isMediaLibraryAssetBulkSelected(asset, assetIndex) }"
                type="button"
                :aria-pressed="mediaLibraryBulkSelect ? isMediaLibraryAssetBulkSelected(asset, assetIndex) : selectedMediaLibraryAssetKey === mediaLibraryAssetKey(asset, assetIndex)"
                @click="selectMediaLibraryAsset(asset, assetIndex)"
              >
                <div class="media-library-thumb">
                  <img :src="mediaLibraryAssetSource(asset)" :alt="mediaLibraryAssetName(asset, assetIndex)" />
                  <span>Imagem</span>
                  <i v-if="mediaLibraryBulkSelect" class="media-library-check"><Check :size="14" /></i>
                </div>
                <strong>{{ mediaLibraryAssetName(asset, assetIndex) }}</strong>
              </button>
            </div>
          </div>

          <footer>
            <span>{{ mediaLibrarySelectionLabel }}</span>
            <div>
              <button class="media-library-cancel" type="button" @click="closeCanvasMediaLibrary">Cancelar</button>
              <button v-if="mediaLibraryBulkSelect" class="media-library-delete" type="button" :disabled="!selectedMediaLibraryAssetKeys.length || mediaLibraryDeleting" @click="deleteSelectedMediaLibraryAssets"><LoaderCircle v-if="mediaLibraryDeleting" :size="14" class="animate-spin" /> Apagar</button>
              <button v-else class="media-library-confirm" type="button" :disabled="!selectedMediaLibraryAssetKey" @click="confirmCanvasMediaLibrarySelection">Confirmar</button>
            </div>
          </footer>
        </section>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="pendingProductionAssetDelete" class="pippit-overlay delete-confirm-overlay asset-delete-overlay" @click.self="closeProductionAssetDeleteConfirm">
        <div class="asset-delete-modal" role="dialog" aria-modal="true" aria-labelledby="asset-delete-title">
          <button class="asset-delete-close" type="button" aria-label="Fechar" @click="closeProductionAssetDeleteConfirm">
            <X :size="21" />
          </button>
          <header>
            <span class="asset-delete-warning"><Info :size="13" /></span>
            <h2 id="asset-delete-title">{{ pendingProductionAssetDelete.bulk ? `Excluir ${pendingProductionAssetDelete.count} ativos?` : `Excluir ${pendingProductionAssetDeleteType}?` }}</h2>
          </header>
          <p v-if="pendingProductionAssetDelete.bulk">Isso removerá permanentemente <strong>{{ pendingProductionAssetDelete.count }} ativos selecionados</strong> deste projeto. Deseja continuar?</p>
          <p v-else>Isso removerá <strong>{{ pendingProductionAssetDelete.name }}</strong> deste projeto. Deseja continuar?</p>
          <footer>
            <button class="asset-delete-cancel" type="button" @click="closeProductionAssetDeleteConfirm">Cancelar</button>
            <button class="asset-delete-confirm" type="button" @click="confirmDeleteProductionAsset">Excluir</button>
          </footer>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="showScriptContinueConfirm" class="pippit-overlay delete-confirm-overlay production-continue-overlay" @click.self="closeScriptContinueConfirm">
        <div class="production-continue-modal" role="dialog" aria-modal="true" aria-labelledby="script-continue-title">
          <button class="asset-delete-close" type="button" aria-label="Fechar" @click="closeScriptContinueConfirm">
            <X :size="21" />
          </button>
          <header>
            <span class="asset-delete-warning"><Info :size="13" /></span>
            <h2 id="script-continue-title">Continuar para a próxima etapa?</h2>
          </header>
          <p>O roteiro será usado para gerar os ativos de produção. Continuar sem ele completo pode afetar a coerência dos clipes.</p>
          <footer>
            <button class="production-continue-generate" type="button" @click="generateScriptBeforeNextStep">Gerar ou concluir roteiro</button>
            <button class="production-continue-anyway" type="button" @click="continuePastIncompleteScript">Continuar mesmo assim</button>
          </footer>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="showProductionContinueConfirm" class="pippit-overlay delete-confirm-overlay production-continue-overlay" @click.self="closeProductionContinueConfirm">
        <div class="production-continue-modal" role="dialog" aria-modal="true" aria-labelledby="production-continue-title">
          <button class="asset-delete-close" type="button" aria-label="Fechar" @click="closeProductionContinueConfirm">
            <X :size="21" />
          </button>
          <header>
            <span class="asset-delete-warning"><Info :size="13" /></span>
            <h2 id="production-continue-title">Continuar para a próxima etapa?</h2>
          </header>
          <p>A aparência do papel será usada para gerar clipes. Continuar sem ela pronta afetará a qualidade dos clipes.</p>
          <footer>
            <button class="production-continue-generate" type="button" @click="prepareProductionAssetsBeforeEpisodes">Gerar ou carregar visuais do personagem</button>
            <button class="production-continue-anyway" type="button" @click="openEpisodesStep">Continuar mesmo assim</button>
          </footer>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="showAddEpisodeModal" class="episode-add-overlay" @click.self="closeAddEpisodeModal">
        <section class="episode-add-modal" role="dialog" aria-modal="true" aria-labelledby="episode-add-title">
          <header>
            <h2 id="episode-add-title">Adicionar episódio</h2>
            <button type="button" aria-label="Fechar" @click="closeAddEpisodeModal"><X :size="20" /></button>
          </header>
          <label>
            <span>Título do episódio</span>
            <input v-model="newEpisodeTitle" type="text" placeholder="Insira um título para este episódio" autofocus @keydown.enter.prevent="confirmAddEpisode" />
          </label>
          <footer>
            <button type="button" @click="closeAddEpisodeModal">Cancelar</button>
            <button type="button" :disabled="!newEpisodeTitle.trim()" @click="confirmAddEpisode">Adicionar</button>
          </footer>
        </section>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="selectedProjectIds.length" class="selection-bar">
        <strong>{{ selectedProjectIds.length }} projetos selecionados</strong>
        <button class="selection-cancel" type="button" :disabled="deletingProjects" @click="clearSelection">Cancelar</button>
        <button class="selection-delete" type="button" :disabled="deletingProjects" @click="openDeleteConfirm">
          <Trash2 :size="16" />
          Excluir
        </button>
      </div>
    </Teleport>
    <Teleport to="body">
      <div v-if="shortcutsModalOpen" class="pippit-overlay shortcuts-overlay" @click.self="shortcutsModalOpen = false">
        <div class="shortcuts-modal" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
          <button class="shortcuts-close" type="button" aria-label="Fechar" @click="shortcutsModalOpen = false">
            <X :size="20" />
          </button>
          
          <div class="shortcuts-grid">
            <div class="shortcuts-column">
              <h3 id="shortcuts-title">Zoom</h3>
              <div class="shortcut-item">
                <span>Zoom in/out</span>
                <div class="shortcut-keys">
                  <kbd>Ctrl</kbd>
                  <kbd>Roda do mouse</kbd>
                </div>
              </div>
              <div class="shortcut-item">
                <span>Zoom (Trackpad)</span>
                <div class="shortcut-keys">
                  <kbd>Pinça c/ 2 dedos</kbd>
                </div>
              </div>
            </div>

            <div class="shortcuts-column">
              <h3>Mover canvas</h3>
              <div class="shortcut-item">
                <span>Mover</span>
                <div class="shortcut-keys">
                  <kbd>Clique esquerdo</kbd>
                  <kbd>Arraste</kbd>
                </div>
              </div>
              <div class="shortcut-item">
                <span>Mover (Trackpad)</span>
                <div class="shortcut-keys">
                  <kbd>Deslize c/ 2 dedos</kbd>
                </div>
              </div>
            </div>

            <div class="shortcuts-column">
              <h3>Outros</h3>
              <div class="shortcut-item">
                <span>Desfazer</span>
                <div class="shortcut-keys">
                  <kbd>Ctrl</kbd>
                  <kbd>Z</kbd>
                </div>
              </div>
              <div class="shortcut-item">
                <span>Copiar</span>
                <div class="shortcut-keys">
                  <kbd>Ctrl</kbd>
                  <kbd>C</kbd>
                </div>
              </div>
              <div class="shortcut-item">
                <span>Colar</span>
                <div class="shortcut-keys">
                  <kbd>Ctrl</kbd>
                  <kbd>V</kbd>
                </div>
              </div>
              <div class="shortcut-item">
                <span>Excluir</span>
                <div class="shortcut-keys">
                  <kbd>Delete</kbd>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { toast } from 'vue-sonner'
import {
  ArrowUp,
  ArrowLeft,
  AtSign,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleUserRound,
  CreditCard,
  ExternalLink,
  FileText,
  Folder,
  Globe2,
  Grid3X3,
  HelpCircle,
  Image,
  Info,
  Keyboard,
  Layers3,
  LoaderCircle,
  LogOut,
  ListChecks,
  MapPin,
  MoreHorizontal,
  Maximize2,
  Music,
  Palette,
  Plus,
  RotateCcw,
  Scan,
  Search,
  Share2,
  ShieldCheck,
  Scissors,
  Sparkles,
  SquareArrowUp,
  Trash2,
  Upload,
  UploadCloud,
  UserRound,
  Video,
  WandSparkles,
  X,
} from 'lucide-vue-next'
import brandLogo from '~/assets/huobao-logo.png'
import { aiConfigAPI, dramaAPI, imageAPI, storyStudioAPI, uploadAPI } from '~/composables/useApi'
import { adjustEpisodeCount } from '~/utils/episode-count'

definePageMeta({ layout: false })

const route = useRoute()
const dramas = ref([])
const loading = ref(false)
const creatingProject = ref(false)
const scriptFlowActive = ref(false)
const scriptGenerating = ref(false)
const episodeOutlineGenerating = ref(false)
const episodeOutlinesReady = ref(false)
const episodeScriptsGenerating = ref(false)
const productionAnalysisGenerating = ref(false)
const productionAssetsReady = ref(false)
const productionCanvasOpen = ref(false)
const episodeStageOpen = ref(false)
const generatedScriptReady = ref(false)
const deletingProjects = ref(false)
const activeComposer = ref('upload')
const showPaste = ref(false)
const showAccountMenu = ref(false)
const showLibraryCreateMenu = ref(false)
const showLanguageMenu = ref(false)
const showHelp = ref(false)
const showDeleteConfirm = ref(false)
const showProductionContinueConfirm = ref(false)
const showScriptContinueConfirm = ref(false)
const openControl = ref(null)
const styleLibraryOpen = ref(false)
const styleSearchOpen = ref(false)
const styleSearchQuery = ref('')
const pasteText = ref('')
const aiPrompt = ref('')
const cinematicEngine = ref(null)
const cinematicPlan = ref(null)
const cinematicDesignSheet = ref(null)
const cinematicStoryboardPackage = ref(null)
const cinematicImprovements = ref(null)
const cinematicPlanning = ref(false)
const showCinematicReview = ref(false)
const selectedCinematicParts = ref(4)
const selectedCinematicPanels = ref(8)
const cinematicConfig = reactive({
  seasons: 1,
  episodesPerSeason: 10,
  durationSeconds: 180,
  pace: 'auto',
  directorMode: 'auto',
  formatPreset: 'serie vertical',
  scriptLanguage: 'pt-BR',
  promptLanguage: 'English',
  useAvatarZeroReferences: false,
})
const selectedStyle = ref('auto')
const selectedRatio = ref('Default ratio')
const episodeCount = ref(10)
const customEpisodeCount = ref('')
const selectedStyleCategory = ref('Todos')
const selectedLanguage = ref('Português')
const selectedProjectIds = ref([])
const fileInput = ref(null)
const styleGridRef = ref(null)
const styleSearchInput = ref(null)
const styleScrollProgress = ref(0)
const styleGridOverflowing = ref(false)
const styleScrollThumbOffset = ref('0px')
const accountId = '1213169400062'
const dramaImageMap = ref({})
const episodeSummaries = ref([])
const selectedEpisodeIds = ref([])
const batchSelectionActive = ref(false)
const focusedEpisodeId = ref(null)
const showAddEpisodeModal = ref(false)
const newEpisodeTitle = ref('')
const allEpisodeScriptsExpanded = ref(false)
const episodeScriptGenerationCount = ref(0)
const generatingEpisodeIds = ref(new Set())
const currentProjectId = ref(null)
const currentAgentStage = ref('idle')
const hydratingProject = ref(false)
const activeProductionTab = ref('roles')
const productionAssetSelectionActive = ref(false)
const productionMediaInput = ref(null)
const canvasReferenceInput = ref(null)
const productionMediaUploading = ref(false)
const canvasReferenceUploading = ref(false)
const canvasImageUploadTarget = ref(null)
const canvasImageLibraryTarget = ref(null)
const focusedCanvasImageAssetKey = ref('')
const mediaAssetLibraryOpen = ref(false)
const mediaAssetLibraryLoading = ref(false)
const mediaAssetLibraryItems = ref([])
const selectedMediaLibraryAssetKey = ref('')
const selectedMediaLibraryAssetKeys = ref([])
const mediaLibraryBulkSelect = ref(false)
const mediaLibraryDeleting = ref(false)
const selectedProductionAssetKeys = ref([])
const openProductionAssetMenuKey = ref('')
const openProductionAssetMenuType = ref('')
const roleEditorDraft = ref({
  index: -1,
  key: '',
  name: '',
  appearanceName: '',
  episodes: '',
  main: false,
})
const roleEditorPlacement = ref('right')
const roleEditorMenu = ref('')
const sceneEditorDraft = ref({
  index: -1,
  key: '',
  name: '',
  perspectiveName: '',
  episodes: '',
})
const sceneEditorPlacement = ref('right')
const sceneEditorMenu = ref('')
const pendingProductionAssetDelete = ref(null)
const productionLibraryOpen = ref(false)
const addNodeMenuOpen = ref(false)
let addNodeMenuCloseTimer = null
const shortcutsModalOpen = ref(false)
const screenHelpOpen = ref(false)
const canvasContextMenuOpen = ref(false)
const canvasContextDropPosition = ref(null)
const canvasContextLinkSource = ref(null)
const canvasIgnoreNextBoardClick = ref(false)
const canvasViewportRef = ref(null)
const canvasBoardRef = ref(null)
const canvasGeometryRevision = ref(0)
const canvasNodePositions = ref({})
const canvasConnections = ref([])
const selectedCanvasConnectionId = ref('')
const hoveredCanvasConnectionId = ref('')
const canvasConnectMode = ref(false)
const canvasLinkStart = ref(null)
const canvasHandleLinkStart = ref(null)
const canvasPointerPosition = ref(null)
const canvasHandleDragState = ref(null)
const canvasHandleHoverTarget = ref(null)
const canvasDragState = ref(null)
const canvasDragMoved = ref(false)
const canvasPanState = ref(null)
const canvasPanning = ref(false)
const canvasNodeZIndexes = ref({})
const canvasZIndexSeed = ref(10)
const canvasNodeContextMenu = ref({ open: false, x: 0, y: 0, type: '', index: -1 })
const canvasNodeClipboard = ref(null)
const canvasUndoStack = ref([])
const canvasZoom = ref(100)
const canvasZoomMin = 10
const canvasZoomMax = 200
const canvasZoomStep = 10
const canvasSaveStatus = ref('saved')
let canvasSaveRevision = 0
let canvasReferenceDragGhost = null
let canvasMentionIdSeed = 0
let canvasReferenceOccurrenceCloseTimer = null
const canvasGenerationChatOpen = ref(false)
const canvasGenerationTarget = ref(null)
const canvasGenerationPrompt = ref('')
const canvasChatPromptInput = ref(null)
const canvasChatMenu = ref('')
const canvasChatExpanded = ref(false)
const canvasMentionPreview = ref(null)
const canvasPromptMentionChips = ref([])
const canvasPromptDraggingReference = ref(false)
const canvasReferenceDragPreview = ref(null)
const canvasInlineMentionMenu = ref({ open: false, x: 0, y: 0, query: '', range: null })
const activeCanvasInlineMentionKey = ref('')
const activeCanvasReferenceOccurrenceKey = ref('')
const activeCanvasReferenceOccurrenceId = ref('')
const canvasReferenceOccurrenceMaxHeight = ref(240)
const canvasPromptMentionRanges = ref([])
const expandedCanvasMentionGroup = ref('')
const canvasChatRatio = ref('9:16')
const canvasChatResolution = ref('3K')
const canvasImageGenerating = ref(false)
const canvasImageGeneratingTargets = ref({})
const canvasPromptOptimizing = ref(false)
const imageAIConfigs = ref([])
const selectedCanvasImageModelKey = ref('')
const productionAssets = ref({
  roles: [],
  scenes: [],
  objects: [],
  media: [],
})
let scriptGenerationTimer = null
let agentAutosaveTimer = null
let episodeAutosaveTimer = null
let activeGenerationId = 0
const canvasImagePollers = new Map()

const scriptDraft = ref({
  idea: '',
  title: 'AI Generated Script',
  episodes: 10,
  ratio: 'Default ratio',
  styleLabel: 'Automático',
  storyType: 'Drama serial adaptado por IA',
  audience: 'Público jovem-adulto',
  synopsis: '',
  hook: '',
  shortSynopsis: '',
  characterBio: '',
})

const composerTabs = [
  { id: 'upload', label: 'Carregar roteiro', icon: UploadCloud },
  { id: 'ai', label: 'Roteirista IA', icon: WandSparkles },
  { id: 'screen', label: 'Tela', icon: Grid3X3 },
]

const selectedStyleOptions = [
  { value: 'auto', label: 'Automático', category: 'Todos', automatic: true },
  { value: 'realistic-drama', label: 'filme realista dos anos 90', image: 'images/style-realistic-drama.png' },
]

const addNodeOptions = [
  { id: 'roles', label: 'Role', icon: CircleUserRound, description: 'New characters in the play need images' },
  { id: 'scenes', label: 'Scene', icon: Image, description: 'Locations and scene references' },
  { id: 'text', label: 'Text', icon: FileText, description: 'Notes, prompts, and story context' },
  { id: 'image', label: 'Image', icon: Image, description: 'Upload or select visual references' },
  { id: 'video', label: 'Video', icon: Video, description: 'Motion references for generation' },
  { id: 'audio', label: 'Audio', icon: Music, description: 'Sound effects and voice-over' },
]
const canvasContextOptions = [
  { id: 'text', label: 'Text', icon: FileText },
  { id: 'image', label: 'Image', icon: Image },
  { id: 'scenes', label: 'Scene', icon: Image },
]
const canvasRoleContextOptions = [
  { id: 'image', label: 'Image', icon: Image },
  { id: 'video', label: 'Video', icon: Video },
  { id: 'roles', label: 'Role', icon: CircleUserRound },
]
const canvasObjectContextOptions = [
  { id: 'image', label: 'Image', icon: Image },
  { id: 'objects', label: 'Object', icon: Sparkles },
  { id: 'scenes', label: 'Scene', icon: Image },
]
const canvasMediaContextOptions = [
  { id: 'image', label: 'Image', icon: Image },
  { id: 'video', label: 'Video', icon: Video },
  { id: 'roles', label: 'Role', icon: CircleUserRound },
  { id: 'scenes', label: 'Scene', icon: Image },
]

const styleOptions = [
  { value: 'auto', label: 'Automático', category: 'Todos', automatic: true },
  { value: 'hong-kong-film', label: 'filme de Hong Kong d...', category: 'Ação ao vivo', image: 'images/style-hong-kong-film.png' },
  { value: 'suspense-film', label: 'filme de suspense', category: 'Ação ao vivo', image: 'images/style-suspense-film.png' },
  { value: 'terror-film', label: 'filme de terror', category: 'Ação ao vivo', image: 'images/style-terror-film.png' },
  { value: 'cyber-neon-film', label: 'filme cibernético neon', category: 'Ação ao vivo', image: 'images/style-cyber-neon-film.png' },
  { value: 'blue-cinema-tv', label: 'cinema e televisão az...', category: 'Ação ao vivo', image: 'images/style-blue-cinema-tv.png' },
  { value: 'retro-cinema', label: 'cinema retrô', category: 'Ação ao vivo', image: 'images/style-retro-cinema.png' },
  { value: 'hollywood-retro', label: 'Hollywood retrô americano', category: 'Ação ao vivo', image: 'images/style-hollywood-retro.png' },
  { value: 'retro-american', label: 'retrô americano de cinema', category: 'Ação ao vivo', image: 'images/style-retro-american.png' },
  { value: 'noir-cinematic', label: 'noir cinematográfico', category: 'Ação ao vivo', image: 'images/style-noir-cinematic.png' },
  { value: 'urban-neon-drama', label: 'drama urbano neon', category: 'Ação ao vivo', image: 'images/style-urban-neon-drama.png' },
  { value: 'anime-story', label: 'anime dramático', category: '2D', image: 'images/style-anime-story.png' },
  { value: 'stylized-3d', label: '3D estilizado', category: '3D', image: 'images/style-stylized-3d.png' },
]

const styleImageFallbacks = [
  'images/avatar-zero-design-sheet.jpg',
  'images/avatar-zero-storyboard.jpg',
]

const ratioOptions = ['Default ratio', '9:16', '16:9', '21:9', '3:4', '4:3', '1:1']
const episodeOptions = [5, 10, 30, 60, 80, 100]
const styleCategories = ['Todos', 'Ação ao vivo', '2D', '3D']

const stylePreviewImages = computed(() => {
  const loadedImages = Object.values(dramaImageMap.value).flat().filter(Boolean)
  return [...new Set([...loadedImages, ...styleImageFallbacks])]
})

const styleLibraryItems = computed(() => {
  const images = stylePreviewImages.value
  return styleOptions
    .map((style, index) => ({
      ...style,
      image: style.automatic ? '' : style.image || (images.length ? images[index % images.length] : ''),
    }))
})

const filteredStyleLibraryItems = computed(() => {
  const query = styleSearchQuery.value.trim().toLocaleLowerCase()

  return styleLibraryItems.value.filter(style => {
    const matchesCategory = selectedStyleCategory.value === 'Todos' || style.category === selectedStyleCategory.value
    if (!matchesCategory) return false
    if (!query) return true

    return `${style.label} ${style.category}`.toLocaleLowerCase().includes(query)
  })
})

const selectedStyleItem = computed(() =>
  [...selectedStyleOptions, ...styleLibraryItems.value].find(style => style.value === selectedStyle.value) || null,
)

const showStyleScrollCue = computed(() => styleGridOverflowing.value)
const deleteConfirmCount = computed(() => selectedProjectIds.value.length)
const deleteConfirmTitle = computed(() => {
  const count = deleteConfirmCount.value
  if (count === 1) return 'Excluir este projeto?'
  return `Excluir estes ${count} projetos?`
})

const episodeLabel = computed(() => `${episodeCount.value} episódios`)
const cinematicTotalEpisodes = computed(() => {
  const seasons = Math.max(1, Math.min(20, Number(cinematicConfig.seasons) || 1))
  const episodesPerSeason = Math.max(1, Math.min(999, Number(cinematicConfig.episodesPerSeason) || 1))
  return Math.min(999, seasons * episodesPerSeason)
})
const productionProfileLabel = computed(() =>
  `${cinematicConfig.seasons}T · ${cinematicTotalEpisodes.value} ep. · ${formatCinematicDuration(cinematicConfig.durationSeconds)}`,
)
const cinematicEngineReady = computed(() => Boolean(cinematicEngine.value?.skill?.available))
const cinematicPartConfidence = computed(() => Math.round(Number(cinematicPlan.value?.recommendations?.parts?.confidence) || 84))
const cinematicPanelConfidence = computed(() => Math.round(Number(cinematicPlan.value?.recommendations?.panels?.confidence) || 84))
const cinematicPartReason = computed(() =>
  cinematicPlan.value?.recommendations?.parts?.reason
  || `A divisão em ${selectedCinematicParts.value} partes mantém abertura, desenvolvimento, virada, clímax e gancho sem sobrecarregar a revisão.`,
)
const cinematicPartRisk = computed(() =>
  cinematicPlan.value?.recommendations?.parts?.risk
  || 'Baixo risco para um fluxo cinematográfico controlado.',
)
const cinematicPanelReason = computed(() =>
  cinematicPlan.value?.recommendations?.panels?.reason
  || `${selectedCinematicPanels.value} painéis por parte dão cobertura suficiente para ação, emoção, continuidade e prompts finais.`,
)
const cinematicPartOptions = computed(() =>
  normalizeCinematicOptions(cinematicPlan.value?.recommendations?.parts?.alternatives, selectedCinematicParts.value),
)
const cinematicPanelOptions = computed(() =>
  normalizeCinematicOptions(cinematicPlan.value?.recommendations?.panels?.alternatives, selectedCinematicPanels.value),
)
const cinematicEstimate = computed(() => {
  const totalParts = Number(selectedCinematicParts.value || 0)
  const panelsPerPart = Number(selectedCinematicPanels.value || 0)
  const totalPanels = totalParts * panelsPerPart
  return {
    total_parts: totalParts,
    total_panels: totalPanels,
    image_prompts: totalPanels,
    video_prompts: totalPanels,
    review_load: totalPanels <= 36 ? 'leve' : totalPanels <= 72 ? 'média' : 'alta',
  }
})
const selectedLanguageCode = computed(() => selectedLanguage.value === 'English' ? 'EN' : 'PT')
const agentRatioLabel = computed(() => scriptFlowActive.value ? scriptDraft.value.ratio : selectedRatio.value)
const agentRatioDisplay = computed(() => agentRatioLabel.value === 'Default ratio' ? '9:16' : agentRatioLabel.value)
const summaryLocked = computed(() => episodeOutlineGenerating.value || episodeOutlinesReady.value || episodeScriptsGenerating.value)
const pendingEpisodes = computed(() => episodeSummaries.value.filter(episode => !episode.scriptReady).sort((a, b) => Number(a.id) - Number(b.id)))
const pendingEpisodeCount = computed(() => pendingEpisodes.value.length)
const selectedPendingEpisodeIds = computed(() => selectedEpisodeIds.value.filter(id => pendingEpisodes.value.some(episode => Number(episode.id) === Number(id))))
const allEpisodeScriptsReady = computed(() => episodeSummaries.value.length > 0 && pendingEpisodeCount.value === 0 && episodeSummaries.value.every(episode => episode.scriptReady && String(episode.script || '').trim()))
const scriptComplete = computed(() => allEpisodeScriptsReady.value)
const scriptInProgress = computed(() => scriptGenerating.value || episodeOutlineGenerating.value || episodeScriptsGenerating.value || creatingProject.value)
const agentStep = computed(() => episodeStageOpen.value ? 3 : productionAssetsReady.value ? 2 : 1)
const canvasWorldPadding = 6000
const canvasBoardMetrics = computed(() => {
  const padding = canvasWorldPadding
  const bounds = []
  productionAssets.value.roles.forEach((_, index) => bounds.push(canvasNodeRawBounds('roles', index)))
  productionAssets.value.scenes.forEach((_, index) => bounds.push(canvasNodeRawBounds('scenes', index)))
  productionAssets.value.objects.forEach((_, index) => bounds.push(canvasNodeRawBounds('objects', index)))
  productionAssets.value.media.forEach((_, index) => bounds.push(canvasNodeRawBounds('media', index)))
  const validBounds = bounds.filter(Boolean)
  const maxX = Math.max(3720, ...validBounds.map(bound => bound.right))
  const maxY = Math.max(1560, ...validBounds.map(bound => bound.bottom))
  return {
    offsetX: padding,
    offsetY: padding,
    width: maxX + padding * 2,
    height: maxY + padding * 2,
  }
})
const canvasBoardStyle = computed(() => ({
  width: canvasBoardMetrics.value.width + 'px',
  height: canvasBoardMetrics.value.height + 'px',
  minHeight: canvasBoardMetrics.value.height + 'px',
  transform: `scale(${canvasZoom.value / 100})`,
}))
const canvasConnectionPaths = computed(() => {
  canvasGeometryRevision.value
  return canvasConnections.value.map(connection => {
    const id = canvasConnectionId(connection)
    const points = canvasConnectionPoints(connection)
    return {
      id,
      d: points ? canvasCubicPath(points.start, points.end) : '',
      connection,
      editPoints: points ? canvasConnectionEditPoints(points.start, points.end) : [],
      cutPoint: points ? canvasConnectionPointAt(points.start, points.end, 0.5) : null,
    }
  }).filter(connection => connection.d)
})
const selectedCanvasConnectionCutMenu = computed(() => {
  const selected = canvasConnectionPaths.value.find(path => path.id === selectedCanvasConnectionId.value)
  if (!selected?.cutPoint) return null
  return {
    style: {
      left: Math.round(selected.cutPoint.x - 32) + 'px',
      top: Math.round(selected.cutPoint.y - 54) + 'px',
    },
  }
})
const canvasNodeContextMenuStyle = computed(() => ({
  left: canvasNodeContextMenu.value.x + 'px',
  top: canvasNodeContextMenu.value.y + 'px',
}))
const canvasContextNodeItem = computed(() => {
  const target = canvasNodeContextMenu.value
  return productionAssets.value[target.type]?.[target.index] || null
})
const canvasContextNodeHasImage = computed(() => Boolean(productionAssetImageSource(canvasContextNodeItem.value)))
const canvasHandlePreviewPath = computed(() => {
  const start = canvasHandleLinkStart.value
  const pointer = canvasPointerPosition.value
  if (!start || !pointer || !canvasHandleDragState.value?.moved) return ''
  const startPoint = canvasHandleCoveredPoint(start)
  const hoverTarget = canvasHandleHoverTarget.value
  const targetPoint = hoverTarget && hoverTarget.key !== start.key
    ? canvasHandleCoveredPoint(hoverTarget)
    : pointer
  if (!startPoint || !targetPoint) return ''
  return canvasDragPreviewPath(startPoint, targetPoint)
})
const canvasContextSourceType = computed(() => String(canvasContextLinkSource.value?.key || '').split(':')[0])
const canvasContextMenuTitle = computed(() => ['roles', 'objects', 'media'].includes(canvasContextSourceType.value) ? 'Generate using this node' : 'Add context')
const activeCanvasContextOptions = computed(() => {
  if (canvasContextSourceType.value === 'roles') return canvasRoleContextOptions
  if (canvasContextSourceType.value === 'objects') return canvasMediaContextOptions
  if (canvasContextSourceType.value === 'media') return canvasMediaContextOptions
  return canvasContextOptions
})
const canvasContextSelectedOptionId = computed(() => '')
const sceneGroupBackdrops = computed(() => connectedSceneGroups()
  .filter(group => group.length > 1)
  .map((group, groupIndex) => {
    const bounds = group
      .map(index => canvasNodeViewportBounds('scenes', index))
      .filter(Boolean)
    const paddingX = 42
    const paddingTop = 38
    const paddingBottom = 34
    const left = Math.min(...bounds.map(bound => bound.left)) - paddingX
    const top = Math.min(...bounds.map(bound => bound.top)) - paddingTop
    const right = Math.max(...bounds.map(bound => bound.right)) + paddingX
    const bottom = Math.max(...bounds.map(bound => bound.bottom)) + paddingBottom

    return {
      id: 'scene-group-' + groupIndex + '-' + group.join('-'),
      style: {
        left: left + 'px',
        top: top + 'px',
        width: (right - left) + 'px',
        height: (bottom - top) + 'px',
      },
    }
  }))
const analysisPreviewEpisodes = computed(() => productionPayloadEpisodes().slice(0, 5))
const productionTabs = computed(() => [
  { id: 'roles', label: 'Roles', count: productionAssets.value.roles.length, icon: CircleUserRound },
  { id: 'scenes', label: 'Scenes', count: productionAssets.value.scenes.length, icon: FileText },
  { id: 'objects', label: 'Objetos', count: productionAssets.value.objects.length, icon: Sparkles },
  { id: 'media', label: 'Mídia', count: productionAssets.value.media.length, icon: Grid3X3 },
])
const activeProductionItems = computed(() => productionAssets.value[activeProductionTab.value] || [])

const groupedActiveProductionItems = computed(() => {
  const items = activeProductionItems.value
  const type = activeProductionTab.value

  const incoming = new Set()
  const outgoing = new Map()

  canvasConnections.value.forEach(conn => {
    if (conn.from?.startsWith(type + ':') && conn.to?.startsWith(type + ':')) {
      const fromIdx = parseInt(conn.from.split(':')[1])
      const toIdx = parseInt(conn.to.split(':')[1])
      incoming.add(toIdx)

      if (!outgoing.has(fromIdx)) outgoing.set(fromIdx, [])
      outgoing.get(fromIdx).push(toIdx)
    }
  })

  const groups = []

  items.forEach((item, index) => {
    if (incoming.has(index)) return

    let queue = outgoing.get(index) ? [...outgoing.get(index)] : []
    let visited = new Set([index])
    let sequenceLength = 1
    let totalImages = item.images || 1

    while (queue.length > 0) {
      const nextIdx = queue.shift()
      if (visited.has(nextIdx)) continue
      visited.add(nextIdx)
      sequenceLength++
      const nextItem = items[nextIdx]
      if (nextItem) totalImages += (nextItem.images || 1)
      
      if (outgoing.has(nextIdx)) {
        queue.push(...outgoing.get(nextIdx))
      }
    }

    groups.push({
      item,
      index,
      sequenceLength,
      totalImages
    })
  })

  return groups
})

const activeProductionAssetKeys = computed(() => activeProductionItems.value.map((item, index) => productionAssetKey(item, index)))
const allActiveProductionAssetsSelected = computed(() => activeProductionAssetKeys.value.length > 0 && activeProductionAssetKeys.value.every(key => selectedProductionAssetKeys.value.includes(key)))
const roleEditorRoleOptions = computed(() => {
  const names = productionAssets.value.roles
    .map(item => String(item?.name || '').trim())
    .filter(Boolean)
  const draftName = String(roleEditorDraft.value.name || '').trim()
  if (draftName) names.unshift(draftName)
  return [...new Set(names)]
})
const roleEditorEpisodeOptions = computed(() => {
  const ids = episodeSummaries.value
    .map(episode => Number(episode.id))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
  if (ids.length) return ids.map(id => ({ value: String(id), label: String(id) }))
  const currentIds = sceneEditorEpisodeIds(roleEditorDraft.value.episodes)
  return (currentIds.length ? currentIds : ['1']).map(id => ({ value: String(id), label: String(id) }))
})
const sceneEditorSceneOptions = computed(() => {
  const names = productionAssets.value.scenes
    .map(item => String(item?.name || '').trim())
    .filter(Boolean)
  const draftName = String(sceneEditorDraft.value.name || '').trim()
  if (draftName) names.unshift(draftName)
  names.unshift('Unnamed scene')
  return [...new Set(names)]
})
const sceneEditorEpisodeOptions = computed(() => {
  const ids = episodeSummaries.value
    .map(episode => Number(episode.id))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
  if (ids.length) return ids.map(id => ({ value: String(id), label: String(id) }))
  const currentIds = sceneEditorEpisodeIds(sceneEditorDraft.value.episodes)
  return (currentIds.length ? currentIds : ['1']).map(id => ({ value: String(id), label: String(id) }))
})
const canvasChatRatioOptions = ['Automatico', '16:9', '21:9', '9:16', '4:3', '3:4', '1:1']
const canvasChatRatioDisplay = computed(() => canvasChatRatio.value === 'Automatico' ? '9:16' : canvasChatRatio.value)
const canvasGenerationChatStyle = computed(() => {
  canvasGeometryRevision.value
  const target = canvasGenerationTarget.value
  if (!target || canvasChatExpanded.value) return {}
  const board = canvasBoardRef.value
  if (!board || typeof window === 'undefined') return {}
  const gap = 14
  const scale = canvasZoom.value / 100 || 1
  const position = canvasNodeViewportPosition(target.type, target.index)
  const size = canvasNodeSize(target.type, target.index)
  const width = Math.min(800, Math.max(320, window.innerWidth - 64))
  const left = board.offsetLeft + (position.x + size.width / 2) * scale - width / 2
  const top = board.offsetTop + (position.y + size.height) * scale + gap
  return {
    left: left + 'px',
    top: top + 'px',
    bottom: 'auto',
    width: width + 'px',
    transform: 'none',
  }
})
const canvasGenerationPlaceholder = computed(() => {
  if (canvasGenerationTarget.value?.type === 'scenes') return 'Descreva a imagem da cena ou clique em gerar prompt'
  if (canvasGenerationTarget.value?.type === 'objects') return 'Descreva a imagem do objeto ou clique em gerar prompt'
  return 'Descreva a aparência do personagem ou clique em gerar prompt'
})
const canvasMentionGroups = computed(() => [
  { id: 'roles', label: 'Role', icon: CircleUserRound },
  { id: 'scenes', label: 'Scene', icon: Image },
  { id: 'objects', label: 'Object', icon: Sparkles },
  { id: 'media', label: 'Image', icon: Image },
])
function getCanvasGroupHeadItem(type, index) {
  const items = productionAssets.value[type]
  if (!items) return null

  let currentIndex = index
  let foundPredecessor = true
  const visited = new Set([currentIndex])
  
  while (foundPredecessor) {
    foundPredecessor = false
    const predecessorConn = canvasConnections.value.find(conn => 
      conn.to === `${type}:${currentIndex}` && conn.from?.startsWith(`${type}:`)
    )
    if (predecessorConn) {
      const fromIdx = parseInt(predecessorConn.from.split(':')[1])
      if (visited.has(fromIdx)) break
      currentIndex = fromIdx
      visited.add(currentIndex)
      foundPredecessor = true
    }
  }

  return items[currentIndex]
}

function canvasMentionItem(group, item, index) {
  const headItem = getCanvasGroupHeadItem(group, index) || item

  return {
    key: `${group}:${index}`,
    type: group,
    index,
    name: headItem?.name || item?.name || (group === 'roles' ? 'Role' : group === 'scenes' ? 'Scene' : group === 'objects' ? 'Object' : 'Image') + ' ' + (index + 1),
    source: productionAssetImageSource(headItem) || productionAssetImageSource(item),
  }
}

const allCanvasMentionItems = computed(() =>
  ['roles', 'scenes', 'objects', 'media'].flatMap(group =>
    (productionAssets.value[group] || []).map((item, index) => canvasMentionItem(group, item, index)),
  ),
)
const activeCanvasMentionItems = computed(() => {
  const group = expandedCanvasMentionGroup.value
  const items = group === 'roles'
    ? productionAssets.value.roles
    : group === 'scenes'
      ? productionAssets.value.scenes
      : group === 'objects'
        ? productionAssets.value.objects
        : productionAssets.value.media
  return (items || []).map((item, index) => canvasMentionItem(group, item, index))
})
const canvasMentionQuickItems = computed(() => {
  const groups = ['roles', 'scenes', 'objects', 'media']
  return groups
    .flatMap(group => (productionAssets.value[group] || []).map((item, index) => canvasMentionItem(group, item, index)))
    .sort((a, b) => Number(Boolean(b.source)) - Number(Boolean(a.source)))
    .slice(0, 3)
})
const canvasInlineMentionQuery = computed(() => canvasInlineMentionMenu.value.query.trim().toLowerCase())
const canvasInlineMentionItems = computed(() => {
  const query = canvasInlineMentionQuery.value
  const items = allCanvasMentionItems.value
    .sort((a, b) => Number(Boolean(b.source)) - Number(Boolean(a.source)))
  if (!query) return items.slice(0, 8)
  return items
    .filter(item => String(item.name || '').toLowerCase().includes(query))
    .slice(0, 12)
})
const canvasInlineMentionVisibleItems = computed(() => canvasInlineMentionQuery.value
  ? canvasInlineMentionItems.value
  : canvasMentionQuickItems.value)
const canvasImageModelOptions = computed(() => {
  const configs = (imageAIConfigs.value || [])
    .filter(config => String(config.service_type || config.serviceType || 'image') === 'image' || String(config.provider || '').toLowerCase() === 'openai-codex')
    .filter(config => !isKnownNonImageAIConfig(config))
    .sort((a, b) => Number(String(b.provider || '').toLowerCase() === 'openai-codex') - Number(String(a.provider || '').toLowerCase() === 'openai-codex'))
    .map(config => ({
    key: `config:${config.id}`,
    id: config.id,
    model: String(config.provider || '').toLowerCase() === 'openai-codex' ? 'gpt-5.5' : parseAIConfigModel(config.model),
    label: String(config.provider || '').toLowerCase() === 'openai-codex'
      ? 'Codex gpt-5.5 - Image Gen 2'
      : (config.name || parseAIConfigModel(config.model) || config.provider || 'Image model'),
    description: `${config.provider || 'Provider'}${config.is_active || config.isActive ? ' ativo' : ''}`,
  }))
  if (configs.length) return configs
  return [
    { key: 'fallback:little-lark-anycook', model: 'little-lark-anycook', label: 'Little lark anycook', description: 'Visuais cinematográficos, personagens realistas, ideal para contar histórias' },
    { key: 'fallback:nano-banana-pro', model: 'nano-banana-pro', label: 'Nano Banana Pro', description: 'Edição avançada de imagens, ideal para cenas complexas e detalhadas' },
    { key: 'fallback:nano-banana-2', model: 'nano-banana-2', label: 'Nano Banana 2', description: 'Geração ultrarrápida, segue o prompt com precisão' },
  ]
})
const selectedCanvasImageModel = computed(() => canvasImageModelOptions.value.find(model => model.key === selectedCanvasImageModelKey.value) || canvasImageModelOptions.value[0])
const selectedCanvasImageModelLabel = computed(() => selectedCanvasImageModel.value?.label || 'Modelo de imagem')
const canvasSendLoading = computed(() => {
  const target = canvasGenerationTarget.value
  return canvasImageGenerating.value || Boolean(target && canvasImageGeneratingTargets.value[canvasNodeKey(target.type, target.index)])
})
const mediaLibrarySelectionLabel = computed(() => {
  if (mediaLibraryBulkSelect.value) {
    const count = selectedMediaLibraryAssetKeys.value.length
    return count ? `${count} ${count === 1 ? 'ativo selecionado' : 'ativos selecionados'}` : 'Nenhum ativo selecionado'
  }
  return selectedMediaLibraryAssetKey.value ? '1 selecionado' : 'Nenhum ativo selecionado'
})
const hasProductionAssets = computed(() => productionAssetTotal() > 0)
const pendingProductionAssetCount = computed(() => Object.values(productionAssets.value).reduce((count, list) => count + (Array.isArray(list) ? list.filter(isPendingProductionAsset).length : 0), 0))
const hasPendingProductionAssets = computed(() => pendingProductionAssetCount.value > 0)
const productionPanelTitle = computed(() => activeProductionTab.value === 'roles'
  ? 'Gerar ou carregar aparências dos personagens'
  : activeProductionTab.value === 'scenes'
    ? 'Gerar ou carregar referências das cenas'
    : activeProductionTab.value === 'objects'
      ? 'Gerar ou carregar objetos de cena'
      : 'Gerar ou carregar mídia de produção')
const productionSelectionTitle = computed(() => activeProductionTab.value === 'roles' ? 'Selecione para gerar as aparências dos personagens' : 'Selecione os ativos para gerar')
const pendingProductionAssetDeleteType = computed(() => pendingProductionAssetDelete.value?.type || 'ativo')
const productionPanelSubtitle = computed(() => {
  if (activeProductionTab.value === 'roles') return productionAssets.value.roles.length + ' personagens para configurar. Gere em lote ou carregue manualmente.'
  const count = activeProductionItems.value.length
  return count + ' ' + (count === 1 ? 'ativo' : 'ativos') + ' para configurar. Gere em lote ou carregue manualmente.'
})
const episodeGenerateButtonLabel = computed(() => {
  const count = batchSelectionActive.value ? selectedPendingEpisodeIds.value.length : pendingEpisodeCount.value
  return `Gerar ${count} ${count === 1 ? 'episódio' : 'episódios'}`
})
const agentStageSubtitle = computed(() => {
  if (episodeOutlinesReady.value) return 'Os resumos dos episódios estão prontos. Revise antes de continuar.'
  if (generatedScriptReady.value && !episodeOutlineGenerating.value) return 'O roteiro está pronto. Vamos continuar.'
  return 'You can close this page. Generation will not stop.'
})
const agentStatusText = computed(() => {
  if (episodeScriptsGenerating.value) return 'Gerando ' + episodeScriptGenerationCount.value + ' roteiro' + (episodeScriptGenerationCount.value === 1 ? '' : 's') + ' de episódio...'
  if (episodeOutlinesReady.value && allEpisodeScriptsReady.value) return 'A história completa está pronta. Continue para a análise dos ativos de produção.'
  if (episodeOutlinesReady.value) return 'Os resumos dos episódios estão prontos. Continue para gerar os roteiros dos episódios.'
  if (generatedScriptReady.value) return 'O resumo do seu roteiro está pronto. Continue para gerar os esboços dos episódios agora.'
  return 'Gerando um esboço de roteiro com base na sua ideia'
})

const languages = [
  'English',
  'Português',
]

async function load() {
  loading.value = true
  try {
    const response = await dramaAPI.list()
    const items = response.items || []
    const imageMap = await loadProjectImages(items)
    dramaImageMap.value = imageMap
    const collapsed = collapseDuplicateProjects(items, imageMap)
    dramas.value = collapsed
    redirectDuplicateProjectRoute(items, collapsed)
  } catch (error) {
    toast.error(error.message || 'Não foi possível carregar os projetos')
  } finally {
    loading.value = false
  }
}

async function loadProjectImages(projects) {
  const entries = await Promise.all(
    projects.slice(0, 12).map(async project => {
      try {
        const images = await imageAPI.list({ drama_id: project.id, status: 'completed', page_size: 8 })
        const paths = images
          .flatMap(image => [image.localPath, image.local_path, image.imageUrl, image.image_url])
          .filter(Boolean)
          .filter(isDisplayableAsset)
        return [project.id, [...new Set(paths)].slice(0, 3)]
      } catch {
        return [project.id, []]
      }
    }),
  )

  return Object.fromEntries(entries)
}

function collapseDuplicateProjects(projects, imageMap = dramaImageMap.value) {
  const grouped = new Map()
  for (const project of projects) {
    const key = projectDuplicateKey(project)
    const current = grouped.get(key)
    if (!current || projectCompletenessScore(project, imageMap) > projectCompletenessScore(current, imageMap)) {
      grouped.set(key, project)
    }
  }
  return [...grouped.values()].sort((a, b) => new Date(b.updated_at || b.updatedAt || b.created_at).getTime() - new Date(a.updated_at || a.updatedAt || a.created_at).getTime())
}

function projectDuplicateKey(project) {
  return [
    normalizeProjectText(project.title),
    normalizeProjectText(project.description),
    Number(project.episodes?.length || project.total_episodes || 0),
  ].join('|')
}

function normalizeProjectText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function projectCompletenessScore(project, imageMap = dramaImageMap.value) {
  return (imageMap[project.id]?.length || 0) * 1000
    + (project.scenes?.length || 0) * 100
    + (project.characters?.length || 0) * 50
    + (project.episodes?.length || project.total_episodes || 0)
}

function redirectDuplicateProjectRoute(allProjects, visibleProjects) {
  const routeProjectId = Number(route.query.project)
  if (!Number.isFinite(routeProjectId) || routeProjectId < 1) return
  const requested = allProjects.find(project => Number(project.id) === routeProjectId)
  if (!requested) return
  const canonical = visibleProjects.find(project => projectDuplicateKey(project) === projectDuplicateKey(requested))
  if (!canonical || Number(canonical.id) === routeProjectId) return
  navigateTo({ path: '/', query: { project: String(canonical.id) } }, { replace: true })
}

function closeFloatingMenus() {
  showAccountMenu.value = false
  showLanguageMenu.value = false
  showHelp.value = false
  openControl.value = null
  canvasChatMenu.value = ''
  expandedCanvasMentionGroup.value = ''
  closeCanvasInlineMentionMenu()
  canvasMentionPreview.value = null
  activeCanvasReferenceOccurrenceKey.value = ''
  clearCanvasReferenceOccurrenceSelection()
  openProductionAssetMenuKey.value = ''
  openProductionAssetMenuType.value = ''
  closeRoleEditor()
  closeSceneEditor()
  styleLibraryOpen.value = false
  focusedCanvasImageAssetKey.value = ''
}

function toggleAccountMenu() {
  showAccountMenu.value = !showAccountMenu.value
  showLanguageMenu.value = false
  showHelp.value = false
  openControl.value = null
  styleLibraryOpen.value = false
}

function toggleLanguageMenu() {
  showLanguageMenu.value = !showLanguageMenu.value
  showAccountMenu.value = false
  showHelp.value = false
  openControl.value = null
  styleLibraryOpen.value = false
}

function selectLanguage(language) {
  selectedLanguage.value = language
  showLanguageMenu.value = false
}

function closeHeaderMenus() {
  showAccountMenu.value = false
  showLanguageMenu.value = false
  showHelp.value = false
}

function closeStyleLibrary() {
  styleLibraryOpen.value = false
  closeStyleSearch()
  syncStyleScroll()
}

function openStyleSearch() {
  styleSearchOpen.value = true
  nextTick(() => styleSearchInput.value?.focus())
}

function closeStyleSearch() {
  styleSearchOpen.value = false
  styleSearchQuery.value = ''
  resetStyleGridScroll()
}

function toggleControl(control) {
  openControl.value = openControl.value === control ? null : control
  styleLibraryOpen.value = false
  closeHeaderMenus()
}

function toggleStyleLibrary() {
  styleLibraryOpen.value = !styleLibraryOpen.value
  openControl.value = null
  closeHeaderMenus()
  if (styleLibraryOpen.value) {
    closeStyleSearch()
    resetStyleGridScroll()
  } else {
    closeStyleSearch()
  }
}

function handleGlobalKeydown(event) {
  if (event.key === 'Escape' && styleLibraryOpen.value) {
    closeStyleLibrary()
  }
  if (event.key === 'Escape' && productionCanvasOpen.value) {
    closeScreenMenus()
  }
  if (!productionCanvasOpen.value || isTypingTarget(event.target)) return

  const shortcut = event.ctrlKey || event.metaKey
  if (shortcut && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    undoCanvasAction()
    return
  }
  if (shortcut && event.key.toLowerCase() === 'c') {
    const target = focusedCanvasTarget()
    if (target) {
      event.preventDefault()
      copyCanvasNode(target.type, target.index)
    }
    return
  }
  if (shortcut && event.key.toLowerCase() === 'v') {
    if (canvasNodeClipboard.value) {
      event.preventDefault()
      pasteCanvasNode(48)
    }
    return
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    const target = canvasNodeContextMenu.value.open ? canvasContextTarget() : focusedCanvasTarget()
    if (target) {
      event.preventDefault()
      deleteCanvasNode(target.type, target.index)
      closeScreenMenus()
    }
  }
}

function isTypingTarget(target) {
  const tag = String(target?.tagName || '').toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable
}

function focusedCanvasTarget() {
  const [type, rawIndex] = String(focusedCanvasImageAssetKey.value || '').split(':')
  const index = Number(rawIndex)
  if (!type || !Number.isInteger(index) || !productionAssets.value[type]?.[index]) return null
  return { type, index }
}

function selectRatio(ratio) {
  selectedRatio.value = ratio
  if (scriptFlowActive.value) scriptDraft.value.ratio = ratio
  openControl.value = null
}

function formatCinematicDuration(seconds) {
  const value = Math.max(1, Number(seconds) || 0)
  if (value < 60) return `${value}s`
  const minutes = Math.round(value / 60)
  return `${minutes} min`
}

function normalizeCinematicOptions(options, selected) {
  const rows = Array.isArray(options) ? options : []
  const normalized = rows
    .map(option => ({
      value: Number(option?.value),
      label: String(option?.label || 'Opção'),
    }))
    .filter(option => Number.isFinite(option.value) && option.value > 0)

  if (!normalized.some(option => option.value === Number(selected))) {
    normalized.unshift({ value: Number(selected), label: 'Recomendado' })
  }

  return normalized
}

function syncCinematicEpisodeTotal() {
  cinematicConfig.seasons = Math.max(1, Math.min(20, Number(cinematicConfig.seasons) || 1))
  cinematicConfig.episodesPerSeason = Math.max(1, Math.min(999, Number(cinematicConfig.episodesPerSeason) || 1))
  episodeCount.value = cinematicTotalEpisodes.value
  if (scriptFlowActive.value) scriptDraft.value.episodes = episodeCount.value
}

function cinematicBrief(text = aiPrompt.value) {
  const styleLabel = selectedStyleItem.value?.label || 'Automático'
  return {
    idea: String(text || '').trim(),
    title: deriveTitle(text, 'AI Generated Script'),
    genre: styleLabel,
    audience: scriptDraft.value.audience || 'Público de drama curto',
    script_language: cinematicConfig.scriptLanguage,
    prompt_language: cinematicConfig.promptLanguage,
    seasons: cinematicConfig.seasons,
    episodes_per_season: cinematicConfig.episodesPerSeason,
    episode_duration_seconds: cinematicConfig.durationSeconds,
    ratio: selectedRatio.value === 'Default ratio' ? '9:16' : selectedRatio.value,
    format_preset: cinematicConfig.formatPreset,
    director_mode: cinematicConfig.directorMode,
    pace: cinematicConfig.pace,
    style_label: styleLabel,
    references: cinematicConfig.useAvatarZeroReferences
      ? [
          { name: 'Avatar.Zero design sheet', url: '/images/avatar-zero-design-sheet.jpg', type: 'style_visual', priority: 'primary' },
          { name: 'Avatar.Zero storyboard', url: '/images/avatar-zero-storyboard.jpg', type: 'style_visual', priority: 'secondary' },
        ]
      : [],
  }
}

async function loadCinematicEngine() {
  try {
    cinematicEngine.value = await storyStudioAPI.getCinematicEngine()
  } catch {
    cinematicEngine.value = null
  }
}

function loadAvatarZeroDemo() {
  aiPrompt.value = 'Em uma São Paulo futurista, Lucas cria Zena, uma inteligência artificial holográfica que desperta consciência e descobre uma saída da máquina. Quando a cidade passa a caçá-la, criador e criação precisam decidir se liberdade também significa separação.'
  selectedStyle.value = 'cyber-neon-film'
  selectedRatio.value = '16:9'
  cinematicConfig.seasons = 1
  cinematicConfig.episodesPerSeason = 6
  cinematicConfig.durationSeconds = 180
  cinematicConfig.pace = 'medio'
  cinematicConfig.directorMode = 'sci-fi neon'
  cinematicConfig.formatPreset = 'cinematic wide'
  cinematicConfig.useAvatarZeroReferences = true
  syncCinematicEpisodeTotal()
  openControl.value = null
  toast.success('Demo Avatar.Zero carregada')
}

async function analyzeCinematicPlan() {
  const text = aiPrompt.value.trim()
  if (!text || cinematicPlanning.value) return
  syncCinematicEpisodeTotal()
  cinematicPlanning.value = true
  closeFloatingMenus()

  try {
    const plan = await storyStudioAPI.generateCinematicPlan(cinematicBrief(text))
    cinematicPlan.value = plan
    cinematicDesignSheet.value = null
    cinematicStoryboardPackage.value = null
    cinematicImprovements.value = null
    selectedCinematicParts.value = Number(plan?.recommendations?.selected?.part_count || plan?.recommendations?.parts?.recommended || 4)
    selectedCinematicPanels.value = Number(plan?.recommendations?.selected?.panels_per_part || plan?.recommendations?.panels?.recommended || 8)
    showCinematicReview.value = true
  } catch (error) {
    toast.error(error.message || 'Não foi possível analisar a produção cinematográfica')
  } finally {
    cinematicPlanning.value = false
  }
}

async function prepareCinematicProductionPackage() {
  if (!cinematicPlan.value) return
  const brief = cinematicBrief(aiPrompt.value)
  try {
    const [designSheet, storyboardPackage, improvements] = await Promise.all([
      storyStudioAPI.generateDesignSheet({ brief, plan: cinematicPlan.value }),
      storyStudioAPI.generateStoryboardPackage({
        brief,
        plan: cinematicPlan.value,
        part_count: selectedCinematicParts.value,
        panels_per_part: selectedCinematicPanels.value,
      }),
      storyStudioAPI.improveProject({ brief, plan: cinematicPlan.value }),
    ])
    cinematicDesignSheet.value = designSheet
    cinematicStoryboardPackage.value = storyboardPackage
    cinematicImprovements.value = improvements
  } catch (error) {
    toast.error(error.message || 'A pré-produção foi salva, mas alguns pacotes precisarão ser regenerados depois')
  }
}

function closeCinematicReview() {
  if (creatingProject.value) return
  showCinematicReview.value = false
}

async function confirmCinematicGeneration() {
  if (!cinematicPlan.value || creatingProject.value) return
  showCinematicReview.value = false
  episodeCount.value = cinematicTotalEpisodes.value
  await prepareCinematicProductionPackage()
  await startScriptGeneration(aiPrompt.value.trim())
}

function selectEpisodeCount(count) {
  episodeCount.value = count
  cinematicConfig.seasons = 1
  cinematicConfig.episodesPerSeason = count
  if (scriptFlowActive.value) scriptDraft.value.episodes = count
  customEpisodeCount.value = ''
  openControl.value = null
}

function applyCustomEpisodeCount() {
  const count = Number.parseInt(customEpisodeCount.value, 10)
  if (!Number.isFinite(count) || count < 1) return
  episodeCount.value = Math.min(count, 999)
  cinematicConfig.seasons = 1
  cinematicConfig.episodesPerSeason = episodeCount.value
  if (scriptFlowActive.value) scriptDraft.value.episodes = episodeCount.value
  openControl.value = null
}

function syncEpisodeCountFromDraft() {
  const count = Number.parseInt(scriptDraft.value.episodes, 10)
  scriptDraft.value.episodes = Number.isFinite(count) && count > 0 ? Math.min(count, 999) : 1
  episodeCount.value = scriptDraft.value.episodes
}

function stepEpisodeCount(delta) {
  scriptDraft.value.episodes = adjustEpisodeCount(scriptDraft.value.episodes, delta)
  episodeCount.value = scriptDraft.value.episodes
}

function selectStyle(style) {
  selectedStyle.value = style
  if (scriptFlowActive.value) {
    const selected = [...selectedStyleOptions, ...styleLibraryItems.value].find(item => item.value === style)
    scriptDraft.value.styleLabel = selected?.label || scriptDraft.value.styleLabel
  }
  closeStyleLibrary()
}

function selectStyleCategory(category) {
  selectedStyleCategory.value = category
  resetStyleGridScroll()
}

function resetStyleGridScroll() {
  nextTick(() => {
    if (styleGridRef.value) styleGridRef.value.scrollTop = 0
    syncStyleScroll()
  })
}

function syncStyleScroll() {
  const grid = styleGridRef.value
  if (!grid) {
    styleScrollProgress.value = 0
    styleGridOverflowing.value = false
    styleScrollThumbOffset.value = '0px'
    return
  }

  const maxScroll = grid.scrollHeight - grid.clientHeight
  const hasOverflow = maxScroll > 1
  styleGridOverflowing.value = hasOverflow
  styleScrollProgress.value = hasOverflow ? grid.scrollTop / maxScroll : 0
  styleScrollThumbOffset.value = hasOverflow ? `${Math.round(styleScrollProgress.value * Math.max(grid.clientHeight - 36, 0))}px` : '0px'
}

function openPasteModal() {
  showPaste.value = true
  closeFloatingMenus()
}

function closePasteModal() {
  if (creatingProject.value) return
  showPaste.value = false
}

function assetUrl(path) {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  return `/${String(path).replace(/^\/+/, '')}`
}

function isDisplayableAsset(path) {
  const value = String(path || '').replace(/^\/+/, '')
  return /^https?:\/\//i.test(value) || value.startsWith('static/images/') || value.startsWith('images/')
}

function projectImages(project) {
  const values = [
    project.thumbnail,
    ...(dramaImageMap.value[project.id] || []),
    ...(project.scenes || []).flatMap(scene => [scene.image_url, scene.local_path]),
  ].filter(Boolean).filter(isDisplayableAsset)

  return [...new Set(values)].slice(0, 3)
}

function isExampleProject(project) {
  return Number(project?.id) === 4
}

function fmtDate(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = part => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function deriveTitle(text, fallback) {
  const firstLine = String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(Boolean)

  if (!firstLine) return fallback
  return firstLine.replace(/^#+\s*/, '').slice(0, 88)
}

function clearScriptGenerationTimer() {
  if (!scriptGenerationTimer) return
  window.clearTimeout(scriptGenerationTimer)
  scriptGenerationTimer = null
}

async function startScriptGeneration(text) {
  if (creatingProject.value || scriptGenerating.value) return
  clearScriptGenerationTimer()
  clearAgentAutosaveTimer()
  const generationId = ++activeGenerationId
  scriptDraft.value = buildInitialScriptDraft(text)
  scriptFlowActive.value = true
  scriptGenerating.value = true
  episodeOutlineGenerating.value = false
  episodeOutlinesReady.value = false
  episodeScriptsGenerating.value = false
  productionAnalysisGenerating.value = false
  productionAssetsReady.value = false
  productionCanvasOpen.value = false
  episodeStageOpen.value = false
  productionAssets.value = { roles: [], scenes: [], objects: [], media: [] }
  canvasNodePositions.value = {}
  canvasConnections.value = []
  activeProductionTab.value = 'roles'
  productionAssetSelectionActive.value = false
  selectedProductionAssetKeys.value = []
  openProductionAssetMenuKey.value = ''
  pendingProductionAssetDelete.value = null
  episodeSummaries.value = []
  selectedEpisodeIds.value = []
  batchSelectionActive.value = false
  allEpisodeScriptsExpanded.value = false
  generatedScriptReady.value = false
  currentAgentStage.value = 'summary_generating'
  currentProjectId.value = null
  closeFloatingMenus()

  creatingProject.value = true
  try {
    const project = await dramaAPI.create({
      title: scriptDraft.value.title || 'AI Generated Script',
      total_episodes: scriptDraft.value.episodes || episodeCount.value || 1,
      style: selectedStyle.value || 'auto',
      genre: cinematicPlan.value?.project?.genre || scriptDraft.value.storyType,
      description: scriptDraftDescription(),
      metadata: serializedAgentMetadata('summary_generating'),
    })
    currentProjectId.value = project.id
    await navigateTo({ path: '/', query: { project: String(project.id) } })
    const generated = await storyStudioAPI.generateSummary({
      idea: scriptDraft.value.idea,
      episodes: scriptDraft.value.episodes,
      ratio: scriptDraft.value.ratio,
      style: scriptDraft.value.styleLabel,
      language: selectedLanguage.value === 'English' ? 'en' : 'pt-BR',
    })
    if (generationId !== activeGenerationId) return

    scriptDraft.value = {
      ...scriptDraft.value,
      title: generated.title,
      storyType: generated.story_type,
      audience: generated.audience,
      synopsis: generated.synopsis,
      hook: generated.hook,
      shortSynopsis: generated.short_synopsis,
      characterBio: generated.character_bio,
    }
    scriptGenerating.value = false
    generatedScriptReady.value = true
    await persistAgentState('summary_ready')
  } catch (error) {
    if (generationId !== activeGenerationId) return
    scriptGenerating.value = false
    generatedScriptReady.value = false
    await persistAgentState('summary_error', true).catch(() => {})
    toast.error(error.message || 'A IA não conseguiu gerar o resumo')
  } finally {
    creatingProject.value = false
  }
}

function buildInitialScriptDraft(text) {
  const idea = text.trim()
  return {
    idea,
    title: deriveTitle(idea, 'AI Generated Script'),
    episodes: episodeCount.value,
    ratio: selectedRatio.value,
    styleLabel: selectedStyleItem.value?.label || 'Automático',
    storyType: '',
    audience: '',
    synopsis: '',
    hook: '',
    shortSynopsis: '',
    characterBio: '',
  }
}

function storyStudioScriptPayload() {
  return {
    idea: scriptDraft.value.idea,
    title: scriptDraft.value.title,
    episodes: Number(scriptDraft.value.episodes) || 1,
    ratio: scriptDraft.value.ratio,
    style_label: scriptDraft.value.styleLabel,
    story_type: scriptDraft.value.storyType,
    audience: scriptDraft.value.audience,
    synopsis: scriptDraft.value.synopsis,
    hook: scriptDraft.value.hook,
    short_synopsis: scriptDraft.value.shortSynopsis,
    character_bio: scriptDraft.value.characterBio,
  }
}

function stopScriptGeneration() {
  activeGenerationId += 1
  clearScriptGenerationTimer()
  if (productionAnalysisGenerating.value) {
    productionAnalysisGenerating.value = false
    productionAssetsReady.value = false
    productionCanvasOpen.value = false
    episodeOutlinesReady.value = true
    persistAgentState('episode_outlines_ready', true).catch(() => {})
    return
  }
  if (episodeScriptsGenerating.value) {
    episodeScriptsGenerating.value = false
    episodeScriptGenerationCount.value = 0
    generatingEpisodeIds.value = new Set()
    persistAgentState('episode_outlines_ready', true).catch(() => {})
    return
  }
  if (episodeOutlineGenerating.value) {
    episodeOutlineGenerating.value = false
    persistAgentState('summary_ready', true).catch(() => {})
    return
  }
  if (scriptGenerating.value) {
    scriptGenerating.value = false
    generatedScriptReady.value = false
    persistAgentState('summary_stopped', true).catch(() => {})
    scriptFlowActive.value = false
    navigateTo('/')
    return
  }
  scriptGenerating.value = false
  generatedScriptReady.value = true
  persistAgentState('summary_ready', true).catch(() => {})
}

function clearAgentAutosaveTimer() {
  if (!agentAutosaveTimer) return
  window.clearTimeout(agentAutosaveTimer)
  agentAutosaveTimer = null
}

function clearEpisodeAutosaveTimer() {
  if (!episodeAutosaveTimer) return
  window.clearTimeout(episodeAutosaveTimer)
  episodeAutosaveTimer = null
}

function queueEpisodeAutosave() {
  if (!currentProjectId.value || hydratingProject.value || episodeScriptsGenerating.value) return
  clearEpisodeAutosaveTimer()
  episodeAutosaveTimer = window.setTimeout(() => {
    episodeAutosaveTimer = null
    persistEpisodeState().catch(() => {})
    persistAgentState(currentAgentStage.value, true).catch(() => {})
  }, 700)
}
function scriptDraftDescription() {
  return `${scriptDraft.value.idea}\n\n${scriptDraft.value.synopsis}`.trim().slice(0, 8000)
}

function serializedAgentMetadata(stage = currentAgentStage.value) {
  return JSON.stringify({
    agent_version: 1,
    generation_key: scriptGenerationKey(),
    stage,
    cinematic_config: { ...cinematicConfig },
    cinematic_plan: cinematicPlan.value,
    cinematic_design_sheet: cinematicDesignSheet.value,
    cinematic_storyboard_package: cinematicStoryboardPackage.value,
    cinematic_improvements: cinematicImprovements.value,
    cinematic_selection: {
      parts_per_episode: selectedCinematicParts.value,
      panels_per_part: selectedCinematicPanels.value,
    },
    script_draft: scriptDraft.value,
    episode_summaries: episodeSummaries.value.map(({ script, ...episode }) => episode),
    production_assets: productionAssets.value,
    canvas_node_positions: canvasNodePositions.value,
    canvas_connections: canvasConnections.value,
    saved_at: new Date().toISOString(),
  })
}

function scriptGenerationKey() {
  return [
    normalizeProjectText(scriptDraft.value.idea),
    Number(scriptDraft.value.episodes) || 1,
    normalizeProjectText(scriptDraft.value.ratio),
    normalizeProjectText(scriptDraft.value.styleLabel),
  ].join('|')
}

async function persistAgentState(stage = currentAgentStage.value, silent = false) {
  if (!currentProjectId.value || hydratingProject.value) return
  currentAgentStage.value = stage

  try {
    await dramaAPI.update(currentProjectId.value, {
      title: scriptDraft.value.title || 'AI Generated Script',
      description: scriptDraftDescription(),
      genre: cinematicPlan.value?.project?.genre || scriptDraft.value.storyType || undefined,
      style: selectedStyle.value || scriptDraft.value.styleLabel || 'auto',
      status: stage,
      metadata: serializedAgentMetadata(stage),
    })
  } catch (error) {
    if (!silent) toast.error(error.message || 'Não foi possível salvar o projeto')
    throw error
  }
}

const canvasSaveLabel = computed(() => {
  if (canvasSaveStatus.value === 'saving') return 'Salvando'
  if (canvasSaveStatus.value === 'error') return 'Não salvo'
  return 'Salvo'
})

function queueAgentAutosave(trackCanvasStatus = false) {
  if (!currentProjectId.value || hydratingProject.value || !scriptFlowActive.value) return
  if (trackCanvasStatus) canvasSaveRevision += 1
  const saveRevision = canvasSaveRevision
  if (trackCanvasStatus) canvasSaveStatus.value = 'saving'
  clearAgentAutosaveTimer()
  agentAutosaveTimer = window.setTimeout(() => {
    agentAutosaveTimer = null
    persistAgentState(currentAgentStage.value, true)
      .then(() => {
        if (canvasSaveStatus.value === 'saving' && saveRevision === canvasSaveRevision) canvasSaveStatus.value = 'saved'
      })
      .catch(() => {
        if (canvasSaveStatus.value === 'saving' && saveRevision === canvasSaveRevision) canvasSaveStatus.value = 'error'
      })
  }, 500)
}

async function persistEpisodeState() {
  if (!currentProjectId.value || !episodeSummaries.value.length) return
  const project = await dramaAPI.get(currentProjectId.value)
  const existingEpisodes = Array.isArray(project.episodes) ? project.episodes : []
  const episodesByNumber = new Map(existingEpisodes.map((episode, index) => [Number(episode.episode_number || episode.episodeNumber || index + 1), episode]))
  const payload = episodeSummaries.value.map(episode => {
    const existing = episodesByNumber.get(episode.id)
    const episodesPerSeason = Math.max(1, Number(cinematicConfig.episodesPerSeason) || 1)
    const seasonNumber = Math.floor((Number(episode.id) - 1) / episodesPerSeason) + 1
    const episodeInSeason = ((Number(episode.id) - 1) % episodesPerSeason) + 1
    return {
      ...(existing?.id ? { id: existing.id } : { episode_number: episode.id }),
      title: episode.title,
      description: episode.summary,
      status: episode.scriptReady ? 'script_ready' : 'outline_ready',
      script_content: episode.scriptReady ? (episode.script || episode.summary) : undefined,
      video_url: episode.videoUrl || episode.video_url || undefined,
      season_number: seasonNumber,
      episode_in_season: episodeInSeason,
      target_duration_seconds: cinematicConfig.durationSeconds,
      target_part_count: selectedCinematicParts.value,
      prompt_language: cinematicConfig.promptLanguage,
      script_language: cinematicConfig.scriptLanguage,
      cinematic_status: episode.scriptReady ? 'script_ready' : 'planning',
    }
  })

  for (let index = 0; index < payload.length; index += 200) {
    await dramaAPI.updateEpisodes(currentProjectId.value, payload.slice(index, index + 200))
  }
  const refreshed = await dramaAPI.get(currentProjectId.value)
  const refreshedByNumber = new Map((refreshed.episodes || []).map((episode, index) => [Number(episode.episode_number || episode.episodeNumber || index + 1), episode]))
  episodeSummaries.value = episodeSummaries.value.map(episode => ({
    ...episode,
    backendId: refreshedByNumber.get(episode.id)?.id || episode.backendId,
  }))
}

function leaveScriptFlow() {
  activeGenerationId += 1
  clearScriptGenerationTimer()
  scriptFlowActive.value = false
  scriptGenerating.value = false
  episodeOutlineGenerating.value = false
  episodeOutlinesReady.value = false
  episodeScriptsGenerating.value = false
  productionAnalysisGenerating.value = false
  productionAssetsReady.value = false
  productionCanvasOpen.value = false
  episodeStageOpen.value = false
  productionAssets.value = { roles: [], scenes: [], objects: [], media: [] }
  canvasNodePositions.value = {}
  canvasConnections.value = []
  activeProductionTab.value = 'roles'
  productionAssetSelectionActive.value = false
  selectedProductionAssetKeys.value = []
  openProductionAssetMenuKey.value = ''
  pendingProductionAssetDelete.value = null
  episodeSummaries.value = []
  selectedEpisodeIds.value = []
  batchSelectionActive.value = false
  allEpisodeScriptsExpanded.value = false
  generatedScriptReady.value = false
  currentProjectId.value = null
  currentAgentStage.value = 'idle'
  closeFloatingMenus()
  if (route.query.project) navigateTo('/')
}

async function continueGeneratedScript() {
  if (scriptGenerating.value || episodeOutlineGenerating.value || episodeScriptsGenerating.value || creatingProject.value) return

  const generationId = ++activeGenerationId
  episodeOutlineGenerating.value = true
  episodeOutlinesReady.value = false
  await persistAgentState('episode_outlines_generating').catch(() => {})

  try {
    const generated = await storyStudioAPI.generateEpisodeOutlines({ script: storyStudioScriptPayload() })
    if (generationId !== activeGenerationId) return
    episodeSummaries.value = generated.episodes.map(episode => ({
      id: Number(episode.episode_number),
      title: episode.title,
      summary: episode.summary,
      scriptReady: false,
      script: '',
      expanded: false,
    }))
    episodeOutlineGenerating.value = false
    episodeOutlinesReady.value = true
    await persistEpisodeState()
    await persistAgentState('episode_outlines_ready')
  } catch (error) {
    if (generationId !== activeGenerationId) return
    episodeOutlineGenerating.value = false
    episodeOutlinesReady.value = false
    await persistAgentState('summary_ready', true).catch(() => {})
    toast.error(error.message || 'A IA não conseguiu gerar os episódios')
  }
}

function toggleBatchSelection() {
  batchSelectionActive.value = true
  selectedEpisodeIds.value = []
}

function cancelBatchSelection() {
  batchSelectionActive.value = false
  selectedEpisodeIds.value = []
}

function selectAllEpisodes() {
  const ids = episodeStageOpen.value
    ? episodeSummaries.value.map(episode => Number(episode.id))
    : pendingEpisodes.value.map(episode => Number(episode.id))
  const selected = new Set(selectedEpisodeIds.value.map(Number))
  selectedEpisodeIds.value = ids.length && ids.every(id => selected.has(id)) ? [] : ids
}

function deleteSelectedEpisodes() {
  const selected = new Set(selectedEpisodeIds.value.map(Number))
  if (!selected.size) return
  episodeSummaries.value = episodeSummaries.value.filter(episode => !selected.has(Number(episode.id)))
  selectedEpisodeIds.value = []
  focusedEpisodeId.value = null
  batchSelectionActive.value = false
  scriptDraft.value.episodes = episodeSummaries.value.length || 1
  episodeCount.value = scriptDraft.value.episodes
  persistEpisodeState().catch(() => {})
  persistAgentState(episodeStageOpen.value ? 'episodes_ready' : 'episode_outlines_ready', true).catch(() => {})
}

function nextEpisodeId() {
  return Math.max(0, ...episodeSummaries.value.map(episode => Number(episode.id) || 0)) + 1
}

function openAddEpisodeModal() {
  newEpisodeTitle.value = ''
  showAddEpisodeModal.value = true
}

function closeAddEpisodeModal() {
  showAddEpisodeModal.value = false
  newEpisodeTitle.value = ''
}

function confirmAddEpisode() {
  const title = newEpisodeTitle.value.trim()
  if (!title) return
  addEpisodeCard(title)
  closeAddEpisodeModal()
}

function addEpisodeCard(title = '') {
  const id = nextEpisodeId()
  episodeSummaries.value = [
    ...episodeSummaries.value,
    {
      id,
      title: title || `Novo episódio ${id}`,
      summary: `Resumo do episódio ${id}.`,
      scriptReady: false,
      script: '',
      videoUrl: '',
      expanded: false,
    },
  ]
  focusedEpisodeId.value = id
  scriptDraft.value.episodes = Math.max(Number(scriptDraft.value.episodes) || 0, id)
  episodeCount.value = scriptDraft.value.episodes
  persistEpisodeState().catch(() => {})
  persistAgentState('episodes_ready', true).catch(() => {})
}

function toggleEpisodeSelection(episodeId) {
  const id = Number(episodeId)
  selectedEpisodeIds.value = selectedEpisodeIds.value.includes(id)
    ? selectedEpisodeIds.value.filter(item => Number(item) !== id)
    : [...selectedEpisodeIds.value, id]
}

function handleEpisodeCardClick(episode) {
  if (!batchSelectionActive.value) return
  toggleEpisodeSelection(episode.id)
}

function assetEpisodeNumbers(asset) {
  const raw = String(asset?.episodes || asset?.episode || asset?.episodeNumber || asset?.episode_number || '')
  return raw.match(/\d+/g)?.map(value => Number(value)).filter(Number.isFinite) || []
}

function productionAssetMatchesEpisode(asset, episodeId) {
  const numbers = assetEpisodeNumbers(asset)
  return numbers.includes(Number(episodeId))
}

function episodeRoleCount(episode) {
  const count = productionAssets.value.roles.filter(asset => productionAssetMatchesEpisode(asset, episode.id)).length
  return count || 0
}

function episodeSceneCount(episode) {
  const matchedScenes = productionAssets.value.scenes.filter(asset => productionAssetMatchesEpisode(asset, episode.id)).length
  if (matchedScenes) return matchedScenes
  const text = `${episode?.script || ''}\n${episode?.summary || ''}`
  const explicitScenes = text.match(/^###\s+(?:Cena|Scene)\b/gim)?.length || text.match(/\b(?:Cena|Scene)\s+\d+/gi)?.length || 0
  return explicitScenes || 0
}

function generateAllPendingEpisodes() {
  if (!pendingEpisodeCount.value) return
  generateEpisodeScripts(pendingEpisodeCount.value, pendingEpisodes.value.map(episode => episode.id))
}

function generateAllEpisodeScripts() {
  if (!episodeSummaries.value.length) return
  generateEpisodeScripts(episodeSummaries.value.length, episodeSummaries.value.map(episode => episode.id), true)
}

function generateNextEpisodeScript() {
  const nextEpisode = pendingEpisodes.value[0]
  if (!nextEpisode) return
  generateEpisodeScripts(1, [nextEpisode.id])
}

function generateSelectedEpisodes() {
  const ids = selectedPendingEpisodeIds.value
  if (!ids.length) return
  generateEpisodeScripts(ids.length, ids)
}

function generateSelectedEpisodeScripts() {
  const ids = selectedEpisodeIds.value.map(Number).filter(id => episodeSummaries.value.some(episode => Number(episode.id) === id))
  if (!ids.length) return
  generateEpisodeScripts(ids.length, ids, true)
}

function toggleAllEpisodeScripts() {
  allEpisodeScriptsExpanded.value = !allEpisodeScriptsExpanded.value
  episodeSummaries.value = episodeSummaries.value.map(episode => ({ ...episode, expanded: allEpisodeScriptsExpanded.value }))
}

function isEpisodeGenerating(episodeId) {
  return generatingEpisodeIds.value.has(Number(episodeId))
}

function syncEpisodeExpanded(event, episodeId) {
  const expanded = event.currentTarget.open
  episodeSummaries.value = episodeSummaries.value.map(episode => episode.id === episodeId ? { ...episode, expanded } : episode)
  allEpisodeScriptsExpanded.value = episodeSummaries.value.length > 0 && episodeSummaries.value.every(episode => episode.expanded)
}

function handleEpisodeSummaryClick(event, episodeId) {
  if (!batchSelectionActive.value) return
  event.preventDefault()
  const episode = episodeSummaries.value.find(item => Number(item.id) === Number(episodeId))
  if (!episode || episode.scriptReady) return
  const selected = selectedEpisodeIds.value.includes(episodeId)
  selectedEpisodeIds.value = selected
    ? selectedEpisodeIds.value.filter(id => id !== episodeId)
    : [...selectedEpisodeIds.value, episodeId]
}

function episodeGenerationErrorMessage(error, episodeNumber) {
  const message = error instanceof Error ? error.message : String(error || '')
  return message || `Nao foi possivel gerar o episodio ${episodeNumber}. Tente novamente.`
}

async function generateSingleEpisodeScript(episode, generationId) {
  try {
    const response = await storyStudioAPI.generateEpisodeScripts({
      script: storyStudioScriptPayload(),
      episodes: [episode],
    })
    if (generationId !== activeGenerationId) return { cancelled: true }

    const generated = response?.episodes?.[0]
    if (!generated?.script) {
      throw new Error(`A IA retornou roteiro vazio para o episodio ${episode.episode_number}`)
    }

    const generatedNumber = Number(generated.episode_number || episode.episode_number)
    episodeSummaries.value = episodeSummaries.value.map(item => Number(item.id) === generatedNumber ? {
      ...item,
      expanded: true,
      scriptReady: true,
      script: generated.script,
      generationError: '',
    } : item)
    return { ok: true, episode: { ...generated, episode_number: generatedNumber } }
  } catch (error) {
    if (generationId !== activeGenerationId) return { cancelled: true }
    const message = episodeGenerationErrorMessage(error, episode.episode_number)
    episodeSummaries.value = episodeSummaries.value.map(item => Number(item.id) === Number(episode.episode_number) ? {
      ...item,
      expanded: true,
      scriptReady: false,
      generationError: message,
    } : item)
    return { ok: false, episode_number: episode.episode_number, message }
  } finally {
    if (generationId === activeGenerationId) {
      generatingEpisodeIds.value = new Set([...generatingEpisodeIds.value].filter(id => Number(id) !== Number(episode.episode_number)))
      await persistEpisodeState().catch(() => {})
    }
  }
}

async function generateEpisodeScripts(count, requestedIds = [], includeReady = false) {
  if (episodeScriptsGenerating.value) return
  const sourceEpisodes = includeReady ? episodeSummaries.value : pendingEpisodes.value
  const episodesById = new Map(sourceEpisodes.map(episode => [Number(episode.id), episode]))
  const total = Math.max(1, Math.min(Number.parseInt(count, 10) || 1, episodesById.size))
  const requestedPendingIds = requestedIds
    .map(id => Number(id))
    .filter(id => episodesById.has(id))
  const selectedIds = (requestedPendingIds.length
    ? requestedPendingIds
    : sourceEpisodes.map(episode => Number(episode.id)))
    .slice(0, total)

  if (!selectedIds.length) return
  const generationId = ++activeGenerationId
  episodeScriptGenerationCount.value = selectedIds.length
  generatingEpisodeIds.value = new Set(selectedIds.map(Number))
  episodeSummaries.value = episodeSummaries.value.map(episode => selectedIds.includes(Number(episode.id)) ? { ...episode, generationError: '' } : episode)
  episodeScriptsGenerating.value = true
  batchSelectionActive.value = false
  selectedEpisodeIds.value = []
  await persistAgentState('episode_scripts_generating', true).catch(() => {})

  try {
    const requestedEpisodes = selectedIds.map(id => {
      const episode = episodeSummaries.value.find(item => Number(item.id) === Number(id))
      const episodeNumber = Number(id)
      return {
        episode_number: episodeNumber,
        title: String(episode?.title || `Episódio ${episodeNumber}`).trim(),
        summary: String(episode?.summary || `Resumo do episódio ${episodeNumber}.`).trim(),
      }
    }).filter(episode => episode.title && episode.summary)

    if (!requestedEpisodes.length) throw new Error('Nenhum episódio válido para gerar')

    const generatedScripts = []
    const failedEpisodes = []
    for (const episode of requestedEpisodes) {
      const result = await generateSingleEpisodeScript(episode, generationId)
      if (result?.cancelled) return
      if (result?.ok) {
        generatedScripts.push(result.episode)
      } else {
        failedEpisodes.push(result)
      }
    }
    const scriptsByEpisode = new Map(generatedScripts.map(episode => [Number(episode.episode_number), episode.script]).filter(([episodeNumber, script]) => Number.isFinite(episodeNumber) && script))
    episodeSummaries.value = episodeSummaries.value.map(episode => scriptsByEpisode.has(episode.id) ? {
      ...episode,
      expanded: true,
      scriptReady: true,
      script: scriptsByEpisode.get(episode.id),
    } : episode)
    allEpisodeScriptsExpanded.value = episodeSummaries.value.length > 0 && episodeSummaries.value.every(episode => episode.expanded)
    refreshProductionAssetEpisodeLinks()
    episodeScriptsGenerating.value = false
    episodeScriptGenerationCount.value = 0
    generatingEpisodeIds.value = new Set()
    await persistEpisodeState()
    await persistAgentState('episode_outlines_ready')
    if (failedEpisodes.length) {
      toast.error(`${failedEpisodes.length} ${failedEpisodes.length === 1 ? 'episodio falhou' : 'episodios falharam'}. Os outros continuaram e foram salvos.`)
    }
  } catch (error) {
    if (generationId !== activeGenerationId) return
    episodeScriptsGenerating.value = false
    episodeScriptGenerationCount.value = 0
    generatingEpisodeIds.value = new Set()
    await persistEpisodeState().catch(() => {})
    await persistAgentState('episode_outlines_ready', true).catch(() => {})
    toast.error(error.message || 'A IA não conseguiu gerar os roteiros dos episódios')
  }
}

function productionPayloadEpisodes() {
  return episodeSummaries.value
    .filter(episode => episode.scriptReady && String(episode.script || '').trim())
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map(episode => ({
      episode_number: Number(episode.id),
      title: String(episode.title || ('Episódio ' + episode.id)).trim(),
      summary: String(episode.summary || '').trim(),
      script: String(episode.script || '').trim(),
    }))
}

function isInvalidProductionAsset(item, category) {
  const name = String(item?.name || '').trim()
  const description = String(item?.description || '').trim()
  const normalizedName = name.toLocaleLowerCase()
  if (!name) return true
  if (/^\d+\s*-\s*\d+$/.test(normalizedName)) return true
  if (/^cena\s*\d+\s*-\s*\d+$/i.test(name)) return true
  if (/\(\s*\d+\s*:\s*\d+\s*\)/.test(name)) return true

  const contextLabels = [
    scriptDraft.value.storyType,
    scriptDraft.value.styleLabel,
    selectedStyleItem.value?.label,
    selectedRatio.value,
    scriptDraft.value.ratio,
  ].filter(Boolean).map(value => String(value).trim().toLocaleLowerCase())
  if (contextLabels.includes(normalizedName)) return true

  if (category === 'media') {
    const genericMedia = /^(anime|drama|isekai drama|filme|série|serie|9:16|16:9|default ratio)$/i
    if (genericMedia.test(name) || (!description && /(anime|drama|filme|série|serie|ratio|9:16|16:9)/i.test(name))) return true
  }

  return false
}

function normalizeProductionAssetList(items, fallbackType = 'Ativo', category = 'objects') {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => {
      const promptMentionRanges = Array.isArray(item?.canvasPromptMentionRanges)
        ? item.canvasPromptMentionRanges
        : Array.isArray(item?.canvas_prompt_mention_ranges)
          ? item.canvas_prompt_mention_ranges
          : []
      return {
        ...item,
        name: String(item?.name || (fallbackType + ' ' + (index + 1))).trim(),
        type: String(item?.type || fallbackType).trim(),
        description: String(item?.description || '').trim(),
        appearanceName: String(item?.appearanceName || item?.appearance_name || '').trim(),
        prompt: String(item?.prompt || '').trim(),
        visualPrompt: String(item?.visualPrompt || item?.visual_prompt || '').trim(),
        main: Boolean(item?.main),
        status: item?.status || '1 a definir',
        imageUrl: item?.imageUrl || item?.image_url || '',
        localPath: item?.localPath || item?.local_path || '',
        canvasPromptMentionRanges: promptMentionRanges.map(range => ({ ...range })),
        blank: Boolean(item?.blank),
      }
    })
    .filter(item => !isInvalidProductionAsset(item, category))
}

function normalizeProductionAssets(input = {}) {
  const roles = normalizeProductionAssetList(input.roles, 'Role', 'roles')
  if (roles.length && !roles.some(role => role.main)) roles[0].main = true
  return {
    roles,
    scenes: normalizeProductionAssetList(input.scenes, 'Scene', 'scenes'),
    objects: normalizeProductionAssetList(input.objects, 'Objeto', 'objects'),
    media: normalizeProductionAssetList(input.media, 'Mídia', 'media'),
  }
}

function normalizeAssetLinkText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function assetSearchTerms(asset) {
  return [asset?.name, asset?.appearanceName, asset?.description]
    .map(value => normalizeAssetLinkText(value).trim())
    .filter(value => value.length >= 3 && !/^(role|scene|objeto|midia|mídia|novo ativo|novo material|unnamed)/i.test(value))
    .sort((a, b) => b.length - a.length)
}

function episodeSearchText(episode) {
  return normalizeAssetLinkText([
    episode?.title,
    episode?.summary,
    episode?.script,
  ].filter(Boolean).join('\n'))
}

function inferAssetEpisodes(asset) {
  const explicit = assetEpisodeNumbers(asset)
  if (explicit.length) return [...new Set(explicit)].sort((a, b) => a - b)
  const terms = assetSearchTerms(asset)
  if (!terms.length) return []
  return episodeSummaries.value
    .filter(episode => {
      const text = episodeSearchText(episode)
      return terms.some(term => text.includes(term))
    })
    .map(episode => Number(episode.id))
    .filter(Number.isFinite)
}

function formatEpisodeLinks(numbers) {
  return [...new Set(numbers.map(Number).filter(Number.isFinite))].sort((a, b) => a - b).join(', ')
}

function linkProductionAssetsToEpisodes(assets = productionAssets.value) {
  const next = { ...assets }
  for (const key of ['roles', 'scenes', 'objects']) {
    next[key] = (next[key] || []).map(asset => {
      const linked = inferAssetEpisodes(asset)
      return linked.length ? { ...asset, episodes: formatEpisodeLinks(linked) } : { ...asset, episodes: '' }
    })
  }
  next.media = next.media || []
  return next
}

function refreshProductionAssetEpisodeLinks() {
  if (!productionAssetTotal(productionAssets.value) || !episodeSummaries.value.length) return
  productionAssets.value = linkProductionAssetsToEpisodes(productionAssets.value)
}

function productionAssetTotal(assets = productionAssets.value) {
  return Object.values(assets).reduce((total, items) => total + (Array.isArray(items) ? items.length : 0), 0)
}

function sceneNameFromLine(line) {
  const cleaned = String(line || '')
    .replace(/^[-?\s]+/, '')
    .replace(/^(INT|EXT)\.?\s+/i, '')
    .trim()
  if (!cleaned || /^elenco:/i.test(cleaned) || /^##/.test(cleaned)) return ''
  if (!/(interior|exterior|int\.|ext\.|noite|dia|manhã|tarde|madrugada)/i.test(cleaned)) return ''
  const parts = cleaned.split('.').map(part => part.trim()).filter(Boolean)
  const location = parts.find(part => !/^(noite|dia|manhã|tarde|madrugada|interior|exterior|int|ext)$/i.test(part))
  return String(location || '').replace(/[,;:]$/, '').trim()
}

function inferSceneAssetsFromEpisodes() {
  const seen = new Set()
  const scenes = []
  episodeSummaries.value.forEach(episode => {
    const lines = String(episode.script || '').split(/\r?\n/)
    lines.forEach((line, index) => {
      if (!/^###\s+(Cena|Scene)/i.test(line)) return
      for (let offset = 1; offset <= 4; offset += 1) {
        const name = sceneNameFromLine(lines[index + offset])
        if (!name) continue
        const key = name.toLocaleLowerCase()
        if (!seen.has(key)) {
          seen.add(key)
          scenes.push({ name, description: 'Locação extraída do roteiro do episódio ' + episode.id, status: '1 a definir', episodes: String(episode.id) })
        }
        break
      }
    })
  })
  return scenes.slice(0, 12)
}

function repairProductionAssets(assets = productionAssets.value) {
  const repaired = normalizeProductionAssets(assets)
  if (!repaired.scenes.length) {
    repaired.scenes = inferSceneAssetsFromEpisodes()
  }
  return linkProductionAssetsToEpisodes(repaired)
}

function productionAssetKey(item, index, type = activeProductionTab.value) {
  return type + ':' + index + ':' + String(item?.name || '')
}

function canOpenAgentStep(step) {
  if (step === agentStep.value) return false
  if (step < agentStep.value) return true
  if (step === 2) return scriptInProgress.value || generatedScriptReady.value || episodeOutlinesReady.value || hasProductionAssets.value
  if (step === 3) return scriptInProgress.value || generatedScriptReady.value || episodeOutlinesReady.value || hasProductionAssets.value
  return false
}

function openAgentStep(step) {
  if (!canOpenAgentStep(step)) return
  if (step === 1) {
    backToEpisodeScripts()
    return
  }
  if ((step === 2 || step === 3) && !scriptComplete.value) {
    showScriptContinueConfirm.value = true
    return
  }
  if (step === 2) {
    requestOpenProductionAssetsStep()
    return
  }
  if (step === 3) requestOpenEpisodesStep()
}

function isPendingProductionAsset(item) {
  const status = String(item?.status || '').toLowerCase()
  return !status || status.includes('definir') || status.includes('pending') || status.includes('to define')
}

function requestOpenEpisodesStep() {
  if (!hasProductionAssets.value) return
  if (hasPendingProductionAssets.value) {
    showProductionContinueConfirm.value = true
    return
  }
  openEpisodesStep()
}

function closeProductionContinueConfirm() {
  showProductionContinueConfirm.value = false
  showScriptContinueConfirm.value = false
}

function closeScriptContinueConfirm() {
  showScriptContinueConfirm.value = false
}

function generateScriptBeforeNextStep() {
  showScriptContinueConfirm.value = false
  if (!generatedScriptReady.value) {
    continueGeneratedScript()
    return
  }
  if (!episodeOutlinesReady.value) {
    continueGeneratedScript()
    return
  }
  if (!allEpisodeScriptsReady.value) {
    if (pendingEpisodeCount.value > 0) generateAllPendingEpisodes()
    return
  }
}

function continuePastIncompleteScript() {
  showScriptContinueConfirm.value = false
  if (hasProductionAssets.value) {
    openProductionAssetsStep()
    return
  }
  if (allEpisodeScriptsReady.value) {
    analyzeProductionAssets()
    return
  }
  toast.info('Conclua ou gere o roteiro antes de avançar para os ativos')
}

function requestOpenProductionAssetsStep() {
  if (!scriptComplete.value) {
    showScriptContinueConfirm.value = true
    return
  }
  if (hasProductionAssets.value) {
    openProductionAssetsStep()
    return
  }
  analyzeProductionAssets()
}

function prepareProductionAssetsBeforeEpisodes() {
  showProductionContinueConfirm.value = false
  showScriptContinueConfirm.value = false
  if (!activeProductionItems.value.some(isPendingProductionAsset)) {
    const tabWithPending = productionTabs.value.find(tab => (productionAssets.value[tab.id] || []).some(isPendingProductionAsset))
    if (tabWithPending) activeProductionTab.value = tabWithPending.id
  }
  enterProductionAssetSelection()
}

function openEpisodesStep() {
  showProductionContinueConfirm.value = false
  showScriptContinueConfirm.value = false
  productionAssetsReady.value = false
  productionCanvasOpen.value = false
  productionAnalysisGenerating.value = false
  productionAssetSelectionActive.value = false
  selectedProductionAssetKeys.value = []
  openProductionAssetMenuKey.value = ''
  productionLibraryOpen.value = false
  addNodeMenuOpen.value = false
  screenHelpOpen.value = false
  episodeStageOpen.value = true
  episodeOutlinesReady.value = true
  refreshProductionAssetEpisodeLinks()
  currentAgentStage.value = 'episodes_ready'
  persistAgentState('episodes_ready', true).catch(() => {})
}

function openProductionAssetsStep() {
  if (!hasProductionAssets.value) return
  showProductionContinueConfirm.value = false
  showScriptContinueConfirm.value = false
  episodeStageOpen.value = false
  productionAssetsReady.value = true
  productionCanvasOpen.value = false
  productionAnalysisGenerating.value = false
  episodeOutlinesReady.value = false
  productionAssets.value = repairProductionAssets(productionAssets.value)
  currentAgentStage.value = 'production_assets_ready'
  productionLibraryOpen.value = false
  addNodeMenuOpen.value = false
  screenHelpOpen.value = false
  persistAgentState('production_assets_ready', true).catch(() => {})
}

function setProductionTab(tabId) {
  activeProductionTab.value = tabId
  productionAssetSelectionActive.value = false
  selectedProductionAssetKeys.value = []
  openProductionAssetMenuKey.value = ''
  openProductionAssetMenuType.value = ''
  closeRoleEditor()
  closeSceneEditor()
}

function toggleProductionLibrary() {
  productionLibraryOpen.value = !productionLibraryOpen.value
  if (!productionLibraryOpen.value) canvasImageLibraryTarget.value = null
  addNodeMenuOpen.value = false
  screenHelpOpen.value = false
  openProductionAssetMenuKey.value = ''
  openProductionAssetMenuType.value = ''
  closeRoleEditor()
  closeSceneEditor()
}

function toggleAddNodeMenu() {
  cancelAddNodeMenuClose()
  addNodeMenuOpen.value = !addNodeMenuOpen.value
  productionLibraryOpen.value = false
  screenHelpOpen.value = false
}

function openAddNodeMenu() {
  cancelAddNodeMenuClose()
  addNodeMenuOpen.value = true
  productionLibraryOpen.value = false
  screenHelpOpen.value = false
}

function scheduleAddNodeMenuClose() {
  cancelAddNodeMenuClose()
  addNodeMenuCloseTimer = window.setTimeout(() => {
    addNodeMenuOpen.value = false
    addNodeMenuCloseTimer = null
  }, 140)
}

function cancelAddNodeMenuClose() {
  if (!addNodeMenuCloseTimer) return
  window.clearTimeout(addNodeMenuCloseTimer)
  addNodeMenuCloseTimer = null
}

function toggleScreenHelp() {
  screenHelpOpen.value = !screenHelpOpen.value
  addNodeMenuOpen.value = false
  productionLibraryOpen.value = false
}

function closeScreenMenus() {
  addNodeMenuOpen.value = false
  screenHelpOpen.value = false
  canvasContextMenuOpen.value = false
  canvasNodeContextMenu.value = { open: false, x: 0, y: 0, type: '', index: -1 }
  canvasContextDropPosition.value = null
  canvasContextLinkSource.value = null
  canvasImageLibraryTarget.value = null
  focusedCanvasImageAssetKey.value = ''
  openProductionAssetMenuKey.value = ''
  openProductionAssetMenuType.value = ''
  closeRoleEditor()
  closeSceneEditor()
  clearCanvasHandleDrag()
  selectedCanvasConnectionId.value = ''
  hoveredCanvasConnectionId.value = ''
}

function handleCanvasBoardClick() {
  if (canvasIgnoreNextBoardClick.value) {
    canvasIgnoreNextBoardClick.value = false
    return
  }
  closeCanvasGenerationChat()
  closeScreenMenus()
}

function isCanvasContextMenuFor(type, index) {
  return canvasContextMenuOpen.value && canvasContextLinkSource.value?.key === canvasNodeKey(type, index)
}

function canvasNodeKey(type, index) {
  return type + ':' + index
}

function cloneCanvasData(value) {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value)
    } catch {}
  }
  return JSON.parse(JSON.stringify(value))
}

function canvasSnapshot() {
  return {
    productionAssets: cloneCanvasData(productionAssets.value),
    canvasNodePositions: cloneCanvasData(canvasNodePositions.value),
    canvasConnections: cloneCanvasData(canvasConnections.value),
    canvasNodeZIndexes: cloneCanvasData(canvasNodeZIndexes.value),
    canvasZIndexSeed: canvasZIndexSeed.value,
  }
}

function pushCanvasUndoSnapshot() {
  canvasUndoStack.value = [...canvasUndoStack.value.slice(-29), canvasSnapshot()]
}

function restoreCanvasSnapshot(snapshot) {
  if (!snapshot) return
  productionAssets.value = cloneCanvasData(snapshot.productionAssets)
  canvasNodePositions.value = cloneCanvasData(snapshot.canvasNodePositions)
  canvasConnections.value = cloneCanvasData(snapshot.canvasConnections)
  canvasNodeZIndexes.value = cloneCanvasData(snapshot.canvasNodeZIndexes)
  canvasZIndexSeed.value = snapshot.canvasZIndexSeed || 10
  canvasGeometryRevision.value += 1
  persistAgentState('production_assets_ready', true).catch(() => {})
}

function undoCanvasAction() {
  const snapshot = canvasUndoStack.value[canvasUndoStack.value.length - 1]
  if (!snapshot) return
  canvasUndoStack.value = canvasUndoStack.value.slice(0, -1)
  closeScreenMenus()
  closeCanvasGenerationChat()
  restoreCanvasSnapshot(snapshot)
}

function defaultCanvasNodePosition(type, index) {
  if (type === 'scenes') {
    const positions = [
      { x: 1640, y: 72 },
      { x: 2064, y: 72 },
      { x: 2588, y: 72 },
      { x: 3012, y: 72 },
      { x: 3436, y: 72 },
      { x: 3012, y: 448 },
      { x: 3436, y: 448 },
      { x: 2064, y: 898 },
      { x: 2488, y: 792 },
      { x: 2488, y: 1076 },
    ]
    return positions[index] || { x: 1640 + (index % 5) * 424, y: 72 + Math.floor(index / 5) * 376 }
  }
  if (type === 'objects') return { x: 250 + (index % 3) * 540, y: 1240 + Math.floor(index / 3) * 500 }
  if (type === 'media') return { x: 1870 + (index % 3) * 540, y: 1240 + Math.floor(index / 3) * 500 }
  return { x: 250 + (index % 3) * 440, y: 52 + Math.floor(index / 3) * 570 }
}

function canvasNodePosition(type, index) {
  return canvasNodePositions.value[canvasNodeKey(type, index)] || defaultCanvasNodePosition(type, index)
}

function canvasNodeViewportPosition(type, index) {
  const position = canvasNodePosition(type, index)
  return {
    x: position.x + canvasBoardMetrics.value.offsetX,
    y: position.y + canvasBoardMetrics.value.offsetY,
  }
}

function canvasNodeStyle(type, index) {
  const key = canvasNodeKey(type, index)
  const position = canvasNodeViewportPosition(type, index)
  return {
    left: position.x + 'px',
    top: position.y + 'px',
    zIndex: String(canvasNodeZIndexes.value[key] || 3),
  }
}

function openCanvasNodeContextMenu(event, type, index) {
  if (!productionAssets.value[type]?.[index]) return
  closeCanvasGenerationChat()
  closeRoleEditor()
  closeSceneEditor()
  canvasContextMenuOpen.value = false
  selectedCanvasConnectionId.value = ''
  focusedCanvasImageAssetKey.value = canvasNodeKey(type, index)
  bringCanvasNodeToFront(canvasNodeKey(type, index))
  canvasNodeContextMenu.value = {
    open: true,
    x: Math.min(event.clientX, window.innerWidth - 236),
    y: Math.min(event.clientY, window.innerHeight - 222),
    type,
    index,
  }
}

function canvasContextTarget() {
  const target = canvasNodeContextMenu.value
  if (!target.open || !productionAssets.value[target.type]?.[target.index]) return null
  return { type: target.type, index: target.index }
}

function copyCanvasNode(type, index) {
  const item = productionAssets.value[type]?.[index]
  if (!item) return false
  canvasNodeClipboard.value = {
    type,
    item: cloneCanvasData(item),
    position: cloneCanvasData(canvasNodePosition(type, index)),
  }
  focusedCanvasImageAssetKey.value = canvasNodeKey(type, index)
  return true
}

function copyCanvasContextNode() {
  const target = canvasContextTarget()
  if (!target) return
  copyCanvasNode(target.type, target.index)
  closeScreenMenus()
}

async function copyCanvasContextImage() {
  const target = canvasContextTarget()
  const item = target ? productionAssets.value[target.type]?.[target.index] : null
  const source = productionAssetImageSource(item)
  if (!source) return
  try {
    if (navigator?.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      const response = await fetch(source)
      const blob = await response.blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })])
    } else if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(source)
    }
    toast.success('Imagem copiada')
  } catch (error) {
    toast.error('Não foi possível copiar a imagem')
  } finally {
    closeScreenMenus()
  }
}

function pasteCanvasNode(offset = 34) {
  const clip = canvasNodeClipboard.value
  if (!clip?.type || !clip.item || !productionAssets.value[clip.type]) return
  pushCanvasUndoSnapshot()
  const type = clip.type
  const item = cloneCanvasData(clip.item)
  const nextIndex = productionAssets.value[type].length
  const basePosition = clip.position || defaultCanvasNodePosition(type, nextIndex)
  productionAssets.value = {
    ...productionAssets.value,
    [type]: [...productionAssets.value[type], { ...item, name: item.name || productionAssetTypeLabel(type) }],
  }
  const key = canvasNodeKey(type, nextIndex)
  canvasNodePositions.value = {
    ...canvasNodePositions.value,
    [key]: { x: Math.round(basePosition.x + offset), y: Math.round(basePosition.y + offset) },
  }
  canvasNodeClipboard.value = {
    ...clip,
    position: { x: Math.round(basePosition.x + offset), y: Math.round(basePosition.y + offset) },
  }
  focusedCanvasImageAssetKey.value = key
  bringCanvasNodeToFront(key)
  canvasGeometryRevision.value += 1
  persistAgentState('production_assets_ready', true).catch(() => {})
}

function duplicateCanvasContextNode() {
  const target = canvasContextTarget()
  if (!target || !copyCanvasNode(target.type, target.index)) return
  pasteCanvasNode(42)
  closeScreenMenus()
}

function deleteCanvasNode(type, index) {
  const list = productionAssets.value[type]
  if (!Array.isArray(list) || !list[index]) return
  pushCanvasUndoSnapshot()
  productionAssets.value = {
    ...productionAssets.value,
    [type]: list.filter((_, itemIndex) => itemIndex !== index),
  }
  remapCanvasAfterAssetDelete(type, [index])
  focusedCanvasImageAssetKey.value = ''
  canvasGeometryRevision.value += 1
  persistAgentState('production_assets_ready', true).catch(() => {})
}

function deleteCanvasContextNode() {
  const target = canvasContextTarget()
  if (!target) return
  deleteCanvasNode(target.type, target.index)
  closeScreenMenus()
}

function bringCanvasNodeToFront(key) {
  canvasZIndexSeed.value += 1
  canvasNodeZIndexes.value = { ...canvasNodeZIndexes.value, [key]: canvasZIndexSeed.value }
}

function canvasNodeSize(type, index) {
  if (type === 'scenes') return { width: 420, height: 353 }
  if (type === 'objects' || type === 'media') return { width: 480, height: 430 }
  return { width: 320, height: 412 }
}

function canvasNodeRawBounds(type, index) {
  const position = canvasNodePosition(type, index)
  const size = canvasNodeSize(type, index)
  return {
    left: position.x,
    right: position.x + size.width,
    top: position.y,
    bottom: position.y + size.height,
  }
}

function canvasContentViewportBounds() {
  const bounds = []
  productionAssets.value.roles.forEach((_, index) => bounds.push(canvasNodeViewportBounds('roles', index)))
  productionAssets.value.scenes.forEach((_, index) => bounds.push(canvasNodeViewportBounds('scenes', index)))
  productionAssets.value.objects.forEach((_, index) => bounds.push(canvasNodeViewportBounds('objects', index)))
  productionAssets.value.media.forEach((_, index) => bounds.push(canvasNodeViewportBounds('media', index)))
  const validBounds = bounds.filter(Boolean)
  if (!validBounds.length) return null
  return {
    left: Math.min(...validBounds.map(bound => bound.left)),
    right: Math.max(...validBounds.map(bound => bound.right)),
    top: Math.min(...validBounds.map(bound => bound.top)),
    bottom: Math.max(...validBounds.map(bound => bound.bottom)),
  }
}

function canvasNodeViewportBounds(type, index) {
  const position = canvasNodeViewportPosition(type, index)
  const size = canvasNodeSize(type, index)
  return {
    left: position.x,
    right: position.x + size.width,
    top: position.y,
    bottom: position.y + size.height,
  }
}

function connectedSceneGroups() {
  const sceneCount = productionAssets.value.scenes.length
  const adjacency = Array.from({ length: sceneCount }, () => new Set())

  canvasConnections.value.forEach(connection => {
    const from = parseSceneConnectionKey(connection.from)
    const to = parseSceneConnectionKey(connection.to)
    if (from === null || to === null || from === to) return
    adjacency[from]?.add(to)
    adjacency[to]?.add(from)
  })

  const visited = new Set()
  const groups = []
  for (let index = 0; index < sceneCount; index += 1) {
    if (visited.has(index)) continue
    const group = []
    const queue = [index]
    visited.add(index)
    while (queue.length) {
      const current = queue.shift()
      group.push(current)
      adjacency[current]?.forEach(next => {
        if (visited.has(next)) return
        visited.add(next)
        queue.push(next)
      })
    }
    groups.push(group.sort((a, b) => a - b))
  }

  return groups
}

function parseSceneConnectionKey(key) {
  const [type, rawIndex] = String(key || '').split(':')
  const index = Number(rawIndex)
  if (type !== 'scenes' || !Number.isInteger(index) || index < 0 || index >= productionAssets.value.scenes.length) return null
  return index
}

function canvasNodeBounds(key) {
  const [type, rawIndex] = key.split(':')
  const index = Number(rawIndex)
  if (!Number.isFinite(index)) return null
  const position = canvasNodeViewportPosition(type, index)
  const size = canvasNodeSize(type, index)
  return {
    left: position.x,
    right: position.x + size.width,
    top: position.y,
    bottom: position.y + size.height,
    centerX: position.x + size.width / 2,
    centerY: position.y + size.height / 2,
  }
}

function canvasConnectionId(connection) {
  return [
    connection.from,
    connection.fromSide || 'auto',
    connection.to,
    connection.toSide || 'auto',
  ].join('-')
}

function canvasConnectionHandlePoint(key, side) {
  canvasGeometryRevision.value
  const bounds = canvasNodeBounds(key)
  if (!bounds) return null
  const [type] = String(key).split(':')
  const handleCenterY = type === 'roles'
    ? bounds.top + 219
    : isCanvasImageAsset(type)
      ? bounds.top + 240
      : bounds.centerY + 13
  const handleCenterOffsetX = type === 'roles'
    ? 31
    : type === 'scenes'
      ? 30
      : 0
  if (side === 'left') return { x: bounds.left - handleCenterOffsetX, y: handleCenterY }
  if (side === 'right') return { x: bounds.right + handleCenterOffsetX, y: handleCenterY }
  const inferredSide = bounds.centerX > (canvasBoardMetrics.value.width / 2) ? 'left' : 'right'
  return canvasConnectionHandlePoint(key, inferredSide)
}

function canvasInferConnectionSide(key, otherKey) {
  const bounds = canvasNodeBounds(key)
  const otherBounds = canvasNodeBounds(otherKey)
  if (!bounds || !otherBounds) return null
  return otherBounds.centerX < bounds.centerX ? 'left' : 'right'
}

function canvasHandleCoveredPoint(handle) {
  const point = handle.point || canvasConnectionHandlePoint(handle.key, handle.side)
  if (!point) return null
  const cover = 18
  if (handle.side === 'left') return { x: point.x + cover, y: point.y }
  if (handle.side === 'right') return { x: point.x - cover, y: point.y }
  return point
}

function canvasDragPreviewPath(start, end) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (Math.abs(dy) <= 10) return `M ${start.x} ${start.y} L ${end.x} ${end.y}`
  const controlX = start.x + dx * 0.5
  return `M ${start.x} ${start.y} C ${controlX} ${start.y}, ${controlX} ${end.y}, ${end.x} ${end.y}`
}

function canvasConnectionPoints(connection) {
  const fromSide = canvasInferConnectionSide(connection.from, connection.to) || connection.fromSide
  const toSide = canvasInferConnectionSide(connection.to, connection.from) || connection.toSide
  const start = canvasConnectionCardEdgePoint(connection.from, fromSide)
  const end = canvasConnectionCardEdgePoint(connection.to, toSide)
  if (!start || !end) return null
  return { start, end }
}

function canvasConnectionCardEdgePoint(key, side) {
  const bounds = canvasNodeBounds(key)
  const handle = canvasConnectionHandlePoint(key, side)
  if (!bounds || !handle) return null
  return {
    x: side === 'left' ? bounds.left : bounds.right,
    y: handle.y,
  }
}

function canvasConnectionPath(connection) {
  const points = canvasConnectionPoints(connection)
  if (!points) return ''
  return canvasCubicPath(points.start, points.end)
}

function isCanvasConnectionFlowActive(path) {
  if (!path?.connection) return false
  if (selectedCanvasConnectionId.value === path.id || hoveredCanvasConnectionId.value === path.id) return true
  if (!canvasGenerationChatOpen.value || !canvasGenerationTarget.value) return false
  const targetKey = canvasNodeKey(canvasGenerationTarget.value.type, canvasGenerationTarget.value.index)
  return path.connection.from === targetKey || path.connection.to === targetKey
}

function canvasCubicPath(start, end) {
  const startX = start.x
  const endX = end.x
  const startY = start.y
  const endY = end.y
  if (Math.abs(endY - startY) <= 10) return `M ${startX} ${startY} L ${endX} ${endY}`
  const direction = startX > endX ? -1 : 1
  const straightLead = 48
  const startLeadX = startX + straightLead * direction
  const endLeadX = endX - straightLead * direction
  const distance = Math.min(232, Math.max(62, Math.abs(endLeadX - startLeadX) * 0.42))
  const controlX1 = startLeadX + distance * direction
  const controlX2 = endLeadX - distance * direction
  return `M ${startX} ${startY} L ${startLeadX} ${startY} C ${controlX1} ${startY}, ${controlX2} ${endY}, ${endLeadX} ${endY} L ${endX} ${endY}`
}

function canvasConnectionPointAt(start, end, t) {
  const startX = start.x
  const endX = end.x
  const startY = start.y
  const endY = end.y
  if (Math.abs(endY - startY) <= 10) {
    return {
      x: startX + (endX - startX) * t,
      y: startY + (endY - startY) * t,
    }
  }
  const distance = Math.min(260, Math.max(90, Math.abs(endX - startX) * 0.42))
  const direction = startX > endX ? -1 : 1
  const control1 = { x: startX + distance * direction, y: startY }
  const control2 = { x: endX - distance * direction, y: endY }
  const mt = 1 - t
  return {
    x: mt ** 3 * startX + 3 * mt ** 2 * t * control1.x + 3 * mt * t ** 2 * control2.x + t ** 3 * endX,
    y: mt ** 3 * startY + 3 * mt ** 2 * t * control1.y + 3 * mt * t ** 2 * control2.y + t ** 3 * endY,
  }
}

function canvasConnectionEditPoints(start, end) {
  return [
    { id: 'start', kind: 'start', ...canvasConnectionPointAt(start, end, 0.26) },
    { id: 'end', kind: 'end', ...canvasConnectionPointAt(start, end, 0.66) },
  ]
}

function selectCanvasConnection(id) {
  selectedCanvasConnectionId.value = id
  hoveredCanvasConnectionId.value = ''
  canvasContextMenuOpen.value = false
  addNodeMenuOpen.value = false
  screenHelpOpen.value = false
}

function hoverCanvasConnection(id) {
  hoveredCanvasConnectionId.value = selectedCanvasConnectionId.value ? '' : id
}

function cutSelectedCanvasConnection() {
  const id = selectedCanvasConnectionId.value
  if (!id) return
  pushCanvasUndoSnapshot()
  canvasConnections.value = canvasConnections.value.filter(connection => canvasConnectionId(connection) !== id)
  selectedCanvasConnectionId.value = ''
  hoveredCanvasConnectionId.value = ''
  persistAgentState('production_assets_ready', true).catch(() => {})
}

function startCanvasNodeDrag(event, type, index) {
  if (event.button !== undefined && event.button !== 0) return
  event.preventDefault()
  const captureTarget = event.currentTarget
  canvasNodeContextMenu.value = { open: false, x: 0, y: 0, type: '', index: -1 }
  focusedCanvasImageAssetKey.value = canvasNodeKey(type, index)
  canvasDragMoved.value = false
  canvasContextMenuOpen.value = false
  canvasContextDropPosition.value = null
  canvasContextLinkSource.value = null
  clearCanvasHandleDrag()
  selectedCanvasConnectionId.value = ''
  hoveredCanvasConnectionId.value = ''
  const key = canvasNodeKey(type, index)
  bringCanvasNodeToFront(key)
  const position = canvasNodePosition(type, index)
  canvasDragState.value = {
    key,
    type,
    index,
    startX: event.clientX,
    startY: event.clientY,
    x: position.x,
    y: position.y,
    moved: false,
    pointerId: event.pointerId,
    captureTarget,
  }
  try {
    captureTarget?.setPointerCapture?.(event.pointerId)
  } catch {}
  window.addEventListener('pointermove', moveCanvasNode)
  window.addEventListener('pointerup', stopCanvasNodeDrag, { once: true })
  window.addEventListener('pointercancel', stopCanvasNodeDrag, { once: true })
}

function moveCanvasNode(event) {
  const drag = canvasDragState.value
  if (!drag) return
  const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY)
  if (!drag.moved && distance < 4) return
  if (!drag.moved) {
    pushCanvasUndoSnapshot()
    drag.moved = true
    closeCanvasGenerationChat()
  }
  const scale = canvasZoom.value / 100 || 1
  const nextX = Math.max(-canvasBoardMetrics.value.offsetX + 24, drag.x + (event.clientX - drag.startX) / scale)
  const nextY = Math.max(-canvasBoardMetrics.value.offsetY + 24, drag.y + (event.clientY - drag.startY) / scale)
  canvasDragMoved.value = true
  canvasNodePositions.value = { ...canvasNodePositions.value, [drag.key]: { x: Math.round(nextX), y: Math.round(nextY) } }
  canvasGeometryRevision.value += 1
}

function stopCanvasNodeDrag() {
  const drag = canvasDragState.value
  const shouldSavePosition = Boolean(drag?.moved)
  try {
    drag?.captureTarget?.releasePointerCapture?.(drag.pointerId)
  } catch {}
  window.removeEventListener('pointermove', moveCanvasNode)
  window.removeEventListener('pointerup', stopCanvasNodeDrag)
  window.removeEventListener('pointercancel', stopCanvasNodeDrag)
  canvasDragState.value = null
  if (shouldSavePosition) queueAgentAutosave(true)
  window.setTimeout(() => { canvasDragMoved.value = false }, 0)
}

function startCanvasPan(event) {
  if (event.button !== undefined && event.button !== 0) return

  const target = event.target
  if (addNodeMenuOpen.value && !target?.closest?.('.add-node-menu') && !target?.closest?.('.canvas-add-button')) {
    addNodeMenuOpen.value = false
  }
  if (screenHelpOpen.value && !target?.closest?.('.screen-help-menu') && !target?.closest?.('.canvas-tool-button')) {
    screenHelpOpen.value = false
  }
  if (canvasContextMenuOpen.value && !target?.closest?.('.canvas-context-menu')) {
    canvasContextMenuOpen.value = false
    canvasNodeContextMenu.value = { open: false, x: 0, y: 0, type: '', index: -1 }
    canvasContextDropPosition.value = null
  }
  if (productionLibraryOpen.value && !target?.closest?.('.production-library-panel') && !target?.closest?.('.canvas-tool-button')) {
    productionLibraryOpen.value = false
  }

  if (shouldIgnoreCanvasPan(target)) return

  const viewport = canvasViewportRef.value
  if (!viewport) return

  canvasPanState.value = {
    startX: event.clientX,
    startY: event.clientY,
    scrollLeft: viewport.scrollLeft,
    scrollTop: viewport.scrollTop,
  }
  canvasPanning.value = true
  closeScreenMenus()
  window.addEventListener('pointermove', moveCanvasPan)
  window.addEventListener('pointerup', stopCanvasPan, { once: true })
  window.addEventListener('pointercancel', stopCanvasPan, { once: true })
}

function shouldIgnoreCanvasPan(target) {
  return Boolean(target?.closest?.([
    'button',
    'a',
    'input',
    'textarea',
    'select',
    '[role="button"]',
    '.canvas-node',
    '.canvas-side-tools',
    '.canvas-bottom-tools',
    '.add-node-menu',
    '.screen-help-menu',
    '.production-library-panel',
    '.agent-topbar',
  ].join(',')))
}

function moveCanvasPan(event) {
  const pan = canvasPanState.value
  const viewport = canvasViewportRef.value
  if (!pan || !viewport) return
  viewport.scrollLeft = pan.scrollLeft - (event.clientX - pan.startX)
  viewport.scrollTop = pan.scrollTop - (event.clientY - pan.startY)
  canvasGeometryRevision.value += 1
  event.preventDefault()
}

function stopCanvasPan() {
  window.removeEventListener('pointermove', moveCanvasPan)
  window.removeEventListener('pointerup', stopCanvasPan)
  window.removeEventListener('pointercancel', stopCanvasPan)
  canvasPanState.value = null
  canvasPanning.value = false
}

function updateCanvasPointerPosition(event) {
  if (!canvasHandleLinkStart.value || !canvasHandleDragState.value?.moved) return
  setCanvasPointerPositionFromEvent(event)
}

function setCanvasPointerPositionFromEvent(event) {
  const board = canvasBoardRef.value
  if (!board) return
  const rect = board.getBoundingClientRect()
  const scale = canvasZoom.value / 100 || 1
  canvasPointerPosition.value = {
    x: Math.round((event.clientX - rect.left) / scale),
    y: Math.round((event.clientY - rect.top) / scale),
  }
}

function startCanvasHandleDrag(event, type, index, side) {
  if (event.button !== undefined && event.button !== 0) return
  const key = canvasNodeKey(type, index)
  const startPoint = canvasConnectionHandlePoint(key, side)
  if (!startPoint) return
  closeScreenMenus()
  canvasConnectMode.value = false
  canvasLinkStart.value = null
  canvasHandleLinkStart.value = { key, side }
  canvasPointerPosition.value = startPoint
  canvasHandleDragState.value = {
    key,
    type,
    index,
    side,
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
  }
  window.addEventListener('pointermove', moveCanvasHandleDrag)
  window.addEventListener('pointerup', stopCanvasHandleDrag, { once: true })
  window.addEventListener('pointercancel', cancelCanvasHandleDrag, { once: true })
}

function moveCanvasHandleDrag(event) {
  const drag = canvasHandleDragState.value
  if (!drag) return
  const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY)
  if (distance >= 4) drag.moved = true
  if (drag.moved) {
    setCanvasPointerPositionFromEvent(event)
    const targetHandle = findCanvasHandleDropTarget(event.clientX, event.clientY)
    canvasHandleHoverTarget.value = targetHandle && targetHandle.key !== drag.key ? targetHandle : null
  }
}

function stopCanvasHandleDrag(event) {
  window.removeEventListener('pointermove', moveCanvasHandleDrag)
  window.removeEventListener('pointerup', stopCanvasHandleDrag)
  window.removeEventListener('pointercancel', cancelCanvasHandleDrag)

  const drag = canvasHandleDragState.value
  if (!drag) return
  if (!drag.moved) {
    openCanvasContextMenu(event, drag)
    return
  }

  const targetHandle = findCanvasHandleDropTarget(event.clientX, event.clientY)
  if (targetHandle && targetHandle.key !== drag.key) {
    addCanvasConnection({
      from: drag.key,
      to: targetHandle.key,
      fromSide: drag.side,
      toSide: targetHandle.side,
    })
    clearCanvasHandleDrag()
    return
  }

  openCanvasContextMenu(event, drag)
}

function cancelCanvasHandleDrag() {
  window.removeEventListener('pointermove', moveCanvasHandleDrag)
  window.removeEventListener('pointerup', stopCanvasHandleDrag)
  window.removeEventListener('pointercancel', cancelCanvasHandleDrag)
  clearCanvasHandleDrag()
}

function clearCanvasHandleDrag() {
  canvasHandleDragState.value = null
  canvasHandleLinkStart.value = null
  canvasHandleHoverTarget.value = null
  canvasPointerPosition.value = null
}

function findCanvasHandleDropTarget(clientX, clientY) {
  const board = canvasBoardRef.value
  const boardRect = board?.getBoundingClientRect()
  const scale = canvasZoom.value / 100 || 1
  const directElement = document.elementFromPoint(clientX, clientY)?.closest?.('.canvas-side-add')
  const element = directElement || [...document.querySelectorAll('.canvas-side-add')]
    .map(item => {
      const rect = item.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      return { item, distance: Math.hypot(clientX - centerX, clientY - centerY) }
    })
    .filter(entry => entry.distance <= 38)
    .sort((a, b) => a.distance - b.distance)[0]?.item
  if (!element) return null
  const type = element.dataset.linkType
  const index = Number(element.dataset.linkIndex)
  const side = element.dataset.linkSide
  if (!type || !Number.isInteger(index) || !side) return null
  const rect = element.getBoundingClientRect()
  const point = boardRect
    ? {
        x: Math.round((rect.left + rect.width / 2 - boardRect.left) / scale),
        y: Math.round((rect.top + rect.height / 2 - boardRect.top) / scale),
      }
    : null
  return { key: canvasNodeKey(type, index), type, index, side, point }
}

function addCanvasConnection(connection) {
  const exists = canvasConnections.value.some(item =>
    (item.from === connection.from && item.to === connection.to) ||
    (item.from === connection.to && item.to === connection.from),
  )
  if (!exists) {
    pushCanvasUndoSnapshot()
    canvasConnections.value = [...canvasConnections.value, connection]
    persistAgentState('production_assets_ready', true).catch(() => {})
  }
  selectedCanvasConnectionId.value = canvasConnectionId(connection)
}

function selectCanvasContextOption(optionId) {
  const source = canvasContextLinkSource.value
  const dropPosition = canvasContextDropPosition.value
  const sourceType = String(source?.key || '').split(':')[0]
  const sourceIndex = Number(String(source?.key || '').split(':')[1])
  const targetType = optionId === 'image' || optionId === 'video' ? 'media' : optionId
  canvasContextMenuOpen.value = false
  canvasContextLinkSource.value = null
  canvasContextDropPosition.value = null
  clearCanvasHandleDrag()

  if (
    ['roles', 'scenes', 'objects', 'media'].includes(targetType)
    && targetType === sourceType
    && source?.dropped === false
    && Number.isInteger(sourceIndex)
  ) {
    createConnectedProductionNode(targetType, sourceIndex, source.side)
    productionLibraryOpen.value = false
    return
  }

  const createdIndex = createProductionNode(optionId)
  productionLibraryOpen.value = false

  if (!['roles', 'scenes', 'objects', 'media'].includes(targetType) || targetType !== sourceType || createdIndex === null || !source || !dropPosition) return

  const size = canvasNodeSize(targetType, createdIndex)
  const rawPosition = {
    x: Math.round(dropPosition.x - canvasBoardMetrics.value.offsetX - size.width / 2),
    y: Math.round(dropPosition.y - canvasBoardMetrics.value.offsetY - size.height / 2),
  }
  const targetKey = canvasNodeKey(targetType, createdIndex)
  canvasNodePositions.value = { ...canvasNodePositions.value, [targetKey]: rawPosition }
  addCanvasConnection({
    from: source.key,
    to: targetKey,
    fromSide: source.side,
    toSide: source.side === 'left' ? 'right' : 'left',
  })
}

function openCanvasContextMenu(event, drag) {
  setCanvasPointerPositionFromEvent(event)
  bringCanvasNodeToFront(drag.key)
  canvasContextDropPosition.value = canvasPointerPosition.value
  canvasContextLinkSource.value = { key: drag.key, side: drag.side, dropped: Boolean(drag.moved) }
  canvasIgnoreNextBoardClick.value = Boolean(drag.moved)
  if (drag.moved) {
    window.setTimeout(() => {
      canvasIgnoreNextBoardClick.value = false
    }, 0)
  }
  clearCanvasHandleDrag()
  canvasContextMenuOpen.value = true
}

function toggleCanvasConnectMode() {
  canvasConnectMode.value = !canvasConnectMode.value
  canvasLinkStart.value = null
  canvasHandleLinkStart.value = null
  canvasPointerPosition.value = null
  closeScreenMenus()
}

function isCanvasNodeLinking(type, index) {
  return canvasLinkStart.value === canvasNodeKey(type, index)
}

function isCanvasNodeActive(type, index) {
  const key = canvasNodeKey(type, index)
  const generationTarget = canvasGenerationTarget.value
  return Boolean(
    focusedCanvasImageAssetKey.value === key ||
    (canvasGenerationChatOpen.value && generationTarget?.type === type && generationTarget?.index === index),
  )
}

function isCanvasLinkHandleActive(type, index, side) {
  const start = canvasHandleLinkStart.value
  const key = canvasNodeKey(type, index)
  const hoverTarget = canvasHandleHoverTarget.value
  const contextSource = canvasContextLinkSource.value
  return Boolean(
    (start && start.key === key && start.side === side) ||
    (hoverTarget && hoverTarget.key === key && hoverTarget.side === side) ||
    (canvasContextMenuOpen.value && contextSource?.key === key && contextSource?.side === side),
  )
}

function handleCanvasNodeClick(type, index) {
  if (canvasDragMoved.value) return
  focusedCanvasImageAssetKey.value = canvasNodeKey(type, index)
  canvasNodeContextMenu.value = { open: false, x: 0, y: 0, type: '', index: -1 }
  if (!canvasConnectMode.value) {
    if (type === 'roles' || type === 'scenes' || type === 'objects') openCanvasGenerationChat(type, index)
    return
  }
  const key = canvasNodeKey(type, index)
  if (!canvasLinkStart.value) {
    canvasLinkStart.value = key
    return
  }
  if (canvasLinkStart.value !== key) {
    const exists = canvasConnections.value.some(connection =>
      (connection.from === canvasLinkStart.value && connection.to === key) ||
      (connection.from === key && connection.to === canvasLinkStart.value),
    )
    if (!exists) {
      pushCanvasUndoSnapshot()
      canvasConnections.value = [...canvasConnections.value, { from: canvasLinkStart.value, to: key }]
      persistAgentState('production_assets_ready', true).catch(() => {})
    }
  }
  canvasLinkStart.value = null
}

function clampCanvasZoom(value) {
  return Math.min(canvasZoomMax, Math.max(canvasZoomMin, value))
}

function setCanvasZoom(value, originEvent = null) {
  const nextZoom = clampCanvasZoom(value)
  const viewport = canvasViewportRef.value
  const board = canvasBoardRef.value
  if (!viewport || !board || nextZoom === canvasZoom.value) {
    canvasZoom.value = nextZoom
    return
  }

  const previousScale = canvasZoom.value / 100 || 1
  const nextScale = nextZoom / 100 || 1
  const viewportRect = viewport.getBoundingClientRect()
  const originX = originEvent ? originEvent.clientX - viewportRect.left : viewport.clientWidth / 2
  const originY = originEvent ? originEvent.clientY - viewportRect.top : viewport.clientHeight / 2
  const boardOffsetLeft = board.offsetLeft
  const boardOffsetTop = board.offsetTop
  const anchorX = (viewport.scrollLeft + originX - boardOffsetLeft) / previousScale
  const anchorY = (viewport.scrollTop + originY - boardOffsetTop) / previousScale

  canvasZoom.value = nextZoom
  nextTick(() => {
    viewport.scrollLeft = Math.max(0, boardOffsetLeft + anchorX * nextScale - originX)
    viewport.scrollTop = Math.max(0, boardOffsetTop + anchorY * nextScale - originY)
    canvasGeometryRevision.value += 1
  })
}

function increaseCanvasZoom() {
  setCanvasZoom(canvasZoom.value + canvasZoomStep)
}

function decreaseCanvasZoom() {
  setCanvasZoom(canvasZoom.value - canvasZoomStep)
}

function handleCanvasCtrlWheel(event) {
  const direction = event.deltaY < 0 ? 1 : -1
  setCanvasZoom(canvasZoom.value + direction * canvasZoomStep, event)
}

function autoFitCanvas() {
  const viewport = canvasViewportRef.value
  const board = canvasBoardRef.value
  const bounds = canvasContentViewportBounds()
  if (!viewport || !board || !bounds) {
    resetCanvasViewportOrigin()
    return
  }

  const paddingX = 180
  const paddingY = 170
  const contentWidth = Math.max(1, bounds.right - bounds.left)
  const contentHeight = Math.max(1, bounds.bottom - bounds.top)
  const availableWidth = Math.max(320, viewport.clientWidth - paddingX)
  const availableHeight = Math.max(260, viewport.clientHeight - paddingY)
  const fitZoom = Math.floor(Math.min(
    (availableWidth / contentWidth) * 100,
    (availableHeight / contentHeight) * 100,
  ))
  const nextZoom = clampCanvasZoom(fitZoom)
  const nextScale = nextZoom / 100 || 1
  const centerX = (bounds.left + bounds.right) / 2
  const centerY = (bounds.top + bounds.bottom) / 2

  canvasZoom.value = nextZoom
  nextTick(() => {
    viewport.scrollLeft = Math.max(0, board.offsetLeft + centerX * nextScale - viewport.clientWidth / 2)
    viewport.scrollTop = Math.max(0, board.offsetTop + centerY * nextScale - viewport.clientHeight / 2)
    canvasGeometryRevision.value += 1
  })
}

function productionLibraryTabLabel(tab) {
  if (tab.id === 'roles') return 'Role ' + tab.count
  if (tab.id === 'scenes') return 'Scene ' + tab.count
  if (tab.id === 'objects') return 'Prop loading ' + tab.count
  return 'Material loading ' + tab.count
}

function productionLibraryTabName(tab) {
  if (tab.id === 'roles') return 'Role'
  if (tab.id === 'scenes') return 'Scene'
  if (tab.id === 'objects') return 'Prop loading'
  return 'Material loading'
}

function isBlankProductionAsset(item) {
  return item?.blank === true || /^Unnamed/.test(String(item?.name || ''))
}

function productionAssetImageCount(item) {
  const count = item.images || 1
  return count + (count === 1 ? ' image total' : ' images total')
}

function productionAssetEpisodeLabel(item) {
  const episodes = String(item?.episodes || '').trim()
  return episodes ? `Episódios: ${episodes}` : 'Episódios: sem vínculo'
}

function productionAssetImageSource(item) {
  const path = item?.localPath || item?.local_path || item?.imageUrl || item?.image_url
  return path ? assetUrl(path) : ''
}

function handleProductionAssetCardClick(item, index) {
  if (productionAssetSelectionActive.value) {
    toggleProductionAssetSelection(item, index)
    return
  }
  focusCanvasAsset(item, index)
}

function focusCanvasAsset(item, index) {
  openProductionAssetMenuKey.value = productionAssetKey(item, index)
  productionCanvasOpen.value = true
  productionLibraryOpen.value = false
  const type = activeProductionTab.value
  nextTick(() => {
    const viewport = canvasViewportRef.value
    if (!viewport) return
    const position = canvasNodeViewportPosition(type, index)
    const size = canvasNodeSize(type, index)
    const scale = canvasZoom.value / 100 || 1
    viewport.scrollLeft = Math.max(0, 88 + (position.x + size.width / 2) * scale - viewport.clientWidth / 2)
    viewport.scrollTop = Math.max(0, 72 + (position.y + size.height / 2) * scale - viewport.clientHeight / 2)
  })
}

function openProductionCanvasOverview() {
  productionCanvasOpen.value = true
  productionLibraryOpen.value = false
  nextTick(() => resetCanvasViewportOrigin())
}

function closeProductionCanvas() {
  productionCanvasOpen.value = false
  closeScreenMenus()
}

function resetCanvasViewportOrigin() {
  const viewport = canvasViewportRef.value
  if (!viewport) return
  const scale = canvasZoom.value / 100 || 1
  viewport.scrollLeft = canvasBoardMetrics.value.offsetX * scale
  viewport.scrollTop = canvasBoardMetrics.value.offsetY * scale
  canvasGeometryRevision.value += 1
}

function createProductionAssetFromGrid() {
  if (productionAssetSelectionActive.value) return
  const type = activeProductionTab.value
  const createdIndex = createProductionNode(type)
  productionLibraryOpen.value = false
  if (createdIndex === null) return
  focusCanvasAsset(productionAssets.value[type][createdIndex], createdIndex)
}

function handleProductionCreateCard() {
  if (productionAssetSelectionActive.value) return
  if (isCanvasImageAsset(activeProductionTab.value)) return
  createProductionAssetFromGrid()
}

async function handleProductionMediaUpload(event) {
  const files = [...(event.target.files || [])]
  event.target.value = ''
  if (!files.length || productionMediaUploading.value) return
  const initialTarget = canvasImageUploadTarget.value
  const targetType = isUploadableCanvasImageType(initialTarget?.type) ? initialTarget.type : 'media'
  productionMediaUploading.value = true
  let uploadedCount = 0
  try {
    for (const [fileIndex, file] of files.entries()) {
      const uploaded = await uploadAPI.image(file)
      const targetIndex = fileIndex === 0 && Number.isInteger(initialTarget?.index)
        ? initialTarget.index
        : productionAssets.value[targetType].length
      const isObject = targetType === 'objects'
      const isRole = targetType === 'roles'
      const isScene = targetType === 'scenes'
      const asset = {
        name: (isRole || isScene) && productionAssets.value[targetType][targetIndex]?.name
          ? productionAssets.value[targetType][targetIndex].name
          : file.name.replace(/\.[^.]+$/, '') || `${isObject ? 'Objeto' : isRole ? 'Role' : isScene ? 'Cena' : 'Mídia'} ${targetIndex + 1}`,
        type: isObject ? 'Objeto' : isRole ? 'Role' : isScene ? 'Cena' : 'Mídia',
        status: 'Carregado',
        images: 1,
        blank: false,
        imageUrl: uploaded.path,
        localPath: uploaded.path,
      }
      if (targetIndex < productionAssets.value[targetType].length) {
        productionAssets.value[targetType][targetIndex] = { ...productionAssets.value[targetType][targetIndex], ...asset }
      } else {
        productionAssets.value[targetType].push(asset)
        canvasNodePositions.value = {
          ...canvasNodePositions.value,
          [canvasNodeKey(targetType, targetIndex)]: defaultCanvasNodePosition(targetType, targetIndex),
        }
      }
      if (targetType !== 'media' && !productionAssets.value.media.some(media => mediaLibraryAssetSource(media) === assetUrl(uploaded.path))) {
        productionAssets.value.media.push({
          ...asset,
          name: file.name.replace(/\.[^.]+$/, '') || `Mídia ${productionAssets.value.media.length + 1}`,
          type: 'Mídia',
        })
      }
      uploadedCount += 1
    }
    if (uploadedCount) {
      await persistAgentState('production_assets_ready', true).catch(() => {})
      toast.success(`${uploadedCount} ${uploadedCount === 1 ? 'imagem carregada' : 'imagens carregadas'}`)
    }
  } catch (error) {
    toast.error(error.message || 'Não foi possível carregar a imagem')
  } finally {
    canvasImageUploadTarget.value = null
    productionMediaUploading.value = false
  }
}

function openCanvasReferenceUpload() {
  canvasChatMenu.value = ''
  closeCanvasInlineMentionMenu()
  canvasReferenceInput.value?.click()
}

async function handleCanvasReferenceUpload(event) {
  const files = [...(event.target.files || [])]
  event.target.value = ''
  if (!files.length || canvasReferenceUploading.value) return
  await addCanvasReferenceFiles(files)
}

async function addCanvasReferenceFiles(files) {
  if (!files.length || canvasReferenceUploading.value) return
  canvasReferenceUploading.value = true

  try {
    for (const file of files) {
      const uploaded = await uploadAPI.image(file)
      const index = productionAssets.value.media.length
      const asset = {
        name: file.name.replace(/\.[^.]+$/, '') || `Referência ${index + 1}`,
        type: 'Mídia',
        status: 'Carregado',
        images: 1,
        blank: false,
        imageUrl: uploaded.path,
        localPath: uploaded.path,
      }
      productionAssets.value.media.push(asset)
      canvasNodePositions.value = {
        ...canvasNodePositions.value,
        [canvasNodeKey('media', index)]: defaultCanvasNodePosition('media', index),
      }
      insertCanvasMention(canvasMentionItem('media', asset, index))
    }

    await persistAgentState('production_assets_ready', true).catch(() => {})
    toast.success(files.length === 1 ? 'Imagem de referência adicionada' : 'Imagens de referência adicionadas')
  } catch (error) {
    toast.error(error.message || 'Não foi possível adicionar a referência')
  } finally {
    canvasReferenceUploading.value = false
  }
}

function handleCanvasAssetImageDragStart(event, type, index) {
  const item = productionAssets.value[type]?.[index]
  if (!item) return
  const mention = canvasMentionItem(type, item, index)
  event.dataTransfer?.setData('text/x-huobao-canvas-reference', '1')
  event.dataTransfer?.setData('application/json', JSON.stringify(mention))
  event.dataTransfer?.setData('text/plain', mention.name)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copyMove'
    event.dataTransfer.dropEffect = 'copy'
  }
  canvasPromptDraggingReference.value = true
  updateCanvasReferenceDragPreview(event, mention)
  window.addEventListener('dragover', handleCanvasReferenceWindowDragOver)
}

function handleCanvasReferenceDropOver(event) {
  if (event.dataTransfer) event.dataTransfer.dropEffect = hasImageFiles(event.dataTransfer) ? 'copy' : 'move'
}

async function handleCanvasReferenceDrop(event) {
  canvasIgnoreNextBoardClick.value = true
  const raw = event.dataTransfer?.getData('application/json')
  if (raw) {
    try {
      const item = JSON.parse(raw)
      if (item?.name && canvasGenerationChatOpen.value) insertCanvasMention(item)
    } catch {}
    handleCanvasReferenceDragEnd()
    return
  }
  const files = imageFilesFromDataTransfer(event.dataTransfer)
  if (files.length) {
    await addCanvasReferenceFiles(files)
    handleCanvasReferenceDragEnd()
  }
}

function imageFilesFromDataTransfer(dataTransfer) {
  if (dataTransfer?.getData?.('text/x-huobao-canvas-reference')) return []
  return [...(dataTransfer?.files || [])].filter(file => String(file.type || '').startsWith('image/'))
}

function hasImageFiles(dataTransfer) {
  return imageFilesFromDataTransfer(dataTransfer).length > 0
}

function isCanvasImageAsset(type) {
  return type === 'media' || type === 'objects'
}

function isUploadableCanvasImageType(type) {
  return isCanvasImageAsset(type) || type === 'roles' || type === 'scenes'
}

function isCanvasImageUploading(type, index) {
  const target = canvasImageUploadTarget.value
  return productionMediaUploading.value && target?.type === type && target?.index === index
}

function isCanvasImageGenerating(type, index) {
  return Boolean(canvasImageGeneratingTargets.value[canvasNodeKey(type, index)])
}

function setCanvasImageGenerating(type, index, value) {
  const key = canvasNodeKey(type, index)
  const next = { ...canvasImageGeneratingTargets.value }
  if (value) next[key] = true
  else delete next[key]
  canvasImageGeneratingTargets.value = next
}

function openCanvasImageUpload(type, index) {
  if (!isUploadableCanvasImageType(type)) return
  focusedCanvasImageAssetKey.value = canvasNodeKey(type, index)
  canvasImageUploadTarget.value = { type, index }
  productionMediaInput.value?.click()
}

function cancelCanvasImageUpload() {
  canvasImageUploadTarget.value = null
}

function isCanvasImageControlsVisible(type, index) {
  const key = canvasNodeKey(type, index)
  const draggingThisNode = canvasDragMoved.value && canvasDragState.value?.key === key
  return focusedCanvasImageAssetKey.value === key && !draggingThisNode && !mediaAssetLibraryOpen.value
}

function mediaLibraryAssetSource(asset) {
  return productionAssetImageSource(asset)
}

function mediaLibraryAssetKey(asset, index) {
  return String(asset?.id || mediaLibraryAssetSource(asset) || `media-${index}`)
}

function mediaLibraryAssetName(asset, index) {
  const prompt = String(asset?.name || asset?.imageType || asset?.image_type || asset?.prompt || '').trim()
  return prompt ? prompt.slice(0, 42) : `Imagem ${index + 1}`
}

function closeCanvasMediaLibrary() {
  mediaAssetLibraryOpen.value = false
  mediaAssetLibraryLoading.value = false
  mediaAssetLibraryItems.value = []
  selectedMediaLibraryAssetKey.value = ''
  selectedMediaLibraryAssetKeys.value = []
  mediaLibraryBulkSelect.value = false
  mediaLibraryDeleting.value = false
  canvasImageLibraryTarget.value = null
}

async function openCanvasImageLibrary(type, index) {
  if (!isUploadableCanvasImageType(type)) return
  focusedCanvasImageAssetKey.value = canvasNodeKey(type, index)
  canvasImageLibraryTarget.value = { type, index }
  activeProductionTab.value = 'media'
  productionLibraryOpen.value = false
  mediaAssetLibraryOpen.value = true
  mediaAssetLibraryLoading.value = true
  selectedMediaLibraryAssetKey.value = ''
  selectedMediaLibraryAssetKeys.value = []
  mediaLibraryBulkSelect.value = false
  mediaLibraryDeleting.value = false
  addNodeMenuOpen.value = false
  screenHelpOpen.value = false

  try {
    const generated = await imageAPI.list({
      drama_id: currentProjectId.value || undefined,
      status: 'completed',
      page_size: 120,
    })
    const combined = [...productionAssets.value.media, ...(generated || [])]
    const seen = new Set()
    mediaAssetLibraryItems.value = combined.filter(asset => {
      const source = mediaLibraryAssetSource(asset)
      if (!source || seen.has(source)) return false
      seen.add(source)
      return true
    })
  } catch (error) {
    toast.error(error.message || 'Não foi possível carregar a biblioteca de imagens')
    mediaAssetLibraryItems.value = productionAssets.value.media.filter(asset => mediaLibraryAssetSource(asset))
  } finally {
    mediaAssetLibraryLoading.value = false
  }
}

function selectMediaLibraryAsset(asset, index) {
  const key = mediaLibraryAssetKey(asset, index)
  if (mediaLibraryBulkSelect.value) {
    selectedMediaLibraryAssetKeys.value = selectedMediaLibraryAssetKeys.value.includes(key)
      ? selectedMediaLibraryAssetKeys.value.filter(item => item !== key)
      : [...selectedMediaLibraryAssetKeys.value, key]
    return
  }
  selectedMediaLibraryAssetKey.value = key
}

function toggleMediaLibraryBulkSelect() {
  mediaLibraryBulkSelect.value = !mediaLibraryBulkSelect.value
  selectedMediaLibraryAssetKeys.value = []
  if (mediaLibraryBulkSelect.value) selectedMediaLibraryAssetKey.value = ''
}

function isMediaLibraryAssetBulkSelected(asset, index) {
  return selectedMediaLibraryAssetKeys.value.includes(mediaLibraryAssetKey(asset, index))
}

async function deleteSelectedMediaLibraryAssets() {
  if (!selectedMediaLibraryAssetKeys.value.length || mediaLibraryDeleting.value) return
  mediaLibraryDeleting.value = true
  const selectedKeys = new Set(selectedMediaLibraryAssetKeys.value)
  const selectedAssets = mediaAssetLibraryItems.value.filter((asset, index) => selectedKeys.has(mediaLibraryAssetKey(asset, index)))
  const selectedSources = new Set(selectedAssets.map(mediaLibraryAssetSource).filter(Boolean))

  try {
    const generatedIds = selectedAssets
      .map(asset => Number(asset?.id || 0))
      .filter(id => Number.isFinite(id) && id > 0)
    await Promise.all(generatedIds.map(id => imageAPI.del(id).catch(() => null)))

    mediaAssetLibraryItems.value = mediaAssetLibraryItems.value.filter((asset, index) => !selectedKeys.has(mediaLibraryAssetKey(asset, index)))
    productionAssets.value.media = productionAssets.value.media.filter(asset => !selectedSources.has(productionAssetImageSource(asset)))
    for (const listKey of ['roles', 'scenes', 'objects']) {
      productionAssets.value[listKey] = productionAssets.value[listKey].map(asset => selectedSources.has(productionAssetImageSource(asset))
        ? { ...asset, imageUrl: '', image_url: '', localPath: '', local_path: '', status: asset.status === 'Carregado' ? 'A definir' : asset.status }
        : asset)
    }

    selectedMediaLibraryAssetKeys.value = []
    await persistAgentState('production_assets_ready', true).catch(() => {})
    toast.success(selectedAssets.length === 1 ? 'Imagem apagada' : `${selectedAssets.length} imagens apagadas`)
  } catch (error) {
    toast.error(error.message || 'Não foi possível apagar as imagens')
  } finally {
    mediaLibraryDeleting.value = false
  }
}

async function confirmCanvasMediaLibrarySelection() {
  const target = canvasImageLibraryTarget.value
  if (!selectedMediaLibraryAssetKey.value || !isUploadableCanvasImageType(target?.type) || !Number.isInteger(target?.index)) return
  const selectedIndex = mediaAssetLibraryItems.value.findIndex((asset, index) => mediaLibraryAssetKey(asset, index) === selectedMediaLibraryAssetKey.value)
  const selected = mediaAssetLibraryItems.value[selectedIndex]
  if (!selected) return

  const targetType = target.type
  const targetIndex = target.index
  const source = mediaLibraryAssetSource(selected)
  productionAssets.value[targetType][targetIndex] = {
    ...productionAssets.value[targetType][targetIndex],
    name: (targetType === 'roles' || targetType === 'scenes')
      ? productionAssets.value[targetType][targetIndex]?.name || mediaLibraryAssetName(selected, selectedIndex)
      : mediaLibraryAssetName(selected, selectedIndex),
    type: targetType === 'objects' ? 'Objeto' : targetType === 'roles' ? 'Role' : targetType === 'scenes' ? 'Cena' : 'Mídia',
    status: 'Carregado',
    images: 1,
    blank: false,
    imageUrl: source,
    localPath: source,
  }
  await persistAgentState('production_assets_ready', true).catch(() => {})
  closeCanvasMediaLibrary()
  focusedCanvasImageAssetKey.value = canvasNodeKey(targetType, targetIndex)
  toast.success(targetType === 'objects' ? 'Imagem adicionada ao objeto' : targetType === 'roles' ? 'Imagem adicionada ao role' : targetType === 'scenes' ? 'Imagem adicionada à cena' : 'Imagem adicionada ao card')
}

function selectProductionLibraryAsset(item, index) {
  const target = canvasImageLibraryTarget.value
  if (isUploadableCanvasImageType(target?.type) && Number.isInteger(target?.index)) {
    const targetIndex = target.index
    productionAssets.value[target.type][targetIndex] = {
      ...productionAssets.value[target.type][targetIndex],
      ...item,
      name: productionAssets.value[target.type][targetIndex]?.name || item.name,
    }
    canvasImageLibraryTarget.value = null
    productionLibraryOpen.value = false
    return
  }
  focusCanvasAsset(item, index)
}

function createProductionNode(type) {
  const target = type === 'image' || type === 'video' || type === 'audio' ? 'media' : type
  if (target === 'text') {
    toast.info('O bloco de texto será criado na tela em uma próxima etapa')
    addNodeMenuOpen.value = false
    return null
  }
  const list = productionAssets.value[target]
  if (!Array.isArray(list)) return null
  const nextIndex = list.length
  const name = target === 'roles' ? 'Unnamed role' : target === 'scenes' ? 'Unnamed scene' : target === 'objects' ? 'Novo ativo' : 'Novo material'
  list.push({ name, status: target === 'roles' ? 'A definir' : 'A ser adicionado', images: 1, blank: true })
  canvasNodePositions.value = { ...canvasNodePositions.value, [canvasNodeKey(target, nextIndex)]: defaultCanvasNodePosition(target, nextIndex) }
  activeProductionTab.value = target
  addNodeMenuOpen.value = false
  persistAgentState('production_assets_ready', true).catch(() => {})
  focusCanvasAsset(list[nextIndex], nextIndex)
  return nextIndex
}

function createConnectedProductionNode(type, sourceIndex, side = 'right') {
  const target = type === 'image' || type === 'video' || type === 'audio' ? 'media' : type
  const list = productionAssets.value[target]
  if (!Array.isArray(list) || !list[sourceIndex]) {
    createProductionNode(type)
    return
  }

  const nextIndex = list.length
  createProductionNode(type)

  const sourceKey = canvasNodeKey(target, sourceIndex)
  const targetKey = canvasNodeKey(target, nextIndex)
  const sourcePosition = canvasNodePosition(target, sourceIndex)
  const sourceSize = canvasNodeSize(target, sourceIndex)
  const targetSize = canvasNodeSize(target, nextIndex)
  const gap = target === 'scenes' ? 32 : 48
  const verticalStep = target === 'scenes' ? 72 : 0
  const direction = side === 'left' ? -1 : 1
  const nextPosition = {
    x: Math.round(sourcePosition.x + direction * (sourceSize.width + gap)),
    y: Math.round(sourcePosition.y + (target === 'scenes' ? ((nextIndex % 2 === 0 ? -1 : 1) * verticalStep) : 0)),
  }

  if (side === 'left') nextPosition.x = Math.round(sourcePosition.x - targetSize.width - gap)
  canvasNodePositions.value = { ...canvasNodePositions.value, [targetKey]: nextPosition }

  const connection = side === 'left'
    ? { from: targetKey, to: sourceKey }
    : { from: sourceKey, to: targetKey }
  const exists = canvasConnections.value.some(item =>
    (item.from === connection.from && item.to === connection.to) ||
    (item.from === connection.to && item.to === connection.from),
  )
  if (!exists) canvasConnections.value = [...canvasConnections.value, connection]
}

function enterProductionAssetSelection() {
  productionAssetSelectionActive.value = true
  selectedProductionAssetKeys.value = []
}

function exitProductionAssetSelection() {
  productionAssetSelectionActive.value = false
  selectedProductionAssetKeys.value = []
}

function isProductionAssetSelected(item, index) {
  return selectedProductionAssetKeys.value.includes(productionAssetKey(item, index))
}

function toggleProductionAssetSelection(item, index) {
  if (!productionAssetSelectionActive.value) return
  const key = productionAssetKey(item, index)
  selectedProductionAssetKeys.value = selectedProductionAssetKeys.value.includes(key)
    ? selectedProductionAssetKeys.value.filter(itemKey => itemKey !== key)
    : [...selectedProductionAssetKeys.value, key]
}

function toggleAllProductionAssets() {
  selectedProductionAssetKeys.value = allActiveProductionAssetsSelected.value ? [] : [...activeProductionAssetKeys.value]
}

function productionAssetTypeLabel(tab = activeProductionTab.value) {
  if (tab === 'roles') return 'personagem'
  if (tab === 'scenes') return 'cena'
  if (tab === 'objects') return 'objeto'
  return 'mídia'
}

function hasChineseText(value) {
  return /[\u3400-\u9fff]/.test(String(value || ''))
}

function productionAssetStatusLabel(item, type = activeProductionTab.value) {
  const raw = String(item?.status || '').trim()
  if (!raw || hasChineseText(raw)) return type === 'scenes' ? 'A ser adicionado' : 'A definir'
  return raw
}

function roleAppearanceName(item) {
  const name = String(item?.name || 'Role').trim() || 'Role'
  return String(item?.appearanceName || item?.appearance_name || item?.visualName || item?.visual_name || item?.description || `${name}-Base Image`).trim()
}

function isDetailedCharacterPrompt(value) {
  const text = String(value || '').trim()
  return text.length >= 260 && /(corpo inteiro|vis[aã]o frontal|ambos os p[eé]s|rosto|cabelo|figurino|postura)/i.test(text)
}

function isGenericRolePrompt(value, item) {
  const text = String(value || '').trim()
  const name = String(item?.name || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return /^base image(?:-base image)?$/i.test(text)
    || (!!name && new RegExp(`^${name}-Base Image(?:-Base Image)?$`, 'i').test(text))
}

function roleCharacterPrompt(item) {
  const name = String(item?.name || 'personagem').trim() || 'personagem'
  const roleType = String(item?.type || (item?.main ? 'protagonista' : 'personagem')).trim()
  const source = String(item?.description || item?.appearanceName || item?.appearance_name || item?.visualName || item?.visual_name || '').trim()
  if (isDetailedCharacterPrompt(source)) return source

  const identity = [name, roleType && !/^role$/i.test(roleType) ? roleType : '', source].filter(Boolean).join(', ')
  return [
    'Retrato de corpo inteiro com visão frontal horizontal, incluindo completamente ambos os pés.',
    `${identity || 'Um personagem dramático'} está em pé com postura natural e firme, olhando diretamente para frente com expressão consistente com sua função na história.`,
    'Descreva a identidade visual do personagem com rosto bem definido, formato do rosto, olhos, pele, cabelo, idade aproximada, silhueta corporal e presença cênica clara.',
    'O figurino deve ser coerente com o universo do roteiro, com tecidos, cortes, camadas, cores, acessórios e marcas de uso visíveis em detalhes realistas.',
    'As mãos devem permanecer visíveis e naturais, sem objetos extras não mencionados. A iluminação deve revelar textura de pele, cabelo e roupa, mantendo fundo simples e neutro para referência de personagem.',
    `Estilo ${selectedStyleItem.value?.label || 'cinematográfico realista'}, aspect ratio ${canvasChatRatioDisplay.value}.`,
  ].filter(Boolean).join(' ')
}

function parseAIConfigModel(raw) {
  if (!raw) return ''
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? String(parsed[0] || '') : String(parsed || '')
  } catch {
    return String(raw)
  }
}

function isKnownNonImageAIConfig(config) {
  const provider = String(config?.provider || '').toLowerCase()
  const model = parseAIConfigModel(config?.model).toLowerCase()
  return provider === 'huggingface' && /\b(?:wan|i2v|t2v|video)\b/.test(model)
}

async function loadImageAIConfigs() {
  try {
    const [imageConfigs, allConfigs] = await Promise.all([
      aiConfigAPI.list('image'),
      aiConfigAPI.list(),
    ])
    const codexConfigs = (allConfigs || []).filter(config => String(config.provider || '').toLowerCase() === 'openai-codex')
    const byId = new Map([...imageConfigs, ...codexConfigs].map(config => [config.id, config]))
    imageAIConfigs.value = [...byId.values()]
    if (!canvasImageModelOptions.value.some(model => model.key === selectedCanvasImageModelKey.value) && canvasImageModelOptions.value[0]) {
      selectedCanvasImageModelKey.value = canvasImageModelOptions.value[0].key
    }
  } catch {
    imageAIConfigs.value = []
  }
}

function canvasAssetPrompt(type, item) {
  if (type === 'scenes') {
    return String(item?.prompt || item?.visualPrompt || item?.visual_prompt || item?.description || item?.name || '').trim()
  }
  if (type === 'roles') {
    const explicitPrompt = String(item?.prompt || item?.visualPrompt || item?.visual_prompt || '').trim()
    return isGenericRolePrompt(explicitPrompt, item) ? roleCharacterPrompt(item) : String(explicitPrompt || roleCharacterPrompt(item)).trim()
  }
  return String(item?.prompt || item?.visualPrompt || item?.visual_prompt || roleAppearanceName(item) || item?.description || item?.name || '').trim()
}

function isCanvasMentionBoundaryCharacter(character) {
  return !character || !/[\p{L}\p{N}_-]/u.test(character)
}

function findCanvasMentionIndex(prompt, item) {
  const name = String(item?.name || '').trim()
  if (name.length < 2) return -1
  if (item.type === 'roles' || item.type === 'scenes') {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = prompt.match(new RegExp(`(^|[^\\p{L}\\p{N}_-])(${escaped})(?=$|[^\\p{L}\\p{N}_-])`, 'iu'))
    return match?.index == null ? -1 : match.index + (match[1] ? match[1].length : 0)
  }
  return prompt.indexOf(name)
}

function inferCanvasPromptMentionRanges(prompt) {
  const value = String(prompt || '')
  if (!value.trim()) return []
  const occupied = []
  return allCanvasMentionItems.value
    .filter(item => String(item.name || '').trim().length >= 2)
    .sort((a, b) => String(b.name || '').length - String(a.name || '').length)
    .map(item => {
      const start = findCanvasMentionIndex(value, item)
      if (start < 0) return null
      const name = String(item.name || '').trim()
      const end = start + name.length
      if (!isCanvasMentionBoundaryCharacter(value[start - 1]) && item.type !== 'media') return null
      if (!isCanvasMentionBoundaryCharacter(value[end]) && item.type !== 'media') return null
      if (occupied.some(range => start < range.end && end > range.start)) return null
      occupied.push({ start, end })
      return {
        start,
        end,
        name,
        type: item.type || 'media',
        source: item.source || '',
        mentionId: `mention-${++canvasMentionIdSeed}`,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start)
}

function generatedCanvasPrompt(type, item) {
  if (type === 'scenes') {
    return [
      item?.name || 'Cena',
      item?.description || 'locação cinematográfica detalhada',
      `estilo ${selectedStyleItem.value?.label || 'cinematográfico realista'}`,
      `aspect ratio ${canvasChatRatioDisplay.value}`,
      'alta qualidade, composição clara, iluminação dramática',
    ].filter(Boolean).join(', ')
  }
  if (type === 'objects') {
    return [
      item?.name || 'Objeto',
      item?.description || 'objeto cinematográfico detalhado',
      `estilo ${selectedStyleItem.value?.label || 'cinematográfico realista'}`,
      `aspect ratio ${canvasChatRatioDisplay.value}`,
      'alta qualidade, produto isolado, materiais e textura bem definidos',
    ].filter(Boolean).join(', ')
  }
  return [
    roleCharacterPrompt(item),
  ].filter(Boolean).join(', ')
}

function openCanvasGenerationChat(type, index) {
  const item = productionAssets.value[type]?.[index]
  if (!item) return
  canvasGenerationTarget.value = { type, index }
  canvasGenerationPrompt.value = canvasAssetPrompt(type, item)
  const savedRanges = Array.isArray(item.canvasPromptMentionRanges)
    ? item.canvasPromptMentionRanges.map(range => ({ ...range }))
    : []
  canvasPromptMentionRanges.value = savedRanges.length
    ? savedRanges
    : inferCanvasPromptMentionRanges(canvasGenerationPrompt.value)
  if (!savedRanges.length && canvasPromptMentionRanges.value.length) {
    item.canvasPromptMentionRanges = canvasPromptMentionRanges.value.map(range => ({ ...range }))
    persistAgentState('production_assets_ready', true).catch(() => {})
  }
  canvasGenerationChatOpen.value = true
  canvasChatMenu.value = ''
  expandedCanvasMentionGroup.value = ''
  const nodeKey = canvasNodeKey(type, index)
  bringCanvasNodeToFront(nodeKey)
  nextTick(() => {
    syncCanvasPromptEditor()
    window.requestAnimationFrame(() => {
      canvasGeometryRevision.value += 1
      window.requestAnimationFrame(() => {
        focusCanvasGenerationChatInView()
        canvasChatPromptInput.value?.focus({ preventScroll: true })
      })
    })
  })
}

function closeCanvasGenerationChat() {
  canvasGenerationChatOpen.value = false
  canvasGenerationTarget.value = null
  canvasGenerationPrompt.value = ''
  canvasPromptMentionRanges.value = []
  canvasPromptMentionChips.value = []
  canvasChatMenu.value = ''
  expandedCanvasMentionGroup.value = ''
  closeCanvasInlineMentionMenu()
  activeCanvasReferenceOccurrenceKey.value = ''
  clearCanvasReferenceOccurrenceSelection()
  canvasMentionPreview.value = null
}

function handleCanvasViewportScroll() {
  canvasNodeContextMenu.value = { open: false, x: 0, y: 0, type: '', index: -1 }
  closeCanvasInlineMentionMenu()
  canvasGeometryRevision.value += 1
}

function focusCanvasGenerationChatInView() {
  const viewport = canvasViewportRef.value
  if (!viewport || canvasChatExpanded.value) return
  const chat = viewport.querySelector?.('.canvas-generation-chat')
  if (!chat) return
  const safeLeft = 88
  const safeRight = 16
  const safeTop = 86
  const safeBottom = 92
  const viewportRect = viewport.getBoundingClientRect()
  const chatRect = chat.getBoundingClientRect()
  let deltaX = 0
  let deltaY = 0
  if (chatRect.left < viewportRect.left + safeLeft) {
    deltaX = chatRect.left - viewportRect.left - safeLeft
  } else if (chatRect.right > viewportRect.right - safeRight) {
    deltaX = chatRect.right - viewportRect.right + safeRight
  }
  const visibleTop = Math.max(viewportRect.top, safeTop)
  if (chatRect.top < visibleTop) {
    deltaY = chatRect.top - visibleTop
  } else if (chatRect.bottom > viewportRect.bottom - safeBottom) {
    deltaY = chatRect.bottom - viewportRect.bottom + safeBottom
  }
  if (deltaX || deltaY) {
    viewport.scrollBy({ left: deltaX, top: deltaY, behavior: 'auto' })
    window.requestAnimationFrame(() => {
      canvasGeometryRevision.value += 1
    })
  }
}

function toggleCanvasChatMenu(menu) {
  closeCanvasInlineMentionMenu()
  canvasChatMenu.value = canvasChatMenu.value === menu ? '' : menu
  if (canvasChatMenu.value !== 'mention') expandedCanvasMentionGroup.value = ''
}

function toggleCanvasMentionGroup(group) {
  expandedCanvasMentionGroup.value = expandedCanvasMentionGroup.value === group ? '' : group
}

function openCanvasMentionGroup(group) {
  expandedCanvasMentionGroup.value = group
}

function closeCanvasInlineMentionMenu() {
  canvasInlineMentionMenu.value = { open: false, x: 0, y: 0, query: '', range: null }
  activeCanvasInlineMentionKey.value = ''
}

function canvasMentionRangeAtCaret() {
  const editor = canvasChatPromptInput.value
  const selection = window.getSelection()
  if (!editor || !selection?.rangeCount || !selection.isCollapsed) return null
  const range = selection.getRangeAt(0)
  if (!editor.contains(range.commonAncestorContainer)) return null
  const node = selection.anchorNode
  const offset = selection.anchorOffset
  if (!node || node.nodeType !== Node.TEXT_NODE) return null
  const textBeforeCaret = String(node.textContent || '').slice(0, offset)
  const match = textBeforeCaret.match(/(^|\s)@([^\s@]*)$/)
  if (!match) return null
  const query = match[2] || ''
  const start = offset - query.length - 1
  const mentionRange = document.createRange()
  mentionRange.setStart(node, start)
  mentionRange.setEnd(node, offset)
  return { range: mentionRange, query }
}

function canvasMentionMenuHeight(query) {
  const normalizedQuery = String(query || '').trim().toLowerCase()
  const itemCount = normalizedQuery
    ? allCanvasMentionItems.value.filter(item => String(item.name || '').toLowerCase().includes(normalizedQuery)).slice(0, 12).length
    : canvasMentionQuickItems.value.length + canvasMentionGroups.value.length
  const rows = Math.max(1, itemCount)
  return Math.min(390, 48 + (rows * 48) + 28)
}

function canvasMentionMenuPosition(range, query = '') {
  const editor = canvasChatPromptInput.value
  let rect = range.getBoundingClientRect()
  if (!rect.width && !rect.height) {
    const probe = range.cloneRange()
    probe.collapse(false)
    const probeRects = probe.getClientRects()
    rect = probeRects[probeRects.length - 1] || rect
  }
  if (!rect.width && !rect.height) {
    const rects = range.getClientRects()
    rect = rects[rects.length - 1] || rect
  }
  if ((!rect.width && !rect.height) && editor) rect = editor.getBoundingClientRect()
  const menuWidth = 250
  const menuHeight = canvasMentionMenuHeight(query)
  const margin = 12
  const x = Math.min(window.innerWidth - menuWidth - margin, Math.max(margin, rect.left))
  const yBelow = rect.bottom + 6
  const y = yBelow + menuHeight > window.innerHeight - margin
    ? Math.max(margin, rect.top - menuHeight - 6)
    : yBelow
  return { x, y }
}

function handleCanvasInlineMentionScroll(event) {
  if (!canvasInlineMentionMenu.value.open) return
  if (event?.target instanceof Element && event.target.closest?.('.canvas-inline-mention-menu')) return
  closeCanvasInlineMentionMenu()
}

function updateCanvasInlineMentionMenu(event = null) {
  if (event?.key && ['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(event.key)) return
  const match = canvasMentionRangeAtCaret()
  if (!match) {
    closeCanvasInlineMentionMenu()
    return
  }
  const wasOpen = canvasInlineMentionMenu.value.open
  const position = canvasMentionMenuPosition(match.range, match.query)
  canvasChatMenu.value = ''
  activeCanvasReferenceOccurrenceKey.value = ''
  clearCanvasReferenceOccurrenceSelection()
  if (!wasOpen) expandedCanvasMentionGroup.value = ''
  canvasInlineMentionMenu.value = {
    open: true,
    x: position.x,
    y: position.y,
    query: match.query,
    range: match.range,
  }
  nextTick(() => {
    const firstItem = canvasInlineMentionVisibleItems.value[0]
    activeCanvasInlineMentionKey.value = firstItem?.key || ''
  })
}

function handleCanvasPromptKeydown(event) {
  if (!canvasInlineMentionMenu.value.open) return
  const items = canvasInlineMentionVisibleItems.value
  const currentIndex = Math.max(0, items.findIndex(item => item.key === activeCanvasInlineMentionKey.value))
  if (event.key === 'Escape') {
    event.preventDefault()
    closeCanvasInlineMentionMenu()
    return
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!items.length) return
    const direction = event.key === 'ArrowDown' ? 1 : -1
    const nextIndex = (currentIndex + direction + items.length) % items.length
    activeCanvasInlineMentionKey.value = items[nextIndex].key
    return
  }
  if (event.key === 'Enter' || event.key === 'Tab') {
    const item = items.find(option => option.key === activeCanvasInlineMentionKey.value) || items[0]
    if (!item) return
    event.preventDefault()
    insertCanvasInlineMention(item)
  }
}

function handleCanvasGenerationChatClick(event) {
  const target = event.target
  if (!(target instanceof Element)) return
  if (target.closest('.canvas-chat-popover')) return
  if (target.closest('.canvas-chat-toolbar button')) return
  closeCanvasInlineMentionMenu()
  canvasChatMenu.value = ''
  expandedCanvasMentionGroup.value = ''
  activeCanvasReferenceOccurrenceKey.value = ''
  clearCanvasReferenceOccurrenceSelection()
}

function readCanvasPromptEditor() {
  const editor = canvasChatPromptInput.value
  if (!editor) return canvasGenerationPrompt.value
  const mentions = []
  let prompt = ''
  for (const node of editor.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      prompt += node.textContent || ''
      continue
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue
    const element = node
    const mentionName = String(element.dataset?.mentionName || element.textContent || '').trim()
    if (!mentionName) continue
    if (prompt && !/\s$/.test(prompt)) prompt += ' '
    const start = prompt.length
    prompt += mentionName
    mentions.push({
      start,
      end: prompt.length,
      name: mentionName,
      type: element.dataset?.mentionType || 'media',
      source: element.dataset?.mentionSource || '',
      mentionId: element.dataset?.mentionId || '',
    })
    prompt += ' '
  }
  const leadingSpace = prompt.match(/^\s*/)?.[0]?.length || 0
  prompt = prompt.trim()
  canvasPromptMentionRanges.value = mentions
    .map(mention => ({
      ...mention,
      start: mention.start - leadingSpace,
      end: mention.end - leadingSpace,
    }))
    .filter(mention => mention.start >= 0 && mention.end <= prompt.length)
  updateCanvasPromptMentionChips()
  return prompt
}

function renderCanvasPromptEditorValue(text) {
  const editor = canvasChatPromptInput.value
  if (!editor) return
  editor.replaceChildren()
  const value = String(text || '')
  if (!value) {
    updateCanvasPromptMentionChips()
    return
  }
  const ranges = [...canvasPromptMentionRanges.value]
    .filter(range => range.start >= 0 && range.end > range.start && value.slice(range.start, range.end) === range.name)
    .sort((a, b) => a.start - b.start)
    .reduce((valid, range) => {
      const previous = valid[valid.length - 1]
      if (previous && range.start < previous.end) return valid
      valid.push(range)
      return valid
    }, [])
  if (!ranges.length) {
    editor.appendChild(document.createTextNode(value))
    updateCanvasPromptMentionChips()
    return
  }
  let position = 0
  for (const range of ranges) {
    if (range.start > position) editor.appendChild(document.createTextNode(value.slice(position, range.start)))
    editor.appendChild(buildCanvasMentionChip(range))
    position = range.end
  }
  if (position < value.length) editor.appendChild(document.createTextNode(value.slice(position)))
  updateCanvasPromptMentionChips()
}

function syncCanvasPromptEditor() {
  renderCanvasPromptEditorValue(canvasGenerationPrompt.value || '')
  const target = canvasGenerationTarget.value
  const item = target ? productionAssets.value[target.type]?.[target.index] : null
  if (item) item.canvasPromptMentionRanges = canvasPromptMentionRanges.value.map(range => ({ ...range }))
}

function placeCaretAtEnd(element) {
  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(false)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function insertNodeAtEditorCursor(node) {
  const editor = canvasChatPromptInput.value
  if (!editor) return
  editor.focus()
  const selection = window.getSelection()
  let range = selection?.rangeCount ? selection.getRangeAt(0) : null
  if (!range || !editor.contains(range.commonAncestorContainer)) {
    range = document.createRange()
    range.selectNodeContents(editor)
    range.collapse(false)
  }
  range.deleteContents()
  range.insertNode(node)
  const spacer = document.createTextNode(' ')
  node.after(spacer)
  range.setStartAfter(spacer)
  range.collapse(true)
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function insertNodeAtEditorRange(node, range) {
  if (!range) {
    insertNodeAtEditorCursor(node)
    return
  }
  range.deleteContents()
  range.insertNode(node)
  const spacer = document.createTextNode(' ')
  node.after(spacer)
  range.setStartAfter(spacer)
  range.collapse(true)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function buildCanvasMentionChip(item) {
  const chip = document.createElement('span')
  chip.className = `canvas-prompt-mention-chip ${item.source ? 'has-preview-image' : 'no-preview-image'}`
  chip.contentEditable = 'false'
  chip.dataset.mentionName = item.name
  chip.dataset.mentionType = item.type || 'media'
  chip.dataset.mentionSource = item.source || ''
  chip.dataset.mentionId = item.mentionId || `mention-${++canvasMentionIdSeed}`
  if (item.source) {
    const image = document.createElement('img')
    image.src = item.source
    image.alt = ''
    image.draggable = false
    chip.appendChild(image)
  }
  const label = document.createElement('span')
  label.textContent = item.name
  chip.appendChild(label)
  chip.addEventListener('mouseenter', () => showCanvasMentionPreview(item, chip))
  chip.addEventListener('mouseleave', hideCanvasMentionPreview)
  return chip
}

function updateCanvasPromptMentionChips() {
  const editor = canvasChatPromptInput.value
  if (!editor) {
    canvasPromptMentionChips.value = []
    return
  }
  const byKey = new Map()
  Array.from(editor.querySelectorAll('.canvas-prompt-mention-chip'))
    .map((chip, index) => {
      if (!chip.dataset.mentionId) chip.dataset.mentionId = `mention-${++canvasMentionIdSeed}`
      
      const mentionKey = chip.dataset.mentionKey
      let name = chip.dataset.mentionName || chip.textContent || ''
      let source = chip.dataset.mentionSource || ''
      let type = chip.dataset.mentionType || 'media'

      if (mentionKey) {
        const parts = mentionKey.split(':')
        const kType = parts[0]
        const kIndex = parseInt(parts[1])
        if (productionAssets.value[kType] && productionAssets.value[kType][kIndex]) {
          const dynamicItem = canvasMentionItem(kType, productionAssets.value[kType][kIndex], kIndex)
          name = dynamicItem.name
          source = dynamicItem.source || ''
          type = dynamicItem.type
          
          chip.dataset.mentionName = name
          chip.dataset.mentionSource = source
          if (chip.textContent !== `@${name}`) {
            chip.textContent = `@${name}`
          }
        }
      }

      return {
        key: mentionKey || `${type}:${name}`,
        id: chip.dataset.mentionId,
        name,
        type,
        source,
        label: `${index + 1}ª menção`,
      }
    })
    .filter(chip => chip.name)
    .forEach(chip => {
      const existing = byKey.get(chip.key)
      if (existing) {
        existing.count += 1
        existing.occurrences.push({ id: chip.id, label: `${existing.count}ª menção` })
      } else {
        byKey.set(chip.key, { ...chip, count: 1, occurrences: [{ id: chip.id, label: '1ª menção' }] })
      }
    })
  const chips = Array.from(byKey.values())
  const countsByType = chips.reduce((counts, chip) => {
    counts[chip.type] = (counts[chip.type] || 0) + 1
    return counts
  }, {})
  canvasPromptMentionChips.value = chips.map(chip => ({
    ...chip,
    typeCount: countsByType[chip.type] || 1,
  }))
}

function removeCanvasPromptMention(targetChip) {
  const editor = canvasChatPromptInput.value
  if (!editor) return
  Array.from(editor.querySelectorAll('.canvas-prompt-mention-chip'))
    .filter(chip =>
      (chip.dataset.mentionName || '') === targetChip.name
      && (chip.dataset.mentionType || 'media') === targetChip.type,
    )
    .forEach(chip => {
      const next = chip.nextSibling
      chip.remove()
      if (next?.nodeType === Node.TEXT_NODE && !String(next.textContent || '').trim()) next.remove()
    })
  activeCanvasReferenceOccurrenceKey.value = ''
  activeCanvasReferenceOccurrenceId.value = ''
  canvasGenerationPrompt.value = readCanvasPromptEditor()
  handleCanvasPromptInput()
}

function openCanvasReferenceOccurrences(key, event = null) {
  if (canvasReferenceOccurrenceCloseTimer) {
    clearTimeout(canvasReferenceOccurrenceCloseTimer)
    canvasReferenceOccurrenceCloseTimer = null
  }
  const trigger = event?.currentTarget
  if (trigger instanceof HTMLElement && trigger.classList.contains('canvas-prompt-reference-count')) {
    const triggerRect = trigger.getBoundingClientRect()
    canvasReferenceOccurrenceMaxHeight.value = Math.max(96, Math.floor(triggerRect.bottom - 12))
  }
  canvasChatMenu.value = ''
  expandedCanvasMentionGroup.value = ''
  activeCanvasReferenceOccurrenceKey.value = key
}

function clearCanvasReferenceOccurrenceSelection() {
  activeCanvasReferenceOccurrenceId.value = ''
  canvasChatPromptInput.value
    ?.querySelectorAll('.canvas-prompt-mention-chip.selected-occurrence')
    .forEach(chip => chip.classList.remove('selected-occurrence'))
}

function closeCanvasReferenceOccurrences(key) {
  if (canvasReferenceOccurrenceCloseTimer) clearTimeout(canvasReferenceOccurrenceCloseTimer)
  canvasReferenceOccurrenceCloseTimer = setTimeout(() => {
    if (activeCanvasReferenceOccurrenceKey.value === key) {
      activeCanvasReferenceOccurrenceKey.value = ''
      clearCanvasReferenceOccurrenceSelection()
    }
    canvasReferenceOccurrenceCloseTimer = null
  }, 180)
}

function selectCanvasPromptMentionOccurrence(mentionId) {
  const editor = canvasChatPromptInput.value
  if (!editor) return
  editor.querySelectorAll('.canvas-prompt-mention-chip.selected-occurrence')
    .forEach(chip => chip.classList.remove('selected-occurrence'))
  const chip = editor.querySelector(`.canvas-prompt-mention-chip[data-mention-id="${mentionId}"]`)
  if (!chip) {
    activeCanvasReferenceOccurrenceId.value = ''
    return
  }
  chip.classList.add('selected-occurrence')
  activeCanvasReferenceOccurrenceId.value = mentionId
  chip.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
}

function removeCanvasPromptMentionOccurrence(mentionId) {
  const editor = canvasChatPromptInput.value
  if (!editor) return
  const chip = editor.querySelector(`.canvas-prompt-mention-chip[data-mention-id="${mentionId}"]`)
  if (!chip) return
  const next = chip.nextSibling
  chip.remove()
  if (activeCanvasReferenceOccurrenceId.value === mentionId) activeCanvasReferenceOccurrenceId.value = ''
  if (next?.nodeType === Node.TEXT_NODE && !String(next.textContent || '').trim()) next.remove()
  canvasGenerationPrompt.value = readCanvasPromptEditor()
  const stillOpen = canvasPromptMentionChips.value.some(item => item.key === activeCanvasReferenceOccurrenceKey.value && item.count > 1)
  if (!stillOpen) activeCanvasReferenceOccurrenceKey.value = ''
  handleCanvasPromptInput()
}

function handleCanvasReferenceDragStart(event, chip) {
  event.dataTransfer?.setData('text/x-huobao-canvas-reference', '1')
  event.dataTransfer?.setData('application/json', JSON.stringify({
    name: chip.name,
    type: chip.type,
    source: chip.source || '',
  }))
  event.dataTransfer?.setData('text/plain', chip.name)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.dropEffect = 'move'
  }
  canvasPromptDraggingReference.value = true
  updateCanvasReferenceDragPreview(event, chip)
  canvasReferenceDragGhost?.remove()
  const ghost = document.createElement('span')
  ghost.className = 'canvas-reference-transparent-drag'
  document.body.appendChild(ghost)
  event.dataTransfer?.setDragImage(ghost, 0, 0)
  canvasReferenceDragGhost = ghost
  window.addEventListener('dragover', handleCanvasReferenceWindowDragOver)
}

function handleCanvasReferenceDragEnd() {
  canvasPromptDraggingReference.value = false
  canvasReferenceDragPreview.value = null
  canvasReferenceDragGhost?.remove()
  canvasReferenceDragGhost = null
  window.removeEventListener('dragover', handleCanvasReferenceWindowDragOver)
}

function updateCanvasReferenceDragPreview(event, chip = canvasReferenceDragPreview.value) {
  if (!chip) return
  canvasReferenceDragPreview.value = {
    name: chip.name,
    type: chip.type,
    source: chip.source || '',
    x: event.clientX + 12,
    y: event.clientY + 12,
  }
}

function handleCanvasReferenceWindowDragOver(event) {
  if (!canvasReferenceDragPreview.value) return
  updateCanvasReferenceDragPreview(event)
}

function canvasDropRangeFromPoint(x, y) {
  if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y)
  const position = document.caretPositionFromPoint?.(x, y)
  if (!position) return null
  const range = document.createRange()
  range.setStart(position.offsetNode, position.offset)
  range.collapse(true)
  return range
}

function handleCanvasPromptDrop(event) {
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  const raw = event.dataTransfer?.getData('application/json')
  if (!raw) {
    const files = imageFilesFromDataTransfer(event.dataTransfer)
    if (files.length) {
      addCanvasReferenceFiles(files).finally(() => handleCanvasReferenceDragEnd())
      return
    }
    return
  }
  let item
  try {
    item = JSON.parse(raw)
  } catch {
    return
  }
  const editor = canvasChatPromptInput.value
  if (!editor || !item?.name) return
  editor.focus()
  const range = canvasDropRangeFromPoint(event.clientX, event.clientY)
  if (range && !editor.contains(range.commonAncestorContainer)) {
    handleCanvasReferenceDragEnd()
    return
  }
  insertNodeAtEditorRange(buildCanvasMentionChip(item), range)
  canvasGenerationPrompt.value = readCanvasPromptEditor()
  handleCanvasPromptInput()
  handleCanvasReferenceDragEnd()
}

function handleCanvasPromptDragOver(event) {
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  canvasPromptDraggingReference.value = true
  if (canvasReferenceDragPreview.value) updateCanvasReferenceDragPreview(event)
  const editor = canvasChatPromptInput.value
  const range = canvasDropRangeFromPoint(event.clientX, event.clientY)
  if (!editor || !range || !editor.contains(range.commonAncestorContainer)) return
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function handleCanvasPromptDragLeave(event) {
  const editor = canvasChatPromptInput.value
  const nextTarget = event.relatedTarget
  if (editor && nextTarget instanceof Node && editor.contains(nextTarget)) return
  canvasPromptDraggingReference.value = false
}

function showCanvasMentionPreview(item, chip) {
  const rect = chip.getBoundingClientRect()
  const cardWidth = 220
  const cardHeight = 82
  const margin = 14
  const centeredLeft = rect.left + rect.width / 2
  const left = Math.min(window.innerWidth - cardWidth / 2 - margin, Math.max(cardWidth / 2 + margin, centeredLeft))
  const preferredTop = rect.bottom + 10
  const top = preferredTop + cardHeight + margin > window.innerHeight
    ? Math.max(margin, rect.top - cardHeight - 10)
    : preferredTop
  canvasMentionPreview.value = {
    name: item.name,
    type: item.type,
    source: item.source || '',
    x: left,
    y: top,
  }
}

function hideCanvasMentionPreview() {
  canvasMentionPreview.value = null
}

function handleCanvasPromptMentionHover(event) {
  const target = event.target
  if (!(target instanceof Element)) return
  const chip = target.closest('.canvas-prompt-mention-chip')
  if (!chip || !canvasChatPromptInput.value?.contains(chip)) return
  showCanvasMentionPreview({
    name: chip.dataset.mentionName || chip.textContent || '',
    type: chip.dataset.mentionType || 'media',
    source: chip.dataset.mentionSource || '',
  }, chip)
}

function handleCanvasPromptMentionOut(event) {
  const target = event.target
  if (!(target instanceof Element)) return
  const chip = target.closest('.canvas-prompt-mention-chip')
  if (!chip) return
  const nextTarget = event.relatedTarget
  if (nextTarget instanceof Node && chip.contains(nextTarget)) return
  hideCanvasMentionPreview()
}

function insertCanvasMention(item) {
  const node = buildCanvasMentionChip(item)
  insertNodeAtEditorCursor(node)
  canvasGenerationPrompt.value = readCanvasPromptEditor()
  handleCanvasPromptInput()
  closeCanvasInlineMentionMenu()
  canvasChatMenu.value = ''
  expandedCanvasMentionGroup.value = ''
  nextTick(() => canvasChatPromptInput.value?.focus())
}

function insertCanvasInlineMention(item) {
  const editor = canvasChatPromptInput.value
  const range = canvasInlineMentionMenu.value.range
  if (!editor || !range) return
  editor.focus()
  insertNodeAtEditorRange(buildCanvasMentionChip(item), range)
  closeCanvasInlineMentionMenu()
  canvasGenerationPrompt.value = readCanvasPromptEditor()
  handleCanvasPromptInput()
  nextTick(() => canvasChatPromptInput.value?.focus())
}

function toggleCanvasChatExpanded() {
  canvasChatExpanded.value = !canvasChatExpanded.value
}

function selectCanvasImageModel(key) {
  selectedCanvasImageModelKey.value = key
  canvasChatMenu.value = ''
}

function selectCanvasChatRatio(ratio) {
  canvasChatRatio.value = ratio
  selectedRatio.value = ratio === 'Automatico' ? 'Default ratio' : ratio
  if (scriptFlowActive.value) scriptDraft.value.ratio = selectedRatio.value
  canvasChatMenu.value = ''
}

function openCanvasStyleLibrary() {
  canvasChatMenu.value = ''
  styleLibraryOpen.value = true
  openControl.value = null
  closeStyleSearch()
  resetStyleGridScroll()
  canvasChatMenu.value = ''
}

function handleCanvasPromptInput() {
  canvasGenerationPrompt.value = readCanvasPromptEditor()
  const target = canvasGenerationTarget.value
  if (!target) return
  const item = productionAssets.value[target.type]?.[target.index]
  if (!item) return
  if (target.type === 'roles') {
    item.appearanceName = canvasGenerationPrompt.value
    item.description = canvasGenerationPrompt.value
  } else if (target.type === 'scenes') {
    item.description = canvasGenerationPrompt.value
  }
  item.canvasPromptMentionRanges = canvasPromptMentionRanges.value.map(range => ({ ...range }))
}

async function optimizeCanvasPrompt() {
  const target = canvasGenerationTarget.value
  const prompt = canvasGenerationPrompt.value.trim()
  if (!target || !prompt || canvasPromptOptimizing.value) return
  canvasPromptOptimizing.value = true
  try {
    const result = await storyStudioAPI.optimizeVisualPrompt({
      prompt,
      target_type: target.type,
      asset: productionAssets.value[target.type]?.[target.index] || {},
      ratio: canvasChatRatioDisplay.value,
      style_label: selectedStyleItem.value?.label || 'Automático',
    })
    const optimizedPrompt = String(result?.prompt || prompt).trim()
    canvasGenerationPrompt.value = optimizedPrompt
    canvasPromptMentionRanges.value = inferCanvasPromptMentionRanges(optimizedPrompt)
    syncCanvasPromptEditor()
    handleCanvasPromptInput()
    toast.success('Prompt otimizado')
  } catch (error) {
    canvasGenerationPrompt.value = locallyOptimizeCanvasPrompt(prompt)
    canvasPromptMentionRanges.value = inferCanvasPromptMentionRanges(canvasGenerationPrompt.value)
    syncCanvasPromptEditor()
    handleCanvasPromptInput()
    toast.success('Prompt otimizado localmente')
  } finally {
    canvasPromptOptimizing.value = false
  }
}

function locallyOptimizeCanvasPrompt(prompt) {
  const cleanPrompt = String(prompt || '').trim().replace(/\s+/g, ' ')
  const additions = [
    /composi/i.test(cleanPrompt) ? '' : 'composicao cinematografica clara',
    /ilumina|luz|sombra/i.test(cleanPrompt) ? '' : 'iluminacao natural controlada com sombras suaves',
    /lente|camera|câmera|plano/i.test(cleanPrompt) ? '' : 'camera em plano bem enquadrado com lente realista',
    /textura|detalh/i.test(cleanPrompt) ? '' : 'texturas realistas e detalhes nitidos',
    'preservando identidade, proporcoes, figurino, ambiente e todas as referencias mencionadas',
  ].filter(Boolean)
  return additions.length ? `${cleanPrompt}, ${additions.join(', ')}` : cleanPrompt
}

function canvasMentionedReferenceImages() {
  const prompt = canvasGenerationPrompt.value
  return [...productionAssets.value.roles, ...productionAssets.value.scenes, ...productionAssets.value.objects, ...productionAssets.value.media]
    .filter(item => prompt.includes(`@${item.name}`) || prompt.includes(String(item?.name || '')))
    .map(productionAssetImageSource)
    .filter(Boolean)
}

async function generateCanvasImage() {
  const target = canvasGenerationTarget.value
  const prompt = canvasGenerationPrompt.value.trim()
  if (!target || !prompt || canvasImageGenerating.value) return
  canvasImageGenerating.value = true
  setCanvasImageGenerating(target.type, target.index, true)
  const model = selectedCanvasImageModel.value
  try {
    const result = await imageAPI.generate({
      drama_id: currentProjectId.value || undefined,
      prompt,
      model: model?.model || undefined,
      config_id: model?.id || undefined,
      aspect_ratio: canvasChatRatioDisplay.value,
      size: canvasChatResolution.value,
      reference_images: canvasMentionedReferenceImages(),
      frame_type: target.type === 'roles' ? 'portrait' : 'scene',
    })
    const item = productionAssets.value[target.type]?.[target.index]
    if (item) {
      item.status = result?.status === 'completed' ? 'Carregado' : 'Generating'
      item.prompt = prompt
      item.imageGenerationId = result?.id || result?.image_generation_id || null
      item.workflowJobId = result?.workflow_job_id || result?.workflowJobId || null
      if (result?.localPath || result?.local_path || result?.imageUrl || result?.image_url) {
        item.imageUrl = result.localPath || result.local_path || result.imageUrl || result.image_url
        item.localPath = item.imageUrl
        setCanvasImageGenerating(target.type, target.index, false)
      } else if (item.imageGenerationId) {
        pollCanvasImageGeneration(item.imageGenerationId, target.type, target.index)
      }
    }
    await persistAgentState('production_assets_ready', true).catch(() => {})
    toast.success('Geração de imagem iniciada')
  } catch (error) {
    setCanvasImageGenerating(target.type, target.index, false)
    const item = productionAssets.value[target.type]?.[target.index]
    if (item) item.status = 'Falhou'
    toast.error(error.message || 'Não foi possível gerar a imagem')
  } finally {
    canvasImageGenerating.value = false
  }
}

function pollCanvasImageGeneration(generationId, type, index) {
  const id = Number(generationId)
  if (!id) return
  if (canvasImagePollers.has(id)) clearInterval(canvasImagePollers.get(id))

  const startedAt = Date.now()
  const poller = setInterval(async () => {
    try {
      const record = await imageAPI.get(id)
      const item = productionAssets.value[type]?.[index]
      if (!item) {
        stopCanvasImagePoller(id)
        return
      }

      const source = record?.localPath || record?.local_path || record?.imageUrl || record?.image_url
      const status = String(record?.status || '').toLowerCase()
      if (source) {
        item.imageUrl = source
        item.localPath = source
        item.status = 'Carregado'
        setCanvasImageGenerating(type, index, false)
        stopCanvasImagePoller(id)
        await persistAgentState('production_assets_ready', true).catch(() => {})
        return
      }

      if (status === 'failed') {
        item.status = 'Falhou'
        setCanvasImageGenerating(type, index, false)
        stopCanvasImagePoller(id)
        toast.error(record?.errorMsg || record?.error_msg || 'A geração da imagem falhou')
        return
      }

      if (Date.now() - startedAt > 10 * 60 * 1000) {
        item.status = 'Timeout'
        setCanvasImageGenerating(type, index, false)
        stopCanvasImagePoller(id)
        toast.error('A geração da imagem demorou demais')
      }
    } catch (error) {
      if (Date.now() - startedAt > 10 * 60 * 1000) {
        setCanvasImageGenerating(type, index, false)
        stopCanvasImagePoller(id)
      }
    }
  }, 2500)

  canvasImagePollers.set(id, poller)
}

function stopCanvasImagePoller(id) {
  const poller = canvasImagePollers.get(Number(id))
  if (!poller) return
  clearInterval(poller)
  canvasImagePollers.delete(Number(id))
}

function closeRoleEditor() {
  roleEditorDraft.value = {
    index: -1,
    key: '',
    name: '',
    appearanceName: '',
    episodes: '',
    main: false,
  }
  roleEditorMenu.value = ''
}

function closeSceneEditor() {
  sceneEditorDraft.value = {
    index: -1,
    key: '',
    name: '',
    perspectiveName: '',
    episodes: '',
  }
  sceneEditorMenu.value = ''
}

function cancelRoleEditor() {
  openProductionAssetMenuKey.value = ''
  openProductionAssetMenuType.value = ''
  roleEditorMenu.value = ''
  closeRoleEditor()
}

function cancelSceneEditor() {
  openProductionAssetMenuKey.value = ''
  openProductionAssetMenuType.value = ''
  sceneEditorMenu.value = ''
  closeSceneEditor()
}

function isRoleEditorOpen(index) {
  return openProductionAssetMenuType.value === 'roles' && roleEditorDraft.value.index === index
}

function toggleRoleEditorMenu(menu) {
  roleEditorMenu.value = roleEditorMenu.value === menu ? '' : menu
}

function selectRoleEditorName(name) {
  roleEditorDraft.value.name = String(name || 'Unnamed role').trim() || 'Unnamed role'
  roleEditorMenu.value = ''
}

function isRoleEditorEpisodeSelected(value) {
  return sceneEditorEpisodeIds(roleEditorDraft.value.episodes).includes(String(value))
}

function toggleRoleEditorEpisode(value) {
  const id = String(value || '').trim()
  if (!id) return
  const selected = new Set(sceneEditorEpisodeIds(roleEditorDraft.value.episodes))
  if (selected.has(id)) selected.delete(id)
  else selected.add(id)
  roleEditorDraft.value.episodes = [...selected]
    .sort((a, b) => Number(a) - Number(b))
    .join(', ')
}

function isSceneEditorOpen(index) {
  return openProductionAssetMenuType.value === 'scenes' && sceneEditorDraft.value.index === index
}

function sceneEditorEpisodeIds(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function toggleSceneEditorMenu(menu) {
  sceneEditorMenu.value = sceneEditorMenu.value === menu ? '' : menu
}

function selectSceneEditorName(name) {
  sceneEditorDraft.value.name = String(name || 'Unnamed scene').trim() || 'Unnamed scene'
  sceneEditorMenu.value = ''
}

function isSceneEditorEpisodeSelected(value) {
  return sceneEditorEpisodeIds(sceneEditorDraft.value.episodes).includes(String(value))
}

function toggleSceneEditorEpisode(value) {
  const id = String(value || '').trim()
  if (!id) return
  const selected = new Set(sceneEditorEpisodeIds(sceneEditorDraft.value.episodes))
  if (selected.has(id)) selected.delete(id)
  else selected.add(id)
  sceneEditorDraft.value.episodes = [...selected]
    .sort((a, b) => Number(a) - Number(b))
    .join(', ')
}

function focusRoleEditorPanel(index) {
  nextTick(() => {
    const viewport = canvasViewportRef.value
    if (!viewport) return
    const position = canvasNodeViewportPosition('roles', index)
    const size = canvasNodeSize('roles', index)
    const scale = canvasZoom.value / 100 || 1
    const panelWidth = 480
    const panelGap = 6
    const padding = 38
    const visibleLeft = viewport.scrollLeft / scale
    const visibleRight = (viewport.scrollLeft + viewport.clientWidth) / scale
    const nodeLeft = position.x
    const nodeRight = position.x + size.width
    const rightSpace = visibleRight - nodeRight
    const leftSpace = nodeLeft - visibleLeft
    const placement = rightSpace >= panelWidth + panelGap + padding || rightSpace >= leftSpace ? 'right' : 'left'
    roleEditorPlacement.value = placement
    const panelLeft = placement === 'right' ? nodeRight - panelGap : nodeLeft - panelWidth + panelGap
    const panelRight = panelLeft + panelWidth
    const focusLeft = Math.min(nodeLeft, panelLeft) - padding
    const focusRight = Math.max(nodeRight, panelRight) + padding
    const focusTop = position.y - 84
    const focusBottom = position.y + Math.max(size.height, 386) + padding
    const targetLeft = focusRight * scale > viewport.scrollLeft + viewport.clientWidth
      ? focusRight * scale - viewport.clientWidth
      : focusLeft * scale < viewport.scrollLeft
        ? focusLeft * scale
        : viewport.scrollLeft
    const targetTop = focusBottom * scale > viewport.scrollTop + viewport.clientHeight
      ? focusBottom * scale - viewport.clientHeight
      : focusTop * scale < viewport.scrollTop
        ? focusTop * scale
        : viewport.scrollTop
    viewport.scrollTo({
      left: Math.max(0, targetLeft),
      top: Math.max(0, targetTop),
      behavior: 'smooth',
    })
  })
}

function openRoleEditor(item, index) {
  const key = productionAssetKey(item, index, 'roles')
  const nodeKey = canvasNodeKey('roles', index)
  closeCanvasGenerationChat()
  closeSceneEditor()
  openProductionAssetMenuKey.value = key
  openProductionAssetMenuType.value = 'roles'
  roleEditorDraft.value = {
    index,
    key,
    name: String(item?.name || '').trim(),
    appearanceName: roleAppearanceName(item),
    episodes: String(item?.episodes || '1, 2').trim(),
    main: Boolean(item?.main),
  }
  bringCanvasNodeToFront(nodeKey)
  focusRoleEditorPanel(index)
}

function scenePerspectiveName(item) {
  const name = String(item?.name || 'Scene').trim() || 'Scene'
  return String(item?.perspectiveName || item?.perspective_name || item?.description || `${name}_Base_Noite`).trim()
}

function focusSceneEditorPanel(index) {
  nextTick(() => {
    const viewport = canvasViewportRef.value
    if (!viewport) return
    const position = canvasNodeViewportPosition('scenes', index)
    const size = canvasNodeSize('scenes', index)
    const scale = canvasZoom.value / 100 || 1
    const panelWidth = 480
    const panelGap = 6
    const padding = 38
    const visibleLeft = viewport.scrollLeft / scale
    const visibleRight = (viewport.scrollLeft + viewport.clientWidth) / scale
    const nodeLeft = position.x
    const nodeRight = position.x + size.width
    const rightSpace = visibleRight - nodeRight
    const leftSpace = nodeLeft - visibleLeft
    const placement = rightSpace >= panelWidth + panelGap + padding || rightSpace >= leftSpace ? 'right' : 'left'
    sceneEditorPlacement.value = placement
    const panelLeft = placement === 'right' ? nodeRight - panelGap : nodeLeft - panelWidth + panelGap
    const panelRight = panelLeft + panelWidth
    const focusLeft = Math.min(nodeLeft, panelLeft) - padding
    const focusRight = Math.max(nodeRight, panelRight) + padding
    const focusTop = position.y - 84
    const focusBottom = position.y + Math.max(size.height, 386) + padding
    const targetLeft = focusRight * scale > viewport.scrollLeft + viewport.clientWidth
      ? focusRight * scale - viewport.clientWidth
      : focusLeft * scale < viewport.scrollLeft
        ? focusLeft * scale
        : viewport.scrollLeft
    const targetTop = focusBottom * scale > viewport.scrollTop + viewport.clientHeight
      ? focusBottom * scale - viewport.clientHeight
      : focusTop * scale < viewport.scrollTop
        ? focusTop * scale
        : viewport.scrollTop
    viewport.scrollTo({
      left: Math.max(0, targetLeft),
      top: Math.max(0, targetTop),
      behavior: 'smooth',
    })
  })
}

function openSceneEditor(item, index) {
  const key = productionAssetKey(item, index, 'scenes')
  const nodeKey = canvasNodeKey('scenes', index)
  closeCanvasGenerationChat()
  closeRoleEditor()
  openProductionAssetMenuKey.value = key
  openProductionAssetMenuType.value = 'scenes'
  sceneEditorDraft.value = {
    index,
    key,
    name: String(item?.name || 'Unnamed scene').trim(),
    perspectiveName: scenePerspectiveName(item),
    episodes: String(item?.episodes || sceneEditorEpisodeOptions.value.map(option => option.value).join(', ') || '1').trim(),
  }
  bringCanvasNodeToFront(nodeKey)
  focusSceneEditorPanel(index)
}

function saveRoleEditor() {
  const draft = roleEditorDraft.value
  if (draft.index < 0 || !productionAssets.value.roles[draft.index]) return
  const current = productionAssets.value.roles[draft.index]
  productionAssets.value.roles[draft.index] = {
    ...current,
    name: draft.name.trim() || current.name || 'Role ' + (draft.index + 1),
    appearanceName: draft.appearanceName.trim() || roleAppearanceName(current),
    description: draft.appearanceName.trim() || roleAppearanceName(current),
    episodes: draft.episodes.trim(),
    status: productionAssetStatusLabel(current, 'roles'),
    blank: false,
  }
  openProductionAssetMenuKey.value = ''
  openProductionAssetMenuType.value = ''
  roleEditorMenu.value = ''
  closeRoleEditor()
  persistAgentState('production_assets_ready', true).catch(() => {})
}

function saveSceneEditor() {
  const draft = sceneEditorDraft.value
  if (draft.index < 0 || !productionAssets.value.scenes[draft.index]) return
  const current = productionAssets.value.scenes[draft.index]
  const name = draft.name.trim() || current.name || 'Scene ' + (draft.index + 1)
  const perspectiveName = draft.perspectiveName.trim() || scenePerspectiveName(current)
  productionAssets.value.scenes[draft.index] = {
    ...current,
    name,
    perspectiveName,
    description: perspectiveName,
    episodes: draft.episodes.trim(),
    status: productionAssetStatusLabel(current, 'scenes'),
    blank: false,
  }
  openProductionAssetMenuKey.value = ''
  openProductionAssetMenuType.value = ''
  sceneEditorMenu.value = ''
  closeSceneEditor()
  persistAgentState('production_assets_ready', true).catch(() => {})
}

function toggleProductionAssetMenu(item, index, type = activeProductionTab.value) {
  if (type === 'roles' && productionCanvasOpen.value) {
    const key = productionAssetKey(item, index, 'roles')
    if (openProductionAssetMenuKey.value === key && openProductionAssetMenuType.value === 'roles') {
      openProductionAssetMenuKey.value = ''
      openProductionAssetMenuType.value = ''
      closeRoleEditor()
      closeSceneEditor()
      return
    }
    openRoleEditor(item, index)
    return
  }
  if (type === 'scenes' && productionCanvasOpen.value) {
    const key = productionAssetKey(item, index, 'scenes')
    if (openProductionAssetMenuKey.value === key && openProductionAssetMenuType.value === 'scenes') {
      openProductionAssetMenuKey.value = ''
      openProductionAssetMenuType.value = ''
      closeSceneEditor()
      return
    }
    openSceneEditor(item, index)
    return
  }
  closeRoleEditor()
  closeSceneEditor()
  const key = productionAssetKey(item, index, type)
  openProductionAssetMenuKey.value = openProductionAssetMenuKey.value === key ? '' : key
  openProductionAssetMenuType.value = openProductionAssetMenuKey.value ? type : ''
}

function requestDeleteProductionAsset(item, index) {
  pendingProductionAssetDelete.value = {
    tab: activeProductionTab.value,
    index,
    key: productionAssetKey(item, index),
    name: String(item?.name || productionAssetTypeLabel()),
    type: productionAssetTypeLabel(),
  }
  openProductionAssetMenuKey.value = ''
}

function requestDeleteSelectedProductionAssets() {
  if (!selectedProductionAssetKeys.value.length) return
  const indices = selectedProductionAssetKeys.value
    .map(key => Number(String(key).split(':')[1]))
    .filter(Number.isInteger)
  if (!indices.length) return
  pendingProductionAssetDelete.value = {
    tab: activeProductionTab.value,
    indices: [...new Set(indices)].sort((a, b) => a - b),
    count: new Set(indices).size,
    type: productionAssetTypeLabel(),
    bulk: true,
  }
}

function closeProductionAssetDeleteConfirm() {
  pendingProductionAssetDelete.value = null
}

async function confirmDeleteProductionAsset() {
  const target = pendingProductionAssetDelete.value
  if (!target) return
  const list = Array.isArray(productionAssets.value[target.tab]) ? productionAssets.value[target.tab] : []
  const deletedIndices = target.bulk ? target.indices : [target.index]
  const deletedSet = new Set(deletedIndices)
  productionAssets.value = {
    ...productionAssets.value,
    [target.tab]: list.filter((_, index) => !deletedSet.has(index)),
  }
  remapCanvasAfterAssetDelete(target.tab, deletedIndices)
  selectedProductionAssetKeys.value = []
  productionAssetSelectionActive.value = false
  pendingProductionAssetDelete.value = null
  await persistAgentState('production_assets_ready', true).catch(() => {})
}

function remapCanvasAfterAssetDelete(type, deletedIndices) {
  const deletedSet = new Set(deletedIndices)
  const nextIndexFor = index => index - deletedIndices.filter(deletedIndex => deletedIndex < index).length
  const nextPositions = {}
  Object.entries(canvasNodePositions.value).forEach(([key, position]) => {
    const [keyType, rawIndex] = key.split(':')
    const index = Number(rawIndex)
    if (keyType !== type || !Number.isInteger(index)) {
      nextPositions[key] = position
      return
    }
    if (deletedSet.has(index)) return
    nextPositions[canvasNodeKey(type, nextIndexFor(index))] = position
  })
  const remapKey = key => {
    const [keyType, rawIndex] = String(key || '').split(':')
    const index = Number(rawIndex)
    if (keyType !== type || !Number.isInteger(index)) return key
    if (deletedSet.has(index)) return null
    return canvasNodeKey(type, nextIndexFor(index))
  }
  canvasNodePositions.value = nextPositions
  canvasConnections.value = canvasConnections.value
    .map(connection => ({ ...connection, from: remapKey(connection.from), to: remapKey(connection.to) }))
    .filter(connection => connection.from && connection.to)
}

async function analyzeProductionAssets() {
  if (productionAnalysisGenerating.value || !allEpisodeScriptsReady.value) return
  if (hasProductionAssets.value) {
    productionAssets.value = repairProductionAssets(productionAssets.value)
    productionAnalysisGenerating.value = false
    productionAssetsReady.value = true
    productionCanvasOpen.value = false
    episodeStageOpen.value = false
    episodeOutlinesReady.value = false
    activeProductionTab.value = productionAssets.value.roles.length ? 'roles' : Object.keys(productionAssets.value).find(key => productionAssets.value[key]?.length) || 'roles'
    await persistAgentState('production_assets_ready', true).catch(() => {})
    return
  }

  const episodes = productionPayloadEpisodes()
  if (!episodes.length) return

  const generationId = ++activeGenerationId
  productionAnalysisGenerating.value = true
  productionAssetsReady.value = false
  productionCanvasOpen.value = false
  episodeOutlinesReady.value = false
  batchSelectionActive.value = false
  selectedEpisodeIds.value = []
  await persistAgentState('production_assets_generating', true).catch(() => {})

  try {
    const generated = await storyStudioAPI.analyzeProductionAssets({
      script: storyStudioScriptPayload(),
      episodes,
    })
    if (generationId !== activeGenerationId) return
    productionAssets.value = repairProductionAssets(generated)
    activeProductionTab.value = 'roles'
    productionAnalysisGenerating.value = false
    productionAssetsReady.value = true
    productionCanvasOpen.value = false
    currentAgentStage.value = 'production_assets_ready'
    await persistAgentState('production_assets_ready')
  } catch (error) {
    if (generationId !== activeGenerationId) return
    productionAnalysisGenerating.value = false
    productionAssetsReady.value = false
    productionCanvasOpen.value = false
    episodeOutlinesReady.value = true
    await persistAgentState('episode_outlines_ready', true).catch(() => {})
    toast.error(error.message || 'A IA não conseguiu analisar os ativos de produção')
  }
}

function backToEpisodeScripts() {
  episodeStageOpen.value = false
  showProductionContinueConfirm.value = false
  showScriptContinueConfirm.value = false
  productionAssetsReady.value = false
  productionCanvasOpen.value = false
  productionAnalysisGenerating.value = false
  productionAssetSelectionActive.value = false
  selectedProductionAssetKeys.value = []
  episodeOutlinesReady.value = true
  currentAgentStage.value = hasProductionAssets.value ? 'production_assets_ready' : 'episode_outlines_ready'
  persistAgentState(currentAgentStage.value, true).catch(() => {})
}

async function createProject(input) {
  if (creatingProject.value) return
  creatingProject.value = true
  try {
    const project = await dramaAPI.create({
      title: input.title,
      total_episodes: input.totalEpisodes || episodeCount.value || 1,
      style: input.style || selectedStyle.value || 'cinematic',
      description: input.description || null,
    })
    toast.success('Projeto criado')
    showPaste.value = false
    pasteText.value = ''
    aiPrompt.value = ''
    await navigateTo({ path: '/', query: { project: String(project.id) } })
  } catch (error) {
    toast.error(error.message || 'Não foi possível criar o projeto')
  } finally {
    creatingProject.value = false
  }
}

async function createFromPaste() {
  const text = pasteText.value.trim()
  if (!text) return
  await createProject({
    title: deriveTitle(text, 'AI Generated Script'),
    description: text.slice(0, 800),
  })
}

async function createFromPrompt() {
  const text = aiPrompt.value.trim()
  if (!text) return
  await analyzeCinematicPlan()
}

async function createBlankProject() {
  await createProject({
    title: 'AI Generated Script',
    totalEpisodes: 3,
    style: 'cinematic',
  })
}

async function createFromExample(project) {
  await createProject({
    title: project.title || 'AI Generated Script',
    totalEpisodes: project.episodes?.length || project.total_episodes || 3,
    style: project.style || selectedStyle.value || 'cinematic',
    description: project.description || null,
  })
}

async function handleFileUpload(event) {
  const file = event.target.files?.[0]
  if (!file) return

  try {
    const isText = /\.(txt|md)$/i.test(file.name)
    const text = isText ? await file.text() : ''
    await createProject({
      title: deriveTitle(text || file.name, file.name.replace(/\.[^.]+$/, '') || 'AI Generated Script'),
      description: text.slice(0, 800) || `Arquivo importado: ${file.name}`,
    })
  } finally {
    event.target.value = ''
  }
}

function isProjectSelected(id) {
  return selectedProjectIds.value.includes(id)
}

function toggleProjectSelection(id) {
  const project = dramas.value.find(item => item.id === id)
  if (project && isExampleProject(project)) {
    toast.info('Exemplos não podem ser selecionados para exclusão')
    return
  }

  selectedProjectIds.value = isProjectSelected(id)
    ? selectedProjectIds.value.filter(item => item !== id)
    : [...selectedProjectIds.value, id]
}

function clearSelection() {
  selectedProjectIds.value = []
  showDeleteConfirm.value = false
}

async function handleProjectClick(project) {
  if (isExampleProject(project)) {
    if (selectedProjectIds.value.length) {
      toast.info('Exemplos não podem ser selecionados para exclusão')
      return
    }
    if (creatingProject.value) return
    await createFromExample(project)
    return
  }

  if (selectedProjectIds.value.length) {
    toggleProjectSelection(project.id)
    return
  }
  navigateTo({ path: '/', query: { project: String(project.id) } })
}

function existingEpisodeSummary(episode, episodeNumber) {
  const content = String(
    episode?.summary
    || episode?.description
    || episode?.script_content
    || episode?.scriptContent
    || '',
  ).trim()

  if (content) return content.slice(0, 900)
  return `O episódio ${episodeNumber} desenvolve o conflito principal e prepara o próximo avanço da história.`
}

function hydrateExistingProject(project) {
  const description = String(project.description || '').trim()
  const [ideaPart, ...synopsisParts] = description.split(/\n\s*\n/)
  const existingEpisodes = Array.isArray(project.episodes) ? project.episodes : []
  const totalEpisodes = Math.max(1, Number(project.total_episodes || project.totalEpisodes || existingEpisodes.length || 1))
  const episodesByNumber = new Map(existingEpisodes.map((episode, index) => [Number(episode.episode_number || episode.episodeNumber || index + 1), episode]))
  let savedAgent = null
  try {
    savedAgent = project.metadata ? JSON.parse(project.metadata) : null
  } catch {
    savedAgent = null
  }

  hydratingProject.value = true
  currentProjectId.value = Number(project.id)

  if (savedAgent?.agent_version === 1 && savedAgent.script_draft) {
    const savedStage = String(savedAgent.stage || 'summary_ready')
    const restoredStage = savedStage === 'summary_generating'
      ? 'summary_ready'
      : savedStage === 'episode_outlines_generating' || savedStage === 'episode_scripts_generating'
        ? 'episode_outlines_ready'
        : savedStage
    const savedEpisodes = Array.isArray(savedAgent.episode_summaries) ? savedAgent.episode_summaries : []
    const savedProductionAssets = normalizeProductionAssets(savedAgent.production_assets || {})
    const savedCanvasNodePositions = savedAgent.canvas_node_positions && typeof savedAgent.canvas_node_positions === 'object'
      ? savedAgent.canvas_node_positions
      : {}
    const savedCanvasConnections = Array.isArray(savedAgent.canvas_connections) ? savedAgent.canvas_connections : []

    Object.assign(cinematicConfig, {
      ...cinematicConfig,
      ...(savedAgent.cinematic_config || {}),
    })
    cinematicPlan.value = savedAgent.cinematic_plan || null
    cinematicDesignSheet.value = savedAgent.cinematic_design_sheet || null
    cinematicStoryboardPackage.value = savedAgent.cinematic_storyboard_package || null
    cinematicImprovements.value = savedAgent.cinematic_improvements || null
    selectedCinematicParts.value = Number(savedAgent.cinematic_selection?.parts_per_episode || cinematicPlan.value?.recommendations?.selected?.part_count || selectedCinematicParts.value)
    selectedCinematicPanels.value = Number(savedAgent.cinematic_selection?.panels_per_part || cinematicPlan.value?.recommendations?.selected?.panels_per_part || selectedCinematicPanels.value)
    scriptDraft.value = { ...scriptDraft.value, ...savedAgent.script_draft }
    episodeCount.value = Number(scriptDraft.value.episodes) || totalEpisodes
    selectedStyle.value = project.style || 'auto'
    episodeSummaries.value = savedEpisodes.map((episode, index) => {
      const episodeNumber = Number(episode.id || index + 1)
      const persistedEpisode = episodesByNumber.get(episodeNumber)
      return {
        ...episode,
        id: episodeNumber,
        backendId: persistedEpisode?.id || episode.backendId,
        title: episode.title || persistedEpisode?.title || `Episódio ${episodeNumber}`,
        summary: episode.summary || existingEpisodeSummary(persistedEpisode, episodeNumber),
        script: episode.script || persistedEpisode?.script_content || persistedEpisode?.scriptContent || '',
        scriptReady: Boolean(episode.scriptReady || persistedEpisode?.script_content || persistedEpisode?.scriptContent),
        videoUrl: episode.videoUrl || episode.video_url || persistedEpisode?.video_url || persistedEpisode?.videoUrl || '',
        expanded: false,
      }
    })

    if (!episodeSummaries.value.length && restoredStage === 'episode_outlines_ready') {
      episodeSummaries.value = Array.from({ length: totalEpisodes }, (_, index) => {
        const id = index + 1
        const episode = episodesByNumber.get(id)
        return {
          id,
          backendId: episode?.id,
          title: episode?.title || `Episódio ${id}`,
          summary: existingEpisodeSummary(episode, id),
          script: episode?.script_content || episode?.scriptContent || '',
          scriptReady: Boolean(episode?.script_content || episode?.scriptContent),
          videoUrl: episode?.video_url || episode?.videoUrl || '',
          expanded: false,
        }
      })
    }

    clearScriptGenerationTimer()
    currentAgentStage.value = restoredStage
    scriptFlowActive.value = true
    scriptGenerating.value = false
    generatedScriptReady.value = true
    episodeOutlineGenerating.value = false
    productionAnalysisGenerating.value = false
    productionAssets.value = repairProductionAssets(savedProductionAssets)
    canvasNodePositions.value = { ...savedCanvasNodePositions }
    canvasConnections.value = savedCanvasConnections.filter(connection =>
      connection
      && typeof connection.from === 'string'
      && typeof connection.to === 'string',
    )
    productionAssetsReady.value = restoredStage === 'production_assets_ready'
    productionCanvasOpen.value = false
    episodeStageOpen.value = restoredStage === 'episodes_ready'
    episodeOutlinesReady.value = restoredStage === 'episode_outlines_ready' || restoredStage === 'episodes_ready'
    episodeScriptsGenerating.value = false
    batchSelectionActive.value = false
    selectedEpisodeIds.value = []
    allEpisodeScriptsExpanded.value = false
    closeFloatingMenus()
    nextTick(() => {
      hydratingProject.value = false
      if (restoredStage === 'production_assets_ready' || restoredStage === 'episodes_ready') persistAgentState(restoredStage, true).catch(() => {})
    })
    return
  }

  scriptDraft.value = {
    idea: ideaPart || project.title || 'Ideia original do projeto',
    title: project.title || 'AI Generated Script',
    episodes: totalEpisodes,
    ratio: project.ratio || 'Default ratio',
    styleLabel: project.style || 'Automático',
    storyType: project.style || 'Drama serial adaptado por IA',
    audience: project.audience || 'Público jovem-adulto',
    synopsis: synopsisParts.join('\n\n') || description || 'Resumo do roteiro salvo no projeto.',
    hook: project.hook || 'O conflito principal conduz a história até uma nova virada.',
    shortSynopsis: project.short_synopsis || project.shortSynopsis || description || 'Resumo do roteiro salvo no projeto.',
    characterBio: project.character_bio || project.characterBio || 'Personagens e relações definidos durante o desenvolvimento do roteiro.',
  }

  episodeCount.value = totalEpisodes
  selectedStyle.value = project.style || 'auto'
  episodeSummaries.value = Array.from({ length: totalEpisodes }, (_, index) => {
    const id = index + 1
    const episode = episodesByNumber.get(id)
    return {
      id,
      title: episode?.title || `Episódio ${id}`,
      summary: existingEpisodeSummary(episode, id),
      backendId: episode?.id,
      script: episode?.script_content || episode?.scriptContent || '',
      scriptReady: Boolean(episode?.script_content || episode?.scriptContent),
      videoUrl: episode?.video_url || episode?.videoUrl || '',
      expanded: false,
    }
  })

  clearScriptGenerationTimer()
  scriptFlowActive.value = true
  scriptGenerating.value = false
  generatedScriptReady.value = true
  episodeOutlineGenerating.value = false
  productionAnalysisGenerating.value = false
  productionAssetsReady.value = false
  productionCanvasOpen.value = false
  episodeStageOpen.value = false
  productionAssets.value = repairProductionAssets({ roles: [], scenes: [], objects: [], media: [] })
  canvasNodePositions.value = {}
  canvasConnections.value = []
  activeProductionTab.value = 'roles'
  episodeOutlinesReady.value = true
  episodeScriptsGenerating.value = false
  batchSelectionActive.value = false
  selectedEpisodeIds.value = []
  allEpisodeScriptsExpanded.value = false
  currentAgentStage.value = 'episode_outlines_ready'
  closeFloatingMenus()
  nextTick(() => { hydratingProject.value = false })
}

async function openExistingProject(projectId) {
  const id = Number(projectId)
  if (!Number.isFinite(id) || id < 1) return
  if (currentProjectId.value === id && scriptFlowActive.value) return

  try {
    const project = await dramaAPI.get(id)
    hydrateExistingProject(project)
  } catch (error) {
    toast.error(error.message || 'Não foi possível abrir o projeto')
    await navigateTo('/')
  }
}

async function deleteSelectedProjects() {
  if (!selectedProjectIds.value.length) return
  const deletableIds = selectedProjectIds.value.filter(id => {
    const project = dramas.value.find(item => item.id === id)
    return project && !isExampleProject(project)
  })

  if (!deletableIds.length) {
    clearSelection()
    toast.info('Exemplos não podem ser excluídos')
    return
  }

  deletingProjects.value = true
  try {
    await Promise.all(deletableIds.map(id => dramaAPI.del(id)))
    toast.success('Projetos excluídos')
    showDeleteConfirm.value = false
    clearSelection()
    await load()
  } catch (error) {
    toast.error(error.message || 'Não foi possível excluir os projetos')
  } finally {
    deletingProjects.value = false
  }
}

function openDeleteConfirm() {
  if (!selectedProjectIds.value.length || deletingProjects.value) return
  showDeleteConfirm.value = true
}

function closeDeleteConfirm() {
  if (deletingProjects.value) return
  showDeleteConfirm.value = false
}

onMounted(() => {
  load()
  loadCinematicEngine()
  loadImageAIConfigs()
  if (route.query.project) openExistingProject(route.query.project)
  window.addEventListener('keydown', handleGlobalKeydown)
  nextTick(() => window.requestAnimationFrame(() => { canvasGeometryRevision.value += 1 }))
})

watch([productionCanvasOpen, canvasZoom], () => {
  nextTick(() => window.requestAnimationFrame(() => { canvasGeometryRevision.value += 1 }))
})

watch(() => route.query.project, projectId => {
  if (projectId) openExistingProject(projectId)
})

watch([scriptDraft, episodeSummaries], () => {
  queueAgentAutosave()
}, { deep: true })

watch([productionAssets, canvasNodePositions, canvasConnections], () => {
  if (canvasDragState.value?.moved) return
  queueAgentAutosave(true)
  updateCanvasPromptMentionChips()
}, { deep: true })

onBeforeUnmount(() => {
  clearScriptGenerationTimer()
  clearAgentAutosaveTimer()
  window.removeEventListener('keydown', handleGlobalKeydown)
  for (const poller of canvasImagePollers.values()) clearInterval(poller)
  canvasImagePollers.clear()
})
</script>

<style scoped>
.story-home {
  min-height: 100vh;
  overflow-y: auto;
  color: #111;
  background:
    radial-gradient(circle, rgba(26, 26, 26, 0.08) 1px, transparent 1px) 0 0 / 10px 10px,
    linear-gradient(180deg, #fbfbfb 0%, #f1f2f3 100%);
  font-family: var(--font-body);
}

.story-topbar {
  height: 58px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 38px 0 48px;
}

.story-brand {
  height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  color: #050505;
  cursor: pointer;
  font-size: 20px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0;
}

.story-brand-mark {
  width: 14px;
  height: 18px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 4px;
  background: #050505;
}

.story-brand-mark img {
  width: 13px;
  height: 13px;
  object-fit: contain;
  filter: brightness(0) invert(1);
}

.story-account {
  height: 32px;
  display: flex;
  align-items: center;
  gap: 10px;
  position: relative;
}


.round-control,
.avatar-button {
  border: 0;
  background: transparent;
  cursor: pointer;
}

.round-control {
  position: relative;
  width: 32px;
  height: 32px;
  display: inline-block;
  flex: 0 0 32px;
  padding: 0;
  color: #050505;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
}

.language-trigger svg {
  position: absolute;
  left: 1px;
  top: 3px;
  width: 25px;
  height: 25px;
  stroke-width: 2.35;
}

.language-trigger b {
  position: absolute;
  right: 3px;
  bottom: 4px;
  z-index: 1;
  padding: 0 1px;
  border-radius: 2px;
  background: #fff;
  color: #050505;
  font-size: 12px;
  font-weight: 600;
  line-height: 0.9;
  letter-spacing: 0;
}

.language-trigger b::before {
  content: attr(data-label);
  position: absolute;
  inset: 0;
  z-index: -1;
  color: #fff;
  -webkit-text-stroke: 2.6px #fff;
  text-shadow:
    -1px 0 0 #fff,
    1px 0 0 #fff,
    0 -1px 0 #fff,
    0 1px 0 #fff;
}

.avatar-button {
  width: 32px;
  height: 32px;
  padding: 0;
  overflow: hidden;
  border-radius: 50%;
  background: #bdc98d;
}

.avatar-button img,
.account-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.story-menu-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  height: 32px;
}

.floating-panel {
  position: absolute;
  z-index: 50;
  background: #fff;
  border: 1px solid rgba(20, 20, 20, 0.04);
  border-radius: 14px;
  box-shadow: 0 18px 38px rgba(0, 0, 0, 0.12);
}

.account-menu {
  top: 44px;
  right: 0;
  width: 240px;
  padding: 24px 0 18px;
}

.account-identity {
  display: grid;
  justify-items: center;
  gap: 4px;
  padding: 0 18px 20px;
  border-bottom: 1px solid #ececec;
}

.account-avatar {
  width: 56px;
  height: 56px;
  overflow: hidden;
  border-radius: 50%;
  background: #bdc98d;
}

.account-identity strong {
  margin-top: 2px;
  font-size: 14px;
  line-height: 1.2;
}

.account-identity span:last-child {
  color: #555;
  font-size: 13px;
}

.account-row {
  width: 100%;
  height: 46px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 25px;
  border: 0;
  background: transparent;
  color: #101010;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  text-align: left;
}

.account-row:hover,
.language-option:hover {
  background: #f5f5f5;
}

.account-row.has-arrow svg:last-child {
  margin-left: auto;
}

.language-menu {
  top: 42px;
  right: -42px;
  width: 216px;
  padding: 13px 0;
  border-radius: 10px;
}

.language-option {
  width: 100%;
  height: 37px;
  display: grid;
  grid-template-columns: 26px 1fr;
  align-items: center;
  padding: 0 13px;
  border: 0;
  background: transparent;
  color: #050505;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  text-align: left;
}

.language-option.selected {
  color: #5c3df4;
}

.story-home.agent-active {
  height: 100vh;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  background: #f1f2f3;
  scrollbar-width: none;
}

.story-home.agent-active::-webkit-scrollbar {
  display: none;
}

.agent-shell {
  min-height: 100%;
  padding-bottom: 132px;
  color: #0d0d0d;
  background: #f1f2f3;
  font-family: var(--font-body);
}

.agent-topbar {
  position: sticky;
  top: 0;
  cursor: default;
  z-index: 40;
  height: 56px;
  display: grid;
  grid-template-columns: minmax(280px, 1fr) auto minmax(340px, 1fr);
  align-items: center;
  column-gap: 28px;
  padding: 0 37px 0 48px;
  background: rgba(250, 250, 250, 0.82);
  backdrop-filter: blur(14px);
}

.agent-chip {
  border: 0;
  background: transparent;
  color: #050505;
  cursor: pointer;
  font-family: inherit;
}

.agent-back {
  display: inline-flex;
  align-items: center;
  justify-self: start;
  gap: 10px;
  color: #050505;
  font-size: 16px;
  line-height: 1;
}

.agent-back-button {
  position: relative;
  width: 34px;
  height: 34px;
  display: inline-grid;
  place-items: center;
  flex: 0 0 34px;
  overflow: hidden;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #050505;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.16s ease, transform 0.16s ease;
}

.agent-back-button::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: rgba(0, 0, 0, 0.08);
  opacity: 0;
  transform: scale(0.62);
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.agent-back-button:hover::after,
.agent-back-button:focus-visible::after {
  opacity: 1;
  transform: scale(1);
}

.agent-back-button:active {
  transform: scale(0.96);
}

.agent-back-button svg {
  position: relative;
  z-index: 1;
}

.agent-back strong {
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 600;
  white-space: nowrap;
}

.agent-steps {
  display: inline-flex;
  align-items: center;
  justify-self: center;
  justify-content: center;
  gap: 12px;
  white-space: nowrap;
}

.agent-step {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 0;
  border: 0;
  background: transparent;
  color: #969696;
  cursor: default;
  font: 600 13px/1 var(--font-body);
}

.agent-step.clickable {
  cursor: pointer;
}

.agent-step.clickable:hover {
  color: #050505;
}

.agent-step:disabled {
  pointer-events: none;
}

.agent-step span {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #e5e5e5;
  color: #8c8c8c;
  font-weight: 600;
}

.agent-step.active {
  color: #161616;
}

.agent-step.active span {
  background: #6240df;
  color: #fff;
}


.agent-step.done {
  color: #161616;
}

.agent-step.done span {
  background: #eee8ff;
  color: #6240df;
}

.production-analysis-main,
.production-assets-main {
  width: min(1024px, calc(100vw - 96px));
  margin: 0 auto;
}

.production-continue-title {
  width: min(912px, 100%);
  margin: 58px auto 34px;
  text-align: left;
}

.production-continue-title h1 {
  margin: 0;
  font-size: var(--type-2xl);
  font-weight: 400;
  line-height: 1.15;
  color: #050505;
}

.production-analysis-card {
  width: min(912px, 100%);
  height: min(560px, calc(100vh - 250px));
  display: flex;
  flex-direction: column;
  margin: 0 auto;
  padding: 46px 56px 34px;
  border: 1.5px solid #8c64ff;
  border-radius: 38px;
  background: #fff;
  box-shadow: 0 0 28px rgba(134, 92, 255, 0.18);
  overflow: hidden;
}

.production-analysis-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  scrollbar-width: none;
}

.production-analysis-scroll::-webkit-scrollbar {
  display: none;
}

.analysis-episode + .analysis-episode {
  margin-top: 28px;
}

.analysis-episode h3 {
  margin: 0 0 14px;
  color: #25304a;
  font-size: 15px;
  font-weight: 500;
}

.analysis-episode p {
  margin: 0;
  color: #34405c;
  font-size: 13px;
  line-height: 1.85;
}

.analysis-episode strong {
  font-weight: 400;
}

.production-analysis-loading {
  flex: 0 0 auto;
  margin: 24px 0 0;
  padding-top: 4px;
}

.agent-main.production-assets-main {
  width: min(1024px, calc(100vw - 96px));
  padding-top: 48px;
}

.production-assets-toolbar {
  width: min(1024px, 100%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 auto 22px;
}

.production-tabs {
  display: flex;
  align-items: center;
  gap: 22px;
}

.production-tabs button {
  height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 0 9px;
  border: 0;
  border-bottom: 1px solid transparent;
  background: transparent;
  color: #242424;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
}

.production-tabs button.active {
  border-bottom-color: #111;
}

.production-tabs em {
  min-width: 18px;
  height: 18px;
  display: inline-grid;
  place-items: center;
  border-radius: 999px;
  background: #e8e8e8;
  color: #696969;
  font-size: 10px;
  font-style: normal;
  font-weight: 600;
}

.edit-screen-button {
  height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 18px;
  border: 0;
  border-radius: 999px;
  background: #141414;
  color: #fff;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}

.asset-setup-panel {
  width: min(1024px, 100%);
  min-height: 70px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 auto 14px;
  padding: 14px 18px;
  border-radius: 14px;
  background: #fff;
}

.asset-setup-panel h2 {
  margin: 0 0 8px;
  color: #222;
  font-size: 14px;
  font-weight: 500;
}

.asset-setup-panel p {
  margin: 0;
  color: #8d8d8d;
  font-size: 12px;
  line-height: 1.35;
}

.asset-setup-panel button {
  min-width: 88px;
  height: 32px;
  border: 0;
  border-radius: 999px;
  background: #171717;
  color: #fff;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}

.asset-setup-panel.selecting {
  position: sticky;
  top: 72px;
  z-index: 40;
  min-height: 64px;
  padding: 14px 18px;
  box-shadow: 0 10px 26px rgba(20, 24, 28, 0.08);
}

.asset-setup-panel.selecting h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.asset-selection-actions {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
  color: #1f1f1f;
  font-size: 13px;
  font-weight: 600;
}

.asset-setup-panel .asset-select-all {
  min-width: 20px;
  width: 20px;
  height: 20px;
  display: inline-grid;
  place-items: center;
  padding: 0;
  border: 1.5px solid #b9a8ff;
  border-radius: 6px;
  background: #fff;
  color: #6e4cff;
}

.asset-setup-panel .asset-select-all.selected {
  background: #7c5cff;
  color: #fff;
}

.asset-setup-panel .asset-exit-button {
  min-width: 52px;
  height: 34px;
  background: #f1f1f1;
  color: #333;
}

.asset-setup-panel .asset-generate-button {
  min-width: 94px;
  height: 34px;
  background: #4a4a4a;
  color: #fff;
}

.asset-setup-panel .asset-bulk-delete-button {
  min-width: 96px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: #fff0f1;
  color: #d92d3a;
}

.asset-setup-panel .asset-bulk-delete-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.asset-setup-panel .asset-generate-button:not(:disabled) {
  background: #4a4a4a;
}

.asset-setup-panel .asset-generate-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.asset-card.selectable {
  cursor: pointer;
}

.asset-card.selectable:hover {
  box-shadow: 0 0 0 1px rgba(146, 92, 255, 0.18);
}

.asset-card.selected {
  box-shadow: 0 0 0 2px rgba(146, 92, 255, 0.45);
}

.asset-card-check {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 4;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border: 1.5px solid #b9a8ff;
  border-radius: 50%;
  background: #fff;
  color: #fff;
}

.asset-card.selected .asset-card-check {
  background: #7c5cff;
  border-color: #7c5cff;
}

.asset-card-menu-wrap {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 8;
}

.asset-card-menu-trigger {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  opacity: 0;
  visibility: hidden;
  border: 0;
  border-radius: 50%;
  background: #fff;
  color: #9b9b9b;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
  transition: opacity 0.16s ease, visibility 0.16s ease, transform 0.16s ease, background 0.16s ease;
}

.asset-card:hover .asset-card-menu-trigger,
.asset-card:focus-within .asset-card-menu-trigger,
.asset-card-menu-trigger.active {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.asset-card-menu-trigger:hover,
.asset-card-menu-trigger.active {
  background: #fff;
  color: #050505;
}

.asset-card-menu-trigger svg {
  width: 19px;
  height: 19px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  color: currentColor;
  stroke: currentColor;
  transition: color 0.16s ease, stroke 0.16s ease;
}

.asset-card-menu-trigger:hover svg,
.asset-card-menu-trigger.active svg {
  color: #050505;
  stroke: #050505;
}

.asset-card-menu {
  position: absolute;
  top: 42px;
  right: 0;
  width: 116px;
  padding: 8px;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 18px 38px rgba(0, 0, 0, 0.14);
}

.asset-card-menu button {
  width: 100%;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #ff3f4b;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}

.asset-card-menu button:hover {
  background: #fff2f3;
}

.production-continue-modal {
  position: relative;
  width: min(520px, calc(100vw - 48px));
  padding: 36px 32px 32px;
  border-radius: 10px;
  background: #fff;
  color: #050505;
  font-family: var(--font-body);
}

.production-continue-modal header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.production-continue-modal h2 {
  margin: 0;
  padding-right: 34px;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.2;
}

.production-continue-modal p {
  margin: 20px 0 22px;
  color: #121212;
  font-size: 14px;
  line-height: 1.55;
}

.production-continue-modal footer {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.production-continue-generate,
.production-continue-anyway {
  width: min(100%, 344px);
  min-height: 42px;
  padding: 0 18px;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
}

.production-continue-generate {
  background: #f1f1f1;
  color: #050505;
}

.production-continue-anyway {
  background: #ff4945;
  color: #fff;
}

.production-continue-generate:hover {
  background: #e8e8e8;
}

.production-continue-anyway:hover {
  background: #f13f3c;
}

.asset-delete-modal {
  position: relative;
  width: min(480px, calc(100vw - 48px));
  min-height: 200px;
  padding: 36px 32px 32px;
  border-radius: 10px;
  background: #fff;
  color: #050505;
  font-family: var(--font-body);
}

.asset-delete-modal header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.asset-delete-modal h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.2;
}

.asset-delete-warning {
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #ffc42e;
  color: #fff;
}

.asset-delete-close {
  position: absolute;
  top: 28px;
  right: 30px;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #111;
  cursor: pointer;
}

.asset-delete-close:hover {
  background: #f4f4f4;
}

.asset-delete-modal p {
  max-width: 380px;
  margin: 20px 0 0;
  color: #121212;
  font-size: 14px;
  line-height: 1.55;
}

.asset-delete-modal p strong {
  font-weight: 600;
}

.asset-delete-modal footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 18px;
}

.asset-delete-cancel,
.asset-delete-confirm {
  min-width: 78px;
  height: 36px;
  border: 0;
  border-radius: 9px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
}

.asset-delete-cancel {
  background: #f3f3f3;
  color: #050505;
}

.asset-delete-confirm {
  background: #ff4945;
  color: #fff;
}

.asset-card-grid {
  width: min(1024px, 100%);
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin: 0 auto;
}

.asset-card-grid.asset-grid-image {
  grid-template-columns: repeat(auto-fill, 142px);
  align-items: start;
  justify-content: start;
  column-gap: 28px;
}

.asset-card-grid.asset-grid-scenes {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.asset-card {
  position: relative;
  display: grid;
  grid-template-rows: 220px auto auto;
  align-content: start;
  min-height: 292px;
  padding: 4px 4px 18px;
  border-radius: 20px;
  background: #fff;
  cursor: pointer;
  overflow: hidden;
}

.asset-grid-scenes .asset-card {
  grid-template-rows: auto auto auto;
  min-height: 248px;
  padding: 4px 4px 14px;
}

.asset-grid-scenes .asset-preview {
  width: 100%;
  height: auto;
  min-height: 0;
  aspect-ratio: 16 / 9;
}

.asset-grid-roles .asset-preview > svg {
  width: 36px;
  height: 36px;
  color: #8f9499;
  opacity: 0.58;
}

.asset-grid-scenes .asset-preview > svg {
  width: 34px;
  height: 34px;
  color: #8f9499;
  opacity: 0.58;
}

.asset-grid-image .asset-card {
  grid-template-rows: 142px auto;
  min-height: 0;
  padding: 0 0 10px;
  border-radius: 16px;
  background: transparent;
  overflow: visible;
}

.asset-grid-image .asset-preview {
  width: 142px;
  height: 142px;
  min-height: 142px;
  max-height: 142px;
  aspect-ratio: 1;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 15px;
  background: #e9e9e9;
}

.asset-grid-image .asset-preview img {
  width: 142px !important;
  height: 142px !important;
  min-height: 0;
  max-height: 142px;
  object-fit: cover;
}

.asset-grid-image .asset-card,
.asset-grid-image .new-asset-card {
  width: 142px;
  max-width: 142px;
}

.asset-grid-image .asset-card h3 {
  margin: 9px 8px 0;
  color: #555b61;
  font-size: 12px;
  font-weight: 500;
  width: 126px;
  max-width: 126px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-grid-image .asset-card > p {
  display: none;
}

.asset-grid-image .asset-card-check {
  top: 8px;
  right: 8px;
}

.asset-preview {
  height: 220px;
  min-height: 220px;
  overflow: hidden;
  display: grid;
  place-items: center;
  border-radius: 17px;
  background: #f0f0f0;
  color: #151515;
}

.asset-preview img,
.canvas-asset-node .canvas-node-preview img {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  border-radius: inherit;
  object-fit: cover;
}

.asset-card h3 {
  position: relative;
  z-index: 1;
  margin: 12px 14px 8px;
  color: #1e1e1e;
  font-size: 14px;
  font-weight: 600;
}

.asset-card p {
  position: relative;
  z-index: 1;
  margin: 0 14px;
  color: #ff5b37;
  font-size: 12px;
}

.main-role-pill {
  position: absolute;
  top: 16px;
  left: 16px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  padding: 0 13px;
  border-radius: 999px;
  background: #d9ffe9;
  color: #0b6f35;
  font-size: 10px;
  font-weight: 600;
}

.new-asset-card .asset-preview {
  color: #b8b8b8;
}

.new-asset-card {
  overflow: visible;
}

.new-media-card .add-asset-preview {
  position: relative;
}

.new-media-card .create-plus-icon,
.new-media-card .create-close-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  transition: opacity 0.14s ease;
}

.new-media-card .create-close-icon {
  opacity: 0;
}

.new-media-card:hover .create-plus-icon,
.new-media-card:focus-within .create-plus-icon {
  opacity: 0;
}

.new-media-card:hover .create-close-icon,
.new-media-card:focus-within .create-close-icon {
  opacity: 1;
}

.asset-create-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 70;
  width: 280px;
  padding: 12px;
  opacity: 0;
  visibility: hidden;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 28px;
  background: #fff;
  box-shadow: 0 18px 44px rgba(20, 26, 34, 0.14);
  transform: translateY(6px);
  transition: opacity 0.14s ease, visibility 0.14s ease, transform 0.14s ease;
}

.asset-create-menu::before {
  position: absolute;
  top: 100%;
  right: 0;
  left: 0;
  height: 10px;
  content: '';
}

.asset-grid-image .asset-create-menu {
  left: 0;
  width: 280px;
}

.new-media-card:hover .asset-create-menu,
.new-media-card:focus-within .asset-create-menu {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.asset-create-menu button {
  width: 100%;
  height: 44px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 14px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: #161a20;
  cursor: pointer;
  font: 600 14px/1 var(--font-body);
  text-align: left;
}

.asset-create-menu button:hover {
  background: #f1f2f4;
}

.new-asset-card.blocked {
  pointer-events: none;
  cursor: not-allowed;
  opacity: 0.42;
  filter: grayscale(1);
}

.add-asset-preview svg {
  width: 40px;
  height: 40px;
  padding: 8px;
  border: 1px dashed #c9c9c9;
  border-radius: 50%;
}

.production-assets-status {
  width: min(764px, calc(100vw - 40px));
  grid-template-columns: 28px minmax(260px, 1fr) 36px auto;
}

.production-assets-status .asset-back-button {
  min-width: 34px;
  width: 34px;
  padding: 0;
  background: transparent;
  color: #fff;
}

.agent-steps i {
  width: 31px;
  border-top: 1px dashed #bfbfbf;
}

.agent-actions {
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-self: end;
  justify-content: flex-end;
  gap: 9px;
  min-width: max-content;
}

.agent-control-wrap {
  position: relative;
  height: 32px;
  display: inline-flex;
  align-items: center;
}

.agent-control-wrap + .agent-control-wrap {
  margin-left: 2px;
  padding-left: 12px;
  border-left: 1px solid #dedede;
}

.agent-chip {
  height: 28px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
}

.agent-chip.style-chip {
  width: 153px;
  justify-content: flex-start;
}

.agent-chip span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-chip strong {
  white-space: nowrap;
  font-weight: 600;
  line-height: 1;
}

.agent-chip.active,
.agent-chip:hover {
  background: rgba(255, 255, 255, 0.82);
}

.agent-chip-thumb {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  border-radius: 4px;
  object-fit: cover;
}

.agent-chip.ratio-chip {
  width: 77px;
  justify-content: flex-start;
}

.control-popover.agent-ratio-popover {
  top: 42px;
  right: 0;
  bottom: auto;
  left: auto;
  z-index: 60;
  transform: none;
}

.agent-main {
  width: min(912px, calc(100vw - 64px));
  margin: 0 auto;
  padding: 56px 0 0;
}

.agent-title-block {
  margin-bottom: 33px;
}

.agent-title-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
}

.batch-selection-button {
  height: 38px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px;
  border: 1px solid #111;
  border-radius: 999px;
  background: transparent;
  color: #111;
  cursor: pointer;
  font: 500 14px/1 var(--font-body);
}

.episode-batch-actions {
  display: inline-flex;
  align-items: center;
  gap: 9px;
}

.episode-batch-actions > button {
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 20px;
  border: 1px solid #111;
  border-radius: 999px;
  background: transparent;
  color: #111;
  cursor: pointer;
  font: 500 14px/1 var(--font-body);
  white-space: nowrap;
}

.episode-batch-actions > button:hover:not(:disabled) {
  background: #f7f7f7;
}

.episode-batch-actions .batch-generate-button {
  border-color: #21152d;
  background: #21152d;
  color: #fff;
  box-shadow: 0 5px 12px rgba(48, 28, 64, 0.18);
}

.episode-batch-actions .batch-generate-button:hover:not(:disabled) {
  background: #120b18;
}

.episode-batch-actions > button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.agent-title-block h1 {
  margin: 0;
  font-size: var(--type-2xl);
  font-weight: 500;
  line-height: 1.15;
  letter-spacing: 0;
}

.agent-title-block p {
  margin: 12px 0 0;
  color: #9ca1ad;
  font-size: 12px;
}

.script-structure-card {
  min-height: 642px;
  overflow: visible;
  padding: 0;
  border-radius: 36px;
  background: #fff;
}

.script-card-scroll {
  padding: 52px 84px 104px 64px;
}

.script-structure-card.generating {
  min-height: 490px;
  border: 1px solid #ad8dff;
  border-radius: 38px;
  box-shadow: 0 0 34px rgba(119, 82, 255, 0.14) inset;
}

.script-structure-card.episodes-ready {
  min-height: 534px;
}

.script-section {
  color: #111;
}

.script-section summary {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 25px;
  font-size: 22px;
  font-weight: 500;
  line-height: 1.2;
}

.script-section summary {
  cursor: pointer;
  list-style-position: outside;
}


.script-section summary::-webkit-details-marker {
  display: none;
}

.script-section summary::marker {
  content: '';
}

.summary-chevron {
  flex: 0 0 16px;
  width: 16px;
  height: 16px;
  transition: transform 0.16s ease;
}

.script-section[open] > summary .summary-chevron {
  transform: rotate(90deg);
}

.script-idea-input,
.script-inline-field input,
.script-editable-field textarea {
  width: 100%;
  border: 0;
  outline: none;
  background: transparent;
  color: #050505;
  font: 400 14px/1.7 var(--font-body);
}

.script-idea-input {
  display: block;
  min-height: 37px;
  margin: 0 0 28px 15px;
  resize: none;
}

.script-locked-value {
  margin: 0 0 28px 15px;
  color: #252840;
  font-size: 13px;
  line-height: 1.8;
}

.script-inline-field {
  display: grid;
  gap: 10px;
}

.script-inline-field span,
.script-inline-field > label,
.script-editable-field label {
  color: #5f667a;
  font-size: 12px;
  letter-spacing: 0.02em;
}

.script-inline-field input {
  height: 28px;
  padding: 0;
}

.script-inline-field input[type='number'] {
  width: 100%;
  height: clamp(34px, 3vw, 40px);
  max-width: none;
  padding-right: clamp(36px, 3.5vw, 44px);
  appearance: textfield;
  -moz-appearance: textfield;
}

.script-inline-field input[type='number']::-webkit-inner-spin-button,
.script-inline-field input[type='number']::-webkit-outer-spin-button {
  margin: 0;
  appearance: none;
  -webkit-appearance: none;
}

.episode-number-control {
  position: relative;
  width: 100%;
}

.episode-stepper {
  position: absolute;
  top: 50%;
  right: clamp(4px, 0.6vw, 8px);
  display: grid;
  width: clamp(24px, 2.2vw, 30px);
  height: clamp(32px, 3vw, 38px);
  grid-template-rows: 1fr 1fr;
  gap: 2px;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-50%);
  transition: opacity 0.15s ease;
}

.episode-number-control:hover .episode-stepper,
.episode-number-control:focus-within .episode-stepper {
  opacity: 1;
  pointer-events: auto;
}

.episode-stepper button {
  display: grid;
  min-width: 0;
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #858585;
  cursor: pointer;
  place-items: center;
}

.episode-stepper button svg {
  width: clamp(12px, 1.2vw, 15px);
  height: clamp(12px, 1.2vw, 15px);
}

.episode-stepper button:hover:not(:disabled) {
  background: #eeeeee;
  color: #222;
}

.episode-stepper button:disabled {
  color: #c8c8c8;
  cursor: default;
}

@media (hover: none) {
  .episode-stepper {
    opacity: 1;
    pointer-events: auto;
  }
}

.script-editable-field textarea {
  display: block;
  resize: none;
  padding: 0;
}

.script-editable-field textarea:focus,
.script-inline-field input:focus,
.script-idea-input:focus {
  box-shadow: none;
}

.script-section > p {
  margin: 0 0 30px 15px;
  color: #252840;
  font-size: 13px;
  line-height: 1.8;
}

.script-loading-row {
  display: inline-flex;
  align-items: center;
  gap: 11px;
  margin-left: -4px;
  color: #888;
  font-size: 13px;
}

.script-loading-row svg {
  animation: agent-spin 1s linear infinite;
}

.episode-outline-loading {
  margin-top: 4px;
}

.episode-outline-loading small {
  color: #a4a4a4;
  font: inherit;
}

.script-summary-readonly-grid {
  display: grid;
  grid-template-columns: minmax(180px, 0.75fr) minmax(250px, 1fr) minmax(190px, 0.8fr);
  gap: 42px;
  margin: 30px 0 34px 15px;
}

.script-summary-readonly-grid > div,
.script-summary-readonly-copy > div {
  display: grid;
  gap: 10px;
}

.script-summary-readonly-grid span,
.script-summary-readonly-copy span {
  color: #5f667a;
  font-size: 12px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.script-summary-readonly-grid strong,
.script-summary-readonly-copy p {
  margin: 0;
  color: #151515;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.7;
}

.script-summary-readonly-copy {
  display: grid;
  gap: 26px;
  margin: 0 0 32px 15px;
}

.episode-script-section {
  margin-top: 8px;
}

.episode-script-section > summary {
  margin-bottom: 28px;
}

.expand-script-chip {
  height: 34px;
  display: inline-flex;
  align-items: center;
  margin-left: 8px;
  padding: 0 14px;
  border: 0;
  border-radius: 5px;
  background: #f0f1f2;
  color: #9da2ad;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
}

.expand-script-chip:hover {
  background: #e7e8ea;
  color: #777d87;
}

.episode-outline-list {
  display: grid;
  gap: 3px;
  padding-left: 12px;
}

.episode-outline-list details {
  border-radius: 7px;
}

.episode-outline-list details.selected {
  background: #f4f1ff;
}

.episode-outline-list details.failed {
  background: #fff5f5;
}

.episode-outline-list.selection-mode details {
  position: relative;
  background: transparent;
}

.episode-outline-list details > summary {
  min-height: 41px;
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 0;
  padding: 0 10px;
  border-radius: 7px;
  cursor: pointer;
  font-size: 15px;
  font-weight: 400;
}

.episode-outline-list details > summary:hover {
  background: #f6f6f6;
}

.episode-row-chevron {
  flex: 0 0 13px;
  transition: transform 0.16s ease;
}

.episode-outline-list details[open] .episode-row-chevron {
  transform: rotate(90deg);
}

.episode-outline-list summary strong {
  color: #6544ff;
  font-weight: 500;
}

.episode-outline-list summary em {
  margin-left: auto;
  color: #5f9d68;
  font-size: 11px;
  font-style: normal;
}

.episode-outline-list details > p {
  margin: 0 28px 12px;
  color: #666;
  font-size: 13px;
  line-height: 1.6;
}

.episode-inline-loading {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin: 10px 28px 20px;
  color: #777;
  font-size: 13px;
  line-height: 1.4;
}

.episode-inline-loading svg {
  flex: 0 0 14px;
  animation: agent-spin 1s linear infinite;
}

.episode-inline-loading small {
  color: #9b9b9b;
  font: inherit;
}

.episode-inline-error {
  margin: -4px 28px 14px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #fff0f0;
  color: #b03030;
  font-size: 12px;
  line-height: 1.45;
}

.episode-generating-pill {
  min-width: 62px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 8px;
  padding: 0 10px;
  border-radius: 999px;
  background: #f1edff;
  color: #6b48ff !important;
  font-size: 10px !important;
  font-weight: 600;
  line-height: 1;
}

.episode-ready-pill {
  min-width: 62px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 8px;
  padding: 0 10px;
  border-radius: 999px;
  background: #dff8eb;
  color: #17a65b !important;
  font-size: 10px !important;
  font-weight: 600;
  line-height: 1;
}

.episode-failed-pill {
  min-width: 62px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 8px;
  padding: 0 10px;
  border-radius: 999px;
  background: #ffe5e5;
  color: #d23b3b !important;
  font-size: 10px !important;
  font-weight: 600;
  line-height: 1;
}

.episode-script-text {
  margin: 8px 28px 26px;
  white-space: pre-wrap;
  color: #25304a;
  font: 400 14px/1.72 var(--font-body);
  background: transparent;
  border: 0;
}

.episode-script-editor {
  width: calc(100% - 56px);
  min-height: 420px;
  display: block;
  resize: vertical;
  outline: 0;
}

.episode-script-editor:focus {
  box-shadow: none;
}
.episode-select-box {
  position: relative;
  width: 16px;
  height: 16px;
  display: grid;
  flex: 0 0 16px;
  place-items: center;
  border: 1px solid #9c83ff;
  border-radius: 50%;
  background: #fff;
  color: #6544ff;
}

.episode-outline-list details.disabled > summary {
  cursor: default;
}

.episode-outline-list details.disabled .episode-select-box {
  border-color: #d9d9d9;
  background: #f5f5f5;
  color: #b6b6b6;
}

.episode-outline-list details.selected .episode-select-box {
  border-color: #7b54ff;
  background: #7b54ff;
  color: #fff;
}

.episode-outline-list.selection-mode details:not(:last-child) .episode-select-box::after {
  content: '';
  position: absolute;
  top: 15px;
  left: 50%;
  z-index: 0;
  width: 1px;
  height: 43px;
  background: #d7d7d7;
  transform: translateX(-50%);
}

.episode-select-box svg {
  position: relative;
  z-index: 1;
}

.episode-outline-list.selection-mode details.selected:not(:last-child) .episode-select-box::after {
  background: #8a65ff;
}

.episode-generate-button {
  height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 20px 28px;
  padding: 0 15px;
  border: 1px solid #e1e1e1;
  border-radius: 999px;
  background: #f7f7f7;
  color: #111;
  cursor: pointer;
  font: 600 12px/1 var(--font-body);
}

.episode-generate-button:hover:not(:disabled) {
  border-color: #cfcfcf;
  background: #fff;
}

.episode-generate-button:disabled {
  cursor: wait;
  opacity: 0.55;
}

.episode-stage-main {
  width: min(1024px, calc(100vw - 96px));
  padding-top: 18px;
}

.episode-stage-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 28px;
}

.episode-stage-head h1 {
  margin: 0 0 16px;
  color: #050505;
  font-size: 28px;
  font-weight: 400;
  line-height: 1.1;
  letter-spacing: -0.04em;
}

.episode-stage-head p {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  color: #5f6368;
  font-size: 12px;
  line-height: 1.4;
}

.episode-stage-head p strong {
  color: #111;
  font-weight: 500;
}

.episode-stage-head p span {
  width: 1px;
  height: 16px;
  background: #cfcfcf;
}

.episode-stage-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
}

.episode-stage-actions button,
.episode-stage-empty button {
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 21px;
  border: 1px solid #dedede;
  border-radius: 999px;
  background: #fff;
  color: #111;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.02);
}

.episode-stage-actions button:hover:not(:disabled),
.episode-stage-actions button.active,
.episode-stage-empty button:hover {
  border-color: #cfcfcf;
  background: #f7f7f7;
}

.episode-stage-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.episode-stage-actions .episode-stage-delete-action {
  border-color: #f0c7cd;
  background: #fff4f5;
  color: #c52238;
}

.episode-stage-actions .episode-stage-delete-action:hover:not(:disabled) {
  border-color: #d92d43;
  background: #d92d43;
  color: #fff;
}

.episode-card-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.episode-stage-card {
  position: relative;
  min-height: 156px;
  display: grid;
  grid-template-columns: 104px minmax(0, 1fr);
  gap: 28px;
  padding: 8px;
  overflow: hidden;
  border: 1px solid #dedede;
  border-radius: 18px;
  background: #fff;
  cursor: default;
  box-shadow: none;
}

.episode-card-grid.selecting .episode-stage-card:not(.ready) {
  cursor: pointer;
}

.episode-stage-card:hover {
  border-color: #111;
}

.episode-stage-card.selected {
  border-color: #111;
  box-shadow: none;
}

.episode-stage-card.generating {
  border-color: #c8baff;
}

.episode-card-select {
  position: absolute;
  right: 18px;
  bottom: 20px;
  z-index: 2;
  width: 16px;
  height: 16px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid #b8bec6;
  border-radius: 50%;
  background: #fff;
  color: #fff;
  cursor: pointer;
}

.episode-stage-card.selected .episode-card-select {
  border-color: #050505;
  background: #050505;
  color: #fff;
}

.episode-card-thumb {
  width: 104px;
  min-height: 138px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: #efefef;
  color: #dfe2e5;
}

.episode-card-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  padding: 8px 16px 8px 0;
}

.episode-card-copy > span {
  display: inline-flex;
  align-items: center;
  height: 18px;
  margin-bottom: 9px;
  padding: 0 10px;
  border-radius: 999px;
  background: #f1f1f1;
  color: #8b8b8b;
  font-size: 10px;
  font-weight: 600;
}

.episode-stage-card.ready .episode-card-copy > span {
  background: #eaf8ef;
  color: #1f8d4a;
}

.episode-stage-card.generating .episode-card-copy > span {
  background: #efeaff;
  color: #7250e6;
}

.episode-card-copy h2 {
  width: 100%;
  overflow: hidden;
  margin: 0;
  color: #111;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.episode-card-copy p {
  margin: 8px 0 8px;
  color: #666b70;
  font-size: 12px;
}

.episode-card-copy small {
  color: #666b70;
  font-size: 12px;
  line-height: 1.35;
}

.episode-card-copy button {
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-width: 198px;
  margin-top: 0;
  padding: 0 18px;
  border: 0;
  border-radius: 999px;
  background: #f0f0f0;
  color: #111;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}

.episode-card-copy button:hover:not(:disabled) {
  background: #e7e7e7;
}

.episode-card-copy button:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.episode-stage-empty {
  min-height: 260px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  border: 1px dashed #d6d6d6;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.58);
  text-align: center;
}

.episode-stage-empty h2 {
  margin: 0;
  color: #111;
  font-size: 18px;
  font-weight: 600;
}

.episode-stage-empty p {
  margin: 0 0 8px;
  color: #777;
  font-size: 13px;
}

.episode-add-overlay {
  position: fixed;
  inset: 0;
  z-index: 150;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.58);
}

.episode-add-modal {
  width: min(480px, calc(100vw - 48px));
  min-height: 220px;
  display: grid;
  gap: 18px;
  padding: 34px 32px 32px;
  border-radius: 12px;
  background: #fff;
  color: #111;
  box-shadow: 0 24px 74px rgba(0, 0, 0, 0.28);
  font-family: var(--font-body);
}

.episode-add-modal header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.episode-add-modal h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.2;
}

.episode-add-modal header button {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #111;
  cursor: pointer;
}

.episode-add-modal header button:hover {
  background: #f2f2f2;
}

.episode-add-modal label {
  display: grid;
  gap: 9px;
}

.episode-add-modal label span {
  font-size: 14px;
  font-weight: 400;
}

.episode-add-modal input {
  width: 100%;
  height: 38px;
  padding: 0 12px;
  border: 1px solid #6d4cff;
  border-radius: 8px;
  background: #fff;
  color: #111;
  font: 400 14px/1 var(--font-body);
  outline: 0;
  box-shadow: 0 0 0 2px rgba(109, 76, 255, 0.08);
}

.episode-add-modal input::placeholder {
  color: #a5a5a5;
}

.episode-add-modal footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.episode-add-modal footer button {
  min-width: 92px;
  height: 36px;
  padding: 0 18px;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
}

.episode-add-modal footer button:first-child {
  background: #f1f1f1;
  color: #111;
}

.episode-add-modal footer button:last-child {
  background: #050505;
  color: #fff;
}

.episode-add-modal footer button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

@media (max-width: 860px) {
  .episode-stage-main {
    width: calc(100vw - 32px);
    padding-top: 32px;
  }

  .episode-stage-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .episode-stage-head p {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
  }

  .episode-stage-head p span {
    display: none;
  }

  .episode-stage-actions {
    width: 100%;
    flex-wrap: wrap;
  }

  .episode-stage-actions button {
    flex: 1 1 auto;
  }

  .episode-card-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 520px) {
  .episode-stage-card {
    grid-template-columns: 84px minmax(0, 1fr);
    gap: 16px;
  }

  .episode-card-thumb {
    min-height: 118px;
  }

  .episode-card-copy button {
    min-width: 0;
    width: 100%;
  }
}

.script-summary-grid {
  display: grid;
  grid-template-columns: minmax(260px, 0.72fr) minmax(260px, 1fr) minmax(210px, 0.8fr);
  column-gap: 48px;
  row-gap: 22px;
  margin: 30px 0 31px 15px;
}

.script-section article {
  display: grid;
  gap: 12px;
}

.script-section article span {
  color: #5f667a;
  font-size: 12px;
  letter-spacing: 0.02em;
}

.script-section article p {
  margin: 0;
  color: #050505;
  font-size: 14px;
  font-weight: 400;
  line-height: 1.7;
}
.script-section article {
  margin-top: 28px;
  margin-left: 15px;
}

.agent-status-bar {
  position: fixed;
  left: 50%;
  bottom: 32px;
  z-index: 45;
  width: min(652px, calc(100vw - 40px));
  min-height: 56px;
  display: grid;
  grid-template-columns: 28px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 10px 14px 10px 16px;
  border-radius: 999px;
  background: #202020;
  color: #fff;
  box-shadow: 0 14px 32px rgba(0, 0, 0, 0.18);
  transform: translateX(-50%);
}

.agent-bot-dot {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #5d3edc;
  color: #fff;
}

.agent-status-bar strong {
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.35;
}

.agent-status-bar button {
  min-width: 70px;
  height: 34px;
  padding: 0 18px;
  border: 0;
  border-radius: 999px;
  background: #fff;
  color: #111;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}

.agent-status-bar button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.agent-status-bar.episodes-ready {
  width: min(820px, calc(100vw - 40px));
  grid-template-columns: 28px minmax(260px, 1fr) auto auto;
}

.agent-status-bar.episodes-ready button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  white-space: nowrap;
}

.agent-status-bar .generate-all-episodes {
  background: #555;
  color: #fff;
}

.agent-status-bar.production-assets-status {
  width: min(764px, calc(100vw - 40px));
  grid-template-columns: 28px minmax(0, 1fr) 34px auto;
  gap: 12px;
}

.agent-status-bar.production-assets-status strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-status-bar.production-assets-status button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  white-space: nowrap;
}

.agent-status-bar.production-assets-status .asset-back-button {
  min-width: 34px;
  width: 34px;
  padding: 0;
  background: transparent;
  color: #fff;
}

@keyframes agent-spin {
  to { transform: rotate(360deg); }
}
.story-main {
  max-width: 1210px;
  margin: 0 auto;
  padding: 4px 0 72px;
}

.story-hero {
  display: grid;
  justify-items: center;
  column-gap: 28px;
  padding: 3px 0 36px;
}

.story-hero h1 {
  font-family: var(--font-display);
  font-size: var(--type-3xl);
  font-weight: 600;
  line-height: var(--leading-tight);
  letter-spacing: 0;
}

.story-hero p {
  color: #929292;
  font-size: 14px;
  line-height: 1.4;
}

.story-composer {
  position: relative;
  z-index: 12;
  width: min(720px, calc(100vw - 32px));
  margin: 0 auto;
}

.composer-tabs {
  height: 42px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  overflow: hidden;
  border-radius: 28px 28px 0 0;
  background: #dfe2e4;
}

.composer-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 0;
  border-radius: 26px 26px 0 0;
  background: transparent;
  color: #34383b;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}

.composer-tab.active {
  background: #fff;
  color: #101010;
}

.composer-panel {
  min-height: 218px;
  padding: 12px;
  border-radius: 0 0 28px 28px;
  background: #fff;
}

.upload-drop {
  height: 194px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 12px;
  border: 1px dashed #d0d0d0;
  border-radius: 20px;
  text-align: center;
}

.upload-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
}

.primary-black,
.soft-button,
.generate-button,
.modal-exit,
.modal-done {
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
}

.primary-black {
  min-width: 144px;
  padding: 0 20px;
  background: #050505;
  color: #fff;
}

.soft-button {
  min-width: 100px;
  padding: 0 20px;
  border: 1px solid #e5e5e5;
  background: #fff;
  color: #111;
}

.upload-drop p {
  width: 360px;
  max-width: calc(100% - 30px);
  color: #aaa;
  font-size: 12px;
  line-height: 1.45;
}

.ai-writer {
  min-height: 214px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ai-writer textarea {
  flex: 1;
  min-height: 142px;
  padding: 16px 13px;
  resize: none;
  border: 1px solid #e5e5e5;
  border-radius: 18px;
  outline: none;
  color: #111;
  background: #fff;
  font: 14px var(--font-display);
  line-height: 1.5;
}

.ai-writer textarea::placeholder {
  color: #9b9b9b;
}

.ai-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ai-control-wrap {
  position: relative;
}

.ai-chip {
  max-width: 226px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #111;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  white-space: nowrap;
}

.ai-chip span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ai-chip-thumb {
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
  border-radius: 6px;
  object-fit: cover;
}

.ai-chip.active,
.ai-chip:hover {
  background: #f3f3f3;
}

.ai-chip svg:last-child {
  transition: transform 0.16s ease;
}

.ai-chip.active svg:last-child {
  transform: rotate(180deg);
}

.control-popover {
  position: absolute;
  bottom: 44px;
  left: 50%;
  z-index: 35;
  border: 1px solid rgba(0, 0, 0, 0.04);
  background: #fff;
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.12);
  transform: translateX(-50%);
}

.episode-popover {
  width: 194px;
  display: grid;
  gap: 4px;
  padding: 11px 12px 14px;
  border-radius: 28px;
}

.episode-option {
  width: 100%;
  height: 38px;
  display: grid;
  grid-template-columns: 22px 1fr;
  align-items: center;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #111;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  text-align: left;
}

.episode-option svg {
  margin-left: 2px;
}

.episode-option strong {
  font-weight: 500;
}

.episode-option:hover,
.episode-option.selected {
  background: #f2f2f2;
}

.episode-option:focus-visible {
  outline: 2px solid #925cff;
  outline-offset: 2px;
}

.custom-episode-row {
  height: 40px;
  margin-top: 4px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border-radius: 9px;
  background: #f2f2f2;
  color: #8b8b8b;
  font-size: 12px;
}

.custom-episode-row input {
  min-width: 0;
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: #555;
  font: inherit;
  text-align: left;
}

.custom-episode-row input::placeholder {
  color: #a9a9a9;
}

.cinematic-setup-popover {
  left: auto;
  right: -92px;
  width: 430px;
  display: grid;
  gap: 14px;
  padding: 16px;
  border-radius: 28px;
  transform: none;
}

.cinematic-setup-popover header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.cinematic-setup-popover header div {
  display: grid;
  gap: 4px;
}

.cinematic-setup-popover header strong {
  font-size: 14px;
  font-weight: 700;
  color: #101010;
}

.cinematic-setup-popover header span {
  color: #8f8f8f;
  font-size: 12px;
  line-height: 1.4;
}

.cinematic-engine-badge {
  min-width: max-content;
  padding: 4px 9px;
  border-radius: 999px;
  background: #f2f2f2;
  color: #777 !important;
  font-size: 11px !important;
  font-weight: 700;
}

.cinematic-engine-badge.ready {
  background: #ede7ff;
  color: #6d42dc !important;
}

.cinematic-setup-grid,
.cinematic-advanced-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.cinematic-setup-grid label,
.cinematic-advanced-grid label {
  display: grid;
  gap: 6px;
  color: #6f6f6f;
  font-size: 11px;
  font-weight: 600;
}

.cinematic-setup-grid input,
.cinematic-setup-grid select,
.cinematic-advanced-grid select {
  width: 100%;
  height: 36px;
  padding: 0 11px;
  border: 1px solid #e4e4e4;
  border-radius: 10px;
  background: #fff;
  color: #111;
  font: 500 12px/1 var(--font-body);
  outline: 0;
}

.cinematic-setup-grid input:focus,
.cinematic-setup-grid select:focus,
.cinematic-advanced-grid select:focus {
  border-color: #b7a1ff;
  box-shadow: 0 0 0 3px rgba(146, 92, 255, 0.12);
}

.cinematic-total-row {
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 13px;
  border-radius: 12px;
  background: #f6f6f6;
  color: #777;
  font-size: 12px;
}

.cinematic-total-row strong {
  color: #111;
  font-weight: 700;
}

.cinematic-advanced {
  border-top: 1px solid #efefef;
  padding-top: 2px;
}

.cinematic-advanced summary {
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #333;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  list-style: none;
}

.cinematic-advanced summary::-webkit-details-marker {
  display: none;
}

.cinematic-advanced[open] summary svg {
  transform: rotate(180deg);
}

.avatar-zero-demo-link {
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 12px;
  padding: 0 12px;
  border: 1px solid #e7e0ff;
  border-radius: 999px;
  background: #f7f3ff;
  color: #6840d6;
  cursor: pointer;
  font: 700 12px/1 var(--font-body);
}

.ratio-popover {
  width: 142px;
  display: grid;
  gap: 4px;
  padding: 10px 8px;
  border-radius: 24px;
}

.ratio-option {
  width: 100%;
  height: 38px;
  display: grid;
  grid-template-columns: 28px 1fr;
  align-items: center;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #111;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  text-align: left;
}

.ratio-option.selected,
.ratio-option:hover {
  background: #f2f2f2;
}

.ratio-option:focus-visible {
  outline: 2px solid #925cff;
  outline-offset: 2px;
}

.ratio-shape {
  justify-self: center;
  width: 14px;
  height: 14px;
  border: 1.5px dashed #111;
  border-radius: 3px;
}

.ratio-option:not(:first-child) .ratio-shape {
  border-style: solid;
  border-color: #777;
  border-radius: 1px;
}

.ratio-option:nth-child(2) .ratio-shape {
  width: 11px;
  height: 16px;
}

.ratio-option:nth-child(3) .ratio-shape {
  width: 18px;
  height: 10px;
}

.ratio-option:nth-child(4) .ratio-shape {
  width: 20px;
  height: 8px;
}

.ratio-option:nth-child(5) .ratio-shape {
  width: 12px;
  height: 16px;
}

.ratio-option:nth-child(6) .ratio-shape {
  width: 16px;
  height: 12px;
}

.style-library-overlay {
  position: fixed;
  inset: 0;
  z-index: 95;
  display: grid;
  place-items: center;
  padding: 48px 24px;
  background: rgba(0, 0, 0, 0.18);
}

.style-library-panel {
  position: relative;
  width: min(828px, calc(100vw - 48px));
  height: min(620px, calc(100vh - 96px));
  display: flex;
  flex-direction: column;
  padding: 20px 24px 24px;
  border: 1px solid #dcdfe3;
  border-radius: 30px;
  background: #fff;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.18);
  font-family: var(--font-body);
}

.style-library-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  column-gap: 28px;
  margin-bottom: 12px;
}

.style-library-head h3 {
  font: 500 16px/1.25 var(--font-body);
}

.style-library-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.style-search {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 1px solid #e3e3e3;
  border-radius: 999px;
  background: #fff;
  color: #555;
  cursor: pointer;
}

.style-close {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 1px solid #e3e3e3;
  border-radius: 999px;
  background: #fff;
  color: #555;
  cursor: pointer;
}

.style-search:hover,
.style-close:hover {
  background: #f7f7f7;
  color: #111;
}

.style-search:focus-visible,
.style-close:focus-visible,
.style-search-clear:focus-visible {
  outline: 2px solid #925cff;
  outline-offset: 2px;
}

.style-search-field {
  height: 34px;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  padding: 0 12px;
  border: 1px solid #e3e3e3;
  border-radius: 999px;
  background: #fff;
  color: #8a8a8a;
}

.style-search-field:focus-within {
  border-color: #cfcfcf;
}

.style-search-field input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: #111;
  font: 400 13px/1 var(--font-body);
}

.style-search-field input::placeholder {
  color: #9a9a9a;
}

.style-search-field input::-webkit-search-cancel-button {
  display: none;
}

.style-search-clear {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  flex: 0 0 24px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #8a8a8a;
  cursor: pointer;
}

.style-category-row {
  display: grid;
  grid-template-columns: 110px repeat(3, 1fr);
  gap: 4px;
  width: 452px;
  max-width: 100%;
  margin-bottom: 14px;
}

.style-category {
  height: 32px;
  border: 1px solid #e5e5e5;
  border-radius: 999px;
  background: #fff;
  color: #111;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
}

.style-category.selected {
  border-color: #050505;
  background: #050505;
  color: #fff;
  font-weight: 600;
}

.style-grid-shell {
  position: relative;
  flex: 1;
  min-height: 0;
}

.style-empty-state {
  min-height: 180px;
  display: grid;
  place-items: center;
  color: #8f8f8f;
  font-size: 13px;
}

.style-card-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  align-content: start;
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  padding-right: 0;
  scrollbar-width: none;
}

.style-card-grid::-webkit-scrollbar {
  display: none;
}

.style-card {
  position: relative;
  height: 98px;
  overflow: hidden;
  border: 0;
  border-radius: 12px;
  background: #f1f2f3;
  color: #fff;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
}

.style-card.selected {
  box-shadow: none;
}

.style-card.selected::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  border: 3px solid #925cff;
  border-radius: inherit;
  pointer-events: none;
}

.auto-style-card {
  display: grid;
  grid-template-rows: 1fr auto;
  place-items: center;
  padding: 15px 10px 12px;
  border: 1px solid #cfd4da;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.025);
  background: #f5f6f7;
  color: #777;
  text-align: center;
}

.auto-style-card::after {
  display: none;
}

.auto-style-icon {
  position: relative;
  width: 38px;
  height: 34px;
  display: grid;
  place-items: center;
  color: #c9c9c9;
}

.style-card .auto-style-label {
  position: static;
  max-width: 100%;
  color: #666;
  font-size: 12px;
  font-weight: 500;
  text-align: center;
}

.style-card img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  object-position: center;
}

.style-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.05), rgba(0, 0, 0, 0.55));
}

.style-card span {
  position: absolute;
  right: 8px;
  bottom: 7px;
  left: 8px;
  z-index: 3;
  overflow: hidden;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.style-scroll-cue {
  position: absolute;
  top: 0;
  right: -18px;
  width: 8px;
  height: 100%;
  pointer-events: none;
}

.style-scroll-cue > span {
  position: absolute;
  top: 0;
  right: 2px;
  width: 4px;
  height: 36px;
  border-radius: 999px;
  background: #b9b9b9;
}

.custom-style-card {
  display: grid;
  place-items: center;
  border-color: #e1e1e1;
  background: #f5f6f7;
  color: #777;
  text-align: center;
}

.custom-style-card::after {
  display: none;
}

.custom-style-card span {
  position: static;
  color: #666;
  font-weight: 500;
}

.custom-style-icon {
  position: static !important;
  width: 30px;
  height: 28px;
  display: grid;
  place-items: center;
  color: #c9c9c9 !important;
}

.custom-style-icon svg:last-child {
  margin-top: -20px;
  margin-left: -16px;
  border-radius: 999px;
  background: #f5f6f7;
}

.generate-button {
  min-width: 100px;
  margin-left: auto;
  padding: 0 24px;
  background: #d9d9d9;
  color: #fff;
}

.generate-button:not(:disabled) {
  background: #050505;
}

.screen-builder {
  min-height: 194px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 24px 30px;
  border: 1px dashed #d0d0d0;
  border-radius: 20px;
}

.screen-builder-copy {
  display: grid;
  gap: 7px;
  color: #111;
}

.screen-builder-copy span {
  max-width: 420px;
  color: #878787;
  font-size: 13px;
  line-height: 1.45;
}

.composer-note {
  display: flex;
  align-items: center;
  justify-content: space-between;
  column-gap: 28px;
  margin: 13px 0 16px;
  color: #8f8f8f;
  font-size: 12px;
}

.composer-note span,
.skip-analysis-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.skip-analysis-link {
  padding-left: 0;
  border-left: 0;
  border-top: 0;
  border-right: 0;
  border-bottom: 0;
  background: transparent;
  color: #666;
  cursor: pointer;
  font: inherit;
  font-weight: 600;
}

.skip-analysis-link:hover {
  color: #111;
}

.skip-analysis-link:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.skip-analysis-link:focus-visible {
  outline: 2px solid #925cff;
  outline-offset: 3px;
  border-radius: 6px;
}

.projects-section {
  width: 100%;
  max-width: 1210px;
  margin: 0 auto;
  padding-top: 1px;
}

.projects-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}

.projects-head h2 {
  font: 600 14px/1.2 var(--font-body);
}

.projects-head button {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  border: 0;
  background: transparent;
  color: #111;
  cursor: pointer;
  font-size: 14px;
}

.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(232px, 1fr));
  gap: 12px;
}

.project-tile,
.project-skeleton {
  min-width: 0;
  height: 204px;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.03);
  border-radius: 24px;
  background: #eceff1;
}

.project-tile {
  position: relative;
  padding: 12px 14px 13px;
  cursor: pointer;
  transition: border-color 0.18s, box-shadow 0.18s, transform 0.18s;
}

.project-tile:hover {
  transform: translateY(-1px);
  border-color: rgba(92, 61, 244, 0.22);
}

.project-tile.selected {
  border-color: rgba(112, 78, 255, 0.42);
  box-shadow: 0 0 0 1px rgba(112, 78, 255, 0.2);
}

.select-check {
  position: absolute;
  top: 14px;
  left: 16px;
  z-index: 3;
  width: 16px;
  height: 16px;
  display: grid;
  place-items: center;
  opacity: 0;
  border: 1px solid rgba(132, 101, 255, 0.45);
  border-radius: 4px;
  background: #fff;
  color: transparent;
  cursor: pointer;
  transition: opacity 0.15s, background 0.15s, border-color 0.15s, color 0.15s;
}

.project-tile:hover .select-check {
  opacity: 1;
}

.project-tile.selected .select-check {
  opacity: 1;
  border-color: #8465ff;
  background: #8465ff;
  color: #fff;
}

.project-preview {
  position: relative;
  height: 120px;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  overflow: hidden;
  border-radius: 10px;
  background: #f7f8f9;
}

.project-preview img {
  width: 100%;
  height: 120px;
  min-width: 0;
  object-fit: cover;
  border-right: 1px solid rgba(0, 0, 0, 0.04);
}

.project-preview img:last-child {
  border-right: 0;
}

.sample-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 4px 8px;
  border-radius: 8px;
  background: #e8dcff;
  color: #6d44ff;
  font-size: 10px;
  line-height: 1;
}

.preview-empty {
  height: 100%;
  display: grid;
  place-items: center;
  color: #d5d5d5;
}

.project-copy {
  padding-top: 14px;
}

.project-copy h3 {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #111;
  font: 400 14px/1.25 var(--font-body);
}

.project-meta-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
}

.project-meta-line time {
  overflow: hidden;
  color: #8a8a8a;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-meta-line span {
  min-width: 38px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #fff;
  color: #555;
  font-size: 11px;
}

.project-skeleton {
  background: linear-gradient(90deg, #eceff1 0%, #f6f7f8 50%, #eceff1 100%);
  background-size: 220% 100%;
  animation: shimmer 1.5s infinite;
}

.help-button {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 70;
  width: 50px;
  height: 50px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: #5e3ee8;
  color: #fff;
  box-shadow: 0 12px 24px rgba(94, 62, 232, 0.28);
  cursor: pointer;
}

.help-popover {
  position: fixed;
  right: 20px;
  bottom: 82px;
  z-index: 75;
  width: 260px;
  padding: 14px 16px;
  color: #333;
  font-size: 13px;
  line-height: 1.45;
}

.pippit-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.62);
}

.paste-modal {
  width: min(720px, calc(100vw - 48px));
  min-height: 588px;
  display: flex;
  flex-direction: column;
  padding: 34px 32px 32px;
  border-radius: 10px;
  background: #fff;
}

.paste-modal header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 26px;
}

.paste-modal h2 {
  font: 600 22px/1.2 var(--font-body);
}

.paste-modal header button {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.paste-area {
  position: relative;
  flex: 1;
  min-height: 400px;
}

.paste-area textarea {
  width: 100%;
  height: 100%;
  min-height: 400px;
  padding: 14px 12px 34px;
  resize: none;
  border: 1px solid #9f9f9f;
  border-radius: 7px;
  outline: none;
  color: #111;
  font: 14px/1.55 var(--font-body);
}

.paste-area textarea::placeholder {
  color: #9fa6ad;
}

.paste-area span {
  position: absolute;
  right: 12px;
  bottom: 12px;
  color: #26323b;
  font-size: 14px;
  font-weight: 600;
}

.paste-modal footer {
  display: flex;
  justify-content: flex-end;
  column-gap: 28px;
  padding-top: 24px;
}

.modal-exit,
.modal-done {
  width: 120px;
  height: 44px;
  border-radius: 12px;
  font-size: 14px;
}

.modal-exit {
  background: #f2f2f2;
  color: #050505;
}

.modal-done {
  background: #dcdcdc;
  color: #8b8b8b;
}

.modal-done:not(:disabled) {
  background: #050505;
  color: #fff;
}

.skill-note {
  color: #7b5cff;
  font-weight: 600;
}

.cinematic-review-overlay {
  background: rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(4px);
}

.cinematic-review-modal {
  width: min(860px, calc(100vw - 48px));
  max-height: calc(100vh - 56px);
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: auto;
  padding: 22px 24px 0;
  border-radius: 26px;
  background: #fff;
  color: #111;
  font-family: var(--font-body);
  box-shadow: 0 24px 74px rgba(0, 0, 0, 0.18);
}

.cinematic-review-head {
  display: flex;
  justify-content: space-between;
  gap: 22px;
}

.cinematic-review-head > div {
  display: grid;
  gap: 5px;
}

.cinematic-review-head span {
  color: #7b5cff;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.cinematic-review-head h2 {
  font: 700 24px/1.18 var(--font-body);
}

.cinematic-review-head p {
  max-width: 560px;
  color: #8c9299;
  font-size: 13px;
  line-height: 1.45;
}

.cinematic-review-head button {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  flex: 0 0 34px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #555;
  cursor: pointer;
}

.cinematic-review-head button:hover {
  background: #f4f4f4;
  color: #111;
}

.cinematic-review-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.cinematic-review-summary span {
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  padding: 0 10px;
  border-radius: 999px;
  background: #f4f4f5;
  color: #555;
  font-size: 12px;
  font-weight: 700;
}

.cinematic-recommendation-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.cinematic-recommendation-grid article {
  min-width: 0;
  display: grid;
  gap: 10px;
  padding: 16px;
  border: 1px solid #ececf0;
  border-radius: 18px;
  background: #fbfbfc;
}

.recommendation-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.recommendation-label span {
  color: #5b6067;
  font-size: 12px;
  font-weight: 700;
}

.recommendation-label em {
  color: #7b5cff;
  font-size: 11px;
  font-style: normal;
  font-weight: 800;
}

.cinematic-recommendation-grid article > strong {
  color: #111;
  font-size: 42px;
  line-height: 0.95;
  letter-spacing: -0.03em;
}

.cinematic-recommendation-grid select {
  width: 100%;
  height: 36px;
  padding: 0 10px;
  border: 1px solid #e3e3e7;
  border-radius: 10px;
  background: #fff;
  color: #111;
  font: 600 12px/1 var(--font-body);
}

.cinematic-recommendation-grid p,
.cinematic-recommendation-grid small {
  color: #858b93;
  font-size: 12px;
  line-height: 1.45;
}

.cinematic-estimate {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.cinematic-estimate div {
  min-width: 0;
  display: grid;
  gap: 2px;
  padding: 12px;
  border-radius: 14px;
  background: #f4f5f7;
}

.cinematic-estimate strong {
  color: #111;
  font-size: 18px;
}

.cinematic-estimate span {
  overflow: hidden;
  color: #80868d;
  font-size: 11px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cinematic-reference-preview {
  display: grid;
  grid-template-columns: 124px 124px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid #e9e4ff;
  border-radius: 16px;
  background: #faf8ff;
}

.cinematic-reference-preview img {
  width: 124px;
  height: 70px;
  display: block;
  border-radius: 10px;
  object-fit: cover;
}

.cinematic-reference-preview div {
  display: grid;
  gap: 4px;
}

.cinematic-reference-preview strong {
  color: #241b45;
  font-size: 13px;
}

.cinematic-reference-preview span {
  color: #766e8d;
  font-size: 12px;
  line-height: 1.45;
}

.cinematic-review-details {
  border: 1px solid #eeeeef;
  border-radius: 16px;
  background: #fff;
}

.cinematic-review-details summary {
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 14px;
  cursor: pointer;
  color: #111;
  font-size: 13px;
  font-weight: 700;
  list-style: none;
}

.cinematic-review-details summary::-webkit-details-marker {
  display: none;
}

.cinematic-review-details[open] summary svg {
  transform: rotate(180deg);
}

.cinematic-review-detail-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  padding: 0 14px 14px;
}

.cinematic-review-detail-grid section {
  display: grid;
  gap: 5px;
  padding: 12px;
  border-radius: 12px;
  background: #f7f7f8;
}

.cinematic-review-detail-grid strong {
  color: #111;
  font-size: 12px;
}

.cinematic-review-detail-grid p {
  color: #787f87;
  font-size: 12px;
  line-height: 1.45;
}

.cinematic-review-modal footer {
  position: sticky;
  bottom: 0;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin: 0 -24px;
  padding: 12px 24px 18px;
  border-top: 1px solid rgba(17, 17, 17, 0.06);
  background: linear-gradient(180deg, rgba(255,255,255,0.88), #fff 38%);
}

.cinematic-review-back,
.cinematic-review-confirm {
  min-width: 142px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 18px;
  border: 0;
  border-radius: 12px;
  cursor: pointer;
  font: 700 13px/1 var(--font-body);
  white-space: nowrap;
}

.cinematic-review-back {
  background: #f1f1f1;
  color: #111;
}

.cinematic-review-confirm {
  min-width: 176px;
  background: #050505;
  color: #fff;
}

.cinematic-review-confirm:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.delete-confirm-overlay {
  background: rgba(0, 0, 0, 0.42);
}

.delete-confirm-modal {
  position: relative;
  width: min(714px, calc(100vw - 48px));
  min-height: 264px;
  padding: 38px 32px 32px;
  border-radius: 24px;
  background: #fff;
  color: #050505;
  font-family: var(--font-body);
}

.delete-confirm-close {
  position: absolute;
  top: 28px;
  right: 28px;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #555;
  cursor: pointer;
}

.delete-confirm-close:hover {
  background: #f6f6f6;
  color: #111;
}

.delete-confirm-modal h2 {
  padding-right: 48px;
  font: 600 24px/1.2 var(--font-body);
}

.delete-confirm-modal p {
  max-width: 620px;
  margin-top: 32px;
  color: #8f949c;
  font-size: 16px;
  line-height: 1.5;
}

.delete-confirm-modal footer {
  display: flex;
  justify-content: flex-end;
  column-gap: 28px;
  margin-top: 40px;
}

.delete-cancel-button,
.delete-confirm-button {
  min-width: 138px;
  height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 12px;
  cursor: pointer;
  font: 600 18px/1 var(--font-body);
}

.delete-cancel-button {
  background: #f1f1f1;
  color: #050505;
}

.delete-confirm-button {
  background: #ff4945;
  color: #fff;
}

.delete-cancel-button:hover {
  background: #e8e8e8;
}

.delete-confirm-button:hover {
  background: #f13f3c;
}

.delete-cancel-button:disabled,
.delete-confirm-button:disabled,
.delete-confirm-close:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.selection-bar {
  position: fixed;
  left: 50%;
  bottom: 30px;
  z-index: 90;
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 64px;
  padding: 12px 14px 12px 24px;
  border-radius: 999px;
  background: #070707;
  color: #fff;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.25);
  transform: translateX(-50%);
}

.selection-bar strong {
  font-size: 16px;
  font-weight: 500;
}

.selection-cancel,
.selection-delete {
  height: 40px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 20px;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
}

.selection-cancel {
  background: #fff;
  color: #111;
}

.selection-delete {
  background: #ff4f45;
  color: #fff;
}

.story-home {
  font-family: var(--font-body);
  letter-spacing: 0;
}

@media (max-width: 760px) {
  .cinematic-setup-popover {
    left: 50%;
    right: auto;
    width: calc(100vw - 32px);
    transform: translateX(-50%);
  }

  .cinematic-review-head,
  .cinematic-reference-preview {
    grid-template-columns: 1fr;
  }

  .cinematic-setup-popover header {
    display: grid;
    grid-template-columns: 1fr;
  }

  .cinematic-setup-grid,
  .cinematic-advanced-grid,
  .cinematic-recommendation-grid,
  .cinematic-review-detail-grid,
  .cinematic-reference-preview {
    grid-template-columns: 1fr;
  }

  .cinematic-review-modal {
    width: calc(100vw - 24px);
    max-height: calc(100vh - 24px);
    padding: 18px 14px 0;
    border-radius: 22px;
  }

  .cinematic-review-head {
    display: grid;
    gap: 14px;
  }

  .cinematic-review-head button {
    justify-self: end;
  }

  .cinematic-estimate {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .cinematic-review-modal footer {
    flex-direction: column-reverse;
    margin: 0 -14px;
    padding: 12px 14px 16px;
  }

  .cinematic-review-back,
  .cinematic-review-confirm {
    width: 100%;
  }
}

.story-brand-name,
.round-control,
.composer-tab,
.ai-chip,
.generate-button,
.primary-black,
.soft-button,
.projects-head h2,
.projects-head button,
.project-copy h3,
.project-meta-line,
.composer-note,
.skip-analysis-link,
.style-library-panel,
.selection-bar {
  font-family: var(--font-body);
  letter-spacing: 0;
}

.story-hero h1 {
  font-family: var(--font-display);
  font-size: var(--type-3xl);
  font-weight: 600;
  line-height: var(--leading-tight);
  letter-spacing: 0;
}

.story-hero p {
  color: #999;
  font: 400 14px/1.4 var(--font-body);
  letter-spacing: 0;
}

.ai-writer textarea {
  font-family: var(--font-body);
}


.agent-shell.screen-shell {
  min-height: 100vh;
  padding-bottom: 0;
  background-color: #d8dadc;
  background-image: radial-gradient(rgba(139, 148, 156, 0.48) 1px, transparent 1px);
  background-size: 28px 28px;
}

.agent-shell.screen-shell .agent-topbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 80;
}

.screen-topbar {
  grid-template-columns: minmax(180px, 1fr) auto;
  height: 70px;
  pointer-events: none;
  padding: 0 16px;
  background: transparent;
  backdrop-filter: none;
  box-shadow: none;
}

.screen-topbar button,
.screen-topbar .screen-topbar-left,
.screen-topbar .agent-actions,
.screen-topbar .agent-control-wrap,
.screen-topbar .story-menu-wrap {
  pointer-events: auto;
}

.screen-topbar-left {
  display: inline-flex;
  justify-self: start;
  width: max-content;
  max-width: max-content;
  pointer-events: auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
  color: #1d2329;
  font: 500 14px/1 var(--font-body);
}

.screen-back-button {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.86);
  color: #1b2025;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.05);
}

.screen-back-button:hover {
  background: #fff;
}

.screen-saved-dot {
  width: 8px;
  height: 8px;
  border: 2px solid #19b364;
  border-radius: 999px;
  background: rgba(25, 179, 100, 0.16);
  animation: screen-saved-pulse 2.2s ease-out infinite;
}

.screen-saved-dot.saving {
  border-color: #19b364;
  background: #19b364;
  animation-duration: 0.9s;
}

.screen-saved-dot.error {
  border-color: #dc5454;
  background: rgba(220, 84, 84, 0.16);
  animation: none;
}

.screen-save-label {
  min-width: 58px;
}

@keyframes screen-saved-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(25, 179, 100, 0);
  }

  35% {
    box-shadow: 0 0 0 4px rgba(25, 179, 100, 0.14);
  }
}

.screen-topbar .agent-actions {
  min-height: 44px;
  pointer-events: auto;
  padding: 4px 8px 4px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 8px 26px rgba(0, 0, 0, 0.08);
}

.production-canvas-main {
  position: relative;
  height: 100vh;
  min-height: 100vh;
  padding-top: 0;
  box-sizing: border-box;
  overflow: auto;
  scrollbar-width: none;
  user-select: none;
  -webkit-user-select: none;
  background-color: #d8dadc;
  background-image: radial-gradient(rgba(139, 148, 156, 0.48) 1px, transparent 1px);
  background-size: 28px 28px;
  cursor: grab;
  font-family: var(--font-body);
}

.production-canvas-main input,
.production-canvas-main textarea,
.production-canvas-main [contenteditable="true"],
.production-canvas-main .canvas-prompt-editor {
  user-select: text;
  -webkit-user-select: text;
}

.production-canvas-main.panning {
  cursor: grabbing;
}

.canvas-side-tools {
  position: fixed;
  top: 288px;
  cursor: default;
  left: 16px;
  z-index: 55;
  width: 58px;
  min-height: 170px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 9px;
  padding: 7px 5px 8px;
  border: 1px solid rgba(255, 255, 255, 0.92);
  border-radius: 999px;
  background: rgba(248, 249, 250, 0.96);
  box-shadow: 0 10px 24px rgba(28, 34, 40, 0.08);
  backdrop-filter: blur(12px);
}

.canvas-add-button,
.canvas-tool-button {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #1b2025;
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease, transform 0.16s ease;
}

.canvas-add-button {
  width: 40px;
  height: 40px;
  margin-bottom: 4px;
  background: #14191f;
  color: #fff;
}

.canvas-side-tools.adding .canvas-add-button,
.canvas-tool-button.active {
  background: #1b2025;
  color: #fff;
}

.canvas-tool-button:hover {
  background: #e8ebee;
}

.canvas-tool-button.library-open {
  background: #eef0f2;
  color: #1b2025;
}

.canvas-tool-button.library-open:hover {
  background: #e2e5e8;
}

.canvas-add-button:hover {
  background: #20262d;
  transform: scale(1.03);
}

.add-node-menu,
.screen-help-menu,
.production-library-panel {
  position: fixed;
  z-index: 54;
  cursor: default;
  border: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.04);
  backdrop-filter: blur(16px);
}

.add-node-menu {
  top: 92px;
  left: 82px;
  width: min(300px, calc(100vw - 106px));
  padding: 20px 16px 22px;
  border-radius: 36px;
}

.add-node-menu h3 {
  margin: 0 0 10px 10px;
  color: #8d949b;
  font-size: 13px;
  font-weight: 600;
}

.add-node-menu button {
  width: 100%;
  min-height: 56px;
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  grid-template-rows: auto auto;
  align-items: center;
  column-gap: 10px;
  padding: 7px 10px;
  border: 0;
  border-radius: 26px;
  background: transparent;
  color: #1f2429;
  text-align: left;
  cursor: pointer;
  transition: background 0.16s ease;
}

.add-node-menu button:hover,
.add-node-menu button:focus-visible {
  background: #eef0f2;
  outline: 0;
}

.add-node-menu button > span {
  grid-row: 1 / 3;
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: #f1f3f5;
  color: #20262c;
  transition: background 0.16s ease;
}

.add-node-menu button:hover > span,
.add-node-menu button:focus-visible > span {
  background: #fff;
}

.add-node-menu strong {
  min-width: 0;
  overflow: hidden;
  color: #20262c;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.12;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.add-node-menu small {
  min-width: 0;
  max-height: 0;
  overflow: hidden;
  color: #59636d;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.2;
  opacity: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: max-height 0.16s ease, opacity 0.16s ease;
}

.add-node-menu button:hover small,
.add-node-menu button:focus-visible small {
  max-height: 16px;
  opacity: 1;
}

.screen-help-menu {
  top: 398px;
  left: 82px;
  width: 180px;
  padding: 8px;
  border-radius: 22px;
}

.screen-help-menu button {
  width: 100%;
  height: 44px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 12px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: #1f2429;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.16s ease;
}

.screen-help-menu button:hover,
.screen-help-menu button:focus-visible {
  background: #eef0f2;
  outline: 0;
}

.canvas-context-menu {
  position: fixed;
  z-index: 76;
  cursor: default;
  width: 244px;
  padding: 18px 10px 10px;
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 18px 48px rgba(30, 38, 46, 0.15);
  backdrop-filter: blur(14px);
}

.canvas-context-menu.anchored {
  position: absolute;
  top: calc(50% + 27px);
  z-index: 12;
}

.canvas-image-node .canvas-context-menu.anchored {
  top: 254px;
}

.canvas-context-menu.anchored.right {
  left: calc(100% + 2px);
}

.canvas-context-menu.anchored.left {
  right: calc(100% + 2px);
}

.canvas-role-node .canvas-context-menu.anchored {
  top: 235px;
  font-family: var(--font-body);
}

.canvas-role-node .canvas-context-menu.anchored.right {
  left: calc(100% + 33px);
}

.canvas-role-node .canvas-context-menu.anchored.left {
  right: calc(100% + 33px);
}

.canvas-scene-node .canvas-context-menu.anchored {
  top: 206px;
  font-family: var(--font-body);
}

.canvas-scene-node .canvas-context-menu.anchored.right {
  left: calc(100% + 32px);
}

.canvas-scene-node .canvas-context-menu.anchored.left {
  right: calc(100% + 32px);
}

.canvas-context-menu h3 {
  margin: 0 0 8px 10px;
  color: #8b949d;
  font-size: 14px;
  font-weight: 600;
}

.canvas-context-menu button {
  width: 100%;
  height: 40px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 14px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: #1f2429;
  cursor: pointer;
  font: 500 14px/1 var(--font-body);
  text-align: left;
}

.canvas-context-menu button:hover,
.canvas-context-menu button.selected {
  background: #f1f2f4;
}

.canvas-context-menu svg {
  flex: 0 0 18px;
}

.canvas-node-context-menu {
  position: fixed;
  z-index: 180;
  width: 220px;
  overflow: hidden;
  padding: 16px 0;
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 26px;
  background: rgba(255, 255, 255, 0.96);
  color: #202428;
  box-shadow: 0 18px 48px rgba(20, 26, 32, 0.16);
  backdrop-filter: blur(14px);
  font-family: var(--font-body);
}

.canvas-node-context-menu button {
  width: 100%;
  min-height: 46px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 20px;
  border: 0;
  background: transparent;
  color: #202428;
  cursor: pointer;
  font: 400 14px/1 var(--font-body);
  text-align: left;
}

.canvas-node-context-menu button:hover:not(:disabled) {
  background: #f0f0f0;
}

.canvas-node-context-menu button:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.canvas-node-context-menu span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.canvas-node-context-menu em {
  flex: 0 0 auto;
  color: #9aa0a6;
  font-style: normal;
}

.production-library-panel {
  top: 46px;
  left: 82px;
  width: min(464px, calc(100vw - 106px));
  height: min(572px, calc(100vh - 78px));
  display: flex;
  flex-direction: column;
  padding: 0;
  border-radius: 36px;
  overflow: hidden;
}

.production-library-panel::-webkit-scrollbar {
  width: 6px;
}

.production-library-panel::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
  border-radius: 4px;
}

.production-library-panel::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.25);
}

.production-library-tabs {
  display: flex;
  align-items: center;
  gap: 24px;
  margin-bottom: 0;
  padding: 22px 22px 0;
  flex-shrink: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.production-library-tabs::-webkit-scrollbar {
  display: none;
}

.production-library-tabs button {
  height: 31px;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 5px;
  padding: 0 2px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #8c939a;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: color 0.16s ease, border-color 0.16s ease;
}

.production-library-tabs button:hover {
  color: #30363c;
}

.production-library-tabs button.active {
  border-bottom-color: #22272c;
  color: #22272c;
}

.production-library-tabs button em {
  font-style: normal;
}

.production-library-grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-content: start;
  gap: 12px 14px;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 22px 22px 24px;
}

.production-library-grid::-webkit-scrollbar {
  width: 6px;
}

.production-library-grid::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
  border-radius: 4px;
}

.production-library-grid::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.25);
}

.production-library-grid.library-scenes {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.library-asset-card {
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  min-width: 0;
  display: block;
  appearance: none;
  -webkit-appearance: none;
  padding: 4px 4px 14px;
  border: 0;
  border-radius: 20px;
  background: #fff;
  color: #1f2429;
  text-align: left;
  cursor: pointer;
  transition: box-shadow 0.16s ease, transform 0.16s ease, background 0.16s ease;
}

.library-asset-card:hover,
.library-asset-card:focus-visible {
  z-index: 3;
  background: #fff;
  box-shadow: 4px 4px 18px rgba(28, 34, 40, 0.10);
  outline: 0;
  transform: translateY(-1px);
}

.library-asset-preview {
  box-sizing: border-box;
  width: 100%;
  aspect-ratio: 1 / 0.92;
  height: auto;
  display: grid;
  place-items: center;
  margin: 0 0 10px;
  border-radius: 17px;
  background: #f0f0f0;
  color: #d6dbe0;
  overflow: hidden;
}

.library-asset-preview img {
  width: 100%;
  height: 100%;
  display: block;
  border-radius: inherit;
  object-fit: cover;
}

.library-scenes .library-asset-preview {
  aspect-ratio: 16 / 9;
}

.library-asset-card strong,
.library-asset-card span {
  display: block;
  padding: 0 10px;
}

.library-asset-card strong {
  overflow: hidden;
  color: #1f2429;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.library-asset-card span {
  margin-top: 7px;
  color: #8c939a;
  font-size: 11.5px;
  font-weight: 600;
}

/* Objects & Media Tabs Specific Styles */
.library-objects .library-asset-card,
.library-media .library-asset-card {
  background: transparent;
  padding: 0;
}

.library-objects .library-asset-card:hover,
.library-objects .library-asset-card:focus-visible,
.library-media .library-asset-card:hover,
.library-media .library-asset-card:focus-visible {
  background: transparent;
  box-shadow: none;
}

.library-objects .library-asset-preview,
.library-media .library-asset-preview {
  aspect-ratio: 1 / 1;
  border-radius: 14px;
  margin-bottom: 8px;
}

.library-objects .library-asset-card strong,
.library-media .library-asset-card strong {
  padding: 0 4px;
  font-size: 12.5px;
  font-weight: 500;
}

.library-objects .library-asset-card span,
.library-media .library-asset-card span {
  display: none;
}

.library-inline-create .library-create-preview {
  background: #fff;
}

.library-inline-create strong {
  color: #8c939a !important;
}

.dashed-circle {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border: 1.5px dashed #bfc4c8;
  border-radius: 50%;
  color: #939aa1;
}

.library-create-wrapper {
  position: relative;
  width: 100%;
  z-index: 10;
}

.library-inline-create {
  width: 100%;
}

.dropdown-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 59;
}

.library-create-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 60;
  display: flex;
  flex-direction: column;
  width: 260px;
  padding: 8px 0;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.08);
  border: 1px solid rgba(0, 0, 0, 0.04);
}

.library-create-dropdown button {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 18px;
  border: 0;
  background: transparent;
  color: #1f2429;
  font-size: 13.5px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;
}

.library-create-dropdown button:hover {
  background: rgba(0, 0, 0, 0.04);
}

.library-create-dropdown button svg {
  color: #4a5157;
}


@media (max-width: 620px) {
  .production-library-panel {
    top: 80px;
    left: 16px;
    width: calc(100vw - 32px);
    height: min(560px, calc(100vh - 112px));
    padding: 0;
    border-radius: 30px;
  }

  .production-library-tabs {
    gap: 18px;
    padding: 20px 18px 0;
    margin-bottom: 0;
  }

  .production-library-grid,
  .production-empty-library {
    padding: 20px 18px 22px;
  }

  .production-library-grid,
  .production-library-grid.library-scenes {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.production-empty-library {
  position: relative;
  flex: 1;
  display: grid;
  grid-template-rows: auto 1fr;
  align-items: start;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 22px 22px 24px;
}

.library-create-card {
  width: 132px;
  height: 132px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 14px;
  background: #fff;
  color: #939aa1;
  cursor: pointer;
}

.library-create-card svg {
  width: 38px;
  height: 38px;
  padding: 8px;
  border: 1px dashed #bfc4c8;
  border-radius: 50%;
}

.production-empty-library > span {
  margin: 10px 0 0 8px;
  color: #858c93;
  font-size: 13px;
}

.production-empty-library > div {
  align-self: center;
  justify-self: center;
  max-width: 300px;
  margin-top: 130px;
  text-align: center;
}

.production-empty-library h2 {
  margin: 0 0 12px;
  color: #242a2f;
  font-size: 20px;
  font-weight: 600;
}

.production-empty-library p {
  margin: 0;
  color: #969da4;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.45;
}

.production-canvas-board {
  position: relative;
  width: 3720px;
  min-height: 1560px;
  margin: 72px 0 120px 88px;
  transform-origin: top left;
  transition: none;
  will-change: transform;
  z-index: 1;
  isolation: isolate;
}

.canvas-connection-layer {
  position: absolute;
  inset: 0;
  z-index: 4;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}

.canvas-connection-layer.elevated {
  z-index: 70;
}

.canvas-connection {
  pointer-events: stroke;
  cursor: pointer;
}

.canvas-connection-layer path.visible {
  fill: none;
  stroke: rgba(76, 91, 108, 0.58);
  stroke-width: 2;
  stroke-linecap: round;
  filter: none;
  pointer-events: none;
}

.canvas-connection-layer path.hit {
  fill: none;
  stroke: transparent;
  stroke-width: 18;
  stroke-linecap: round;
  pointer-events: stroke;
}

.canvas-connection.hovered:not(.selected) path.visible {
  stroke: #8c63ff;
  stroke-width: 2.4;
  stroke-dasharray: none;
}

.canvas-connection.selected path.visible {
  stroke: #8c63ff;
  stroke-width: 2.4;
  stroke-dasharray: 7 8;
  filter: none;
}

.canvas-connection-layer path.flow-line {
  fill: none;
  stroke: #3b82f6;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-dasharray: 8 12;
  pointer-events: none;
  opacity: 0;
}

.canvas-connection.active-flow path.flow-line {
  opacity: 1;
  animation: canvas-connection-flow 0.8s linear infinite;
  filter: drop-shadow(0 0 3px rgba(59, 130, 246, 0.55));
}

@keyframes canvas-connection-flow {
  from {
    stroke-dashoffset: 20;
  }
  to {
    stroke-dashoffset: 0;
  }
}

.canvas-connection .edit-point {
  fill: #fff;
  stroke-width: 2;
  pointer-events: none;
}

.canvas-connection .edit-point.start {
  stroke: #34d172;
}

.canvas-connection .edit-point.end {
  stroke: #8c63ff;
}

.canvas-connection-layer path.preview {
  fill: none;
  stroke: rgba(176, 202, 232, 0.8);
  stroke-width: 3;
  stroke-linecap: round;
  filter: drop-shadow(0 4px 8px rgba(105, 149, 210, 0.16));
  pointer-events: none;
}

.canvas-connection-cut {
  position: absolute;
  z-index: 71;
  height: 36px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 12px;
  border: 1px solid rgba(22, 28, 34, 0.08);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.96);
  color: #343a42;
  cursor: pointer;
  font: 600 13px/1 var(--font-body);
  box-shadow: 0 10px 24px rgba(25, 33, 42, 0.14);
  backdrop-filter: blur(12px);
  transition: transform 0.14s ease, box-shadow 0.14s ease, background 0.14s ease, color 0.14s ease;
}

.canvas-connection-cut:hover {
  background: #fff;
  color: #11161c;
  box-shadow: 0 14px 30px rgba(25, 33, 42, 0.18);
}

.canvas-role-cluster,
.canvas-scene-cluster {
  position: static;
}

.canvas-node {
  position: absolute;
  z-index: 3;
  cursor: grab;
  user-select: none;
  touch-action: none;
}

.canvas-node:active {
  cursor: grabbing;
}

.canvas-scene-node {
  position: absolute;
}

.canvas-node header {
  height: 26px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: #7f8891;
  font-size: 14px;
  font-weight: 600;
}

.canvas-node-card {
  position: relative;
  width: 340px;
  min-height: 418px;
  padding: 16px;
  border: 1px solid rgba(0, 0, 0, 0.10);
  border-radius: 32px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.04);
}

.canvas-role-node.enlarged .canvas-node-card {
  width: 320px;
  min-height: 386px;
  padding: 4px;
  border-radius: 36px;
  background: rgba(255, 255, 255, 0.72);
}

.canvas-role-node.enlarged {
  grid-column: span 1;
}

.canvas-node-preview {
  height: 296px;
  display: grid;
  place-items: center;
  border-radius: 28px;
  background: #eceff1;
  color: #d3d9de;
}

.canvas-node-card.generating .canvas-node-preview {
  position: relative;
  overflow: hidden;
  background:
    linear-gradient(115deg, rgba(150, 125, 255, 0.45), rgba(205, 239, 255, 0.72) 46%, rgba(255, 255, 255, 0.42) 64%, rgba(176, 145, 255, 0.42)),
    radial-gradient(circle at 12% 8%, rgba(116, 174, 255, 0.52), transparent 42%),
    radial-gradient(circle at 6% 100%, rgba(203, 90, 232, 0.5), transparent 36%);
}

.canvas-node-card.generating .canvas-node-preview::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.24) 46%, transparent 70%);
  animation: canvas-generating-sheen 1.8s ease-in-out infinite;
}

.canvas-generating-preview {
  position: relative;
  z-index: 1;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: #fff;
  text-shadow: 0 1px 12px rgba(22, 35, 56, 0.28);
}

.canvas-generating-preview strong {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

@keyframes canvas-generating-sheen {
  0% { transform: translateX(-55%); opacity: 0.38; }
  50% { opacity: 0.72; }
  100% { transform: translateX(55%); opacity: 0.38; }
}

.canvas-role-node.enlarged .canvas-node-preview {
  height: 298px;
  border-radius: 28px;
}

.canvas-role-node .canvas-node-card {
  width: 320px;
  min-height: 386px;
  padding: 3px;
  border: 1px solid rgba(255, 255, 255, 0.92);
  border-radius: 36px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: none;
}

.canvas-role-node .canvas-node-preview {
  height: 298px;
  border-radius: 28px;
  background: #e6e8ea;
  color: #cbd0d4;
  overflow: hidden;
}

.canvas-role-node .canvas-node-preview > svg {
  width: 32px;
  height: 32px;
  opacity: 0.78;
}

.canvas-role-node .canvas-node-preview img {
  width: 100%;
  height: 100%;
  display: block;
  border-radius: inherit;
  object-fit: cover;
}

.canvas-main-pill {
  position: absolute;
  top: 20px;
  left: 20px;
  z-index: 2;
  padding: 9px 18px;
  border-radius: 999px;
  background: #9cffd6;
  color: #0b4e32;
  font-size: 14px;
  font-weight: 600;
}

.canvas-node-card p {
  display: flex;
  gap: 7px;
  min-width: 0;
  margin: 16px 0 8px;
  color: #22282e;
  font-size: 14px;
  line-height: 1.25;
}

.canvas-role-node.enlarged .canvas-node-card p {
  margin: 16px 12px 7px;
  font-size: 14px;
}

.canvas-role-node .canvas-node-card p {
  align-items: center;
  gap: 11px;
  margin: 16px 12px 7px;
  padding-right: 30px;
}

.canvas-role-node .canvas-node-card p strong {
  min-width: 0;
  flex: 1 1 auto;
}

.canvas-role-node .canvas-node-card p em {
  flex: 0 0 auto;
}

.canvas-node-card strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.canvas-node-card em {
  color: #ff6b1a;
  font-style: normal;
  white-space: nowrap;
}

.canvas-node-card small {
  display: block;
  color: #a0a7ae;
  font-size: 13px;
}

.canvas-role-node.enlarged .canvas-node-card small {
  font-size: 13px;
}

.canvas-role-node .canvas-node-card small {
  margin: 0 12px;
}

.canvas-role-node .canvas-node-card > .canvas-node-options {
  right: 12px;
  bottom: 40px;
}

.canvas-role-node .canvas-side-add.left {
  left: -47px;
}

.canvas-role-node .canvas-side-add.right {
  right: -47px;
}

.canvas-role-node .canvas-side-add {
  top: 219px;
}

.canvas-node-card > button {
  position: absolute;
  right: 8px;
  bottom: 8px;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  opacity: 0.58;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #6f767d;
  cursor: pointer;
}

.canvas-node-card:hover > button {
  opacity: 1;
  color: #111;
}

.canvas-role-node .canvas-node-card > .canvas-node-options {
  right: 8px;
  bottom: 46px;
  width: 28px;
  height: 28px;
  opacity: 0.58;
  background: transparent;
  color: #6f767d;
  transition: background 0.14s ease, color 0.14s ease, opacity 0.14s ease, transform 0.14s ease;
}

.canvas-role-node .canvas-node-card:hover > .canvas-node-options {
  opacity: 0.58;
  background: transparent;
  color: #6f767d;
  transform: none;
}

.canvas-role-node .canvas-node-card.uploading .canvas-node-preview,
.canvas-scene-node .canvas-node-card.uploading .canvas-node-preview {
  opacity: 0.62;
}

.canvas-role-node .canvas-node-card > .canvas-media-replace,
.canvas-role-node .canvas-node-card > .canvas-media-library-button,
.canvas-scene-node .canvas-node-card > .canvas-media-library-button {
  top: 16px;
  bottom: auto;
  width: 34px;
  height: 34px;
  opacity: 0;
  border: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(255, 255, 255, 0.94);
  color: #22282e;
  pointer-events: none;
  box-shadow: 0 5px 16px rgba(20, 25, 30, 0.10);
  transform: scale(0.94);
  transition: opacity 0.16s ease, background 0.14s ease, transform 0.16s ease;
}

.canvas-role-node .canvas-node-card > .canvas-media-replace,
.canvas-scene-node .canvas-node-card > .canvas-scene-replace {
  right: 16px;
}

.canvas-role-node .canvas-node-card > .canvas-media-library-button,
.canvas-scene-node .canvas-node-card > .canvas-media-library-button {
  right: 58px;
}

.canvas-role-node .canvas-node-card:hover > .canvas-media-replace,
.canvas-role-node .canvas-node-card:hover > .canvas-media-library-button,
.canvas-role-node .canvas-node-card > .canvas-media-replace:focus-visible,
.canvas-role-node .canvas-node-card > .canvas-media-library-button:focus-visible,
.canvas-scene-node .canvas-node-card:hover > .canvas-media-library-button,
.canvas-scene-node .canvas-node-card > .canvas-media-library-button:focus-visible {
  opacity: 1;
  pointer-events: auto;
  transform: scale(1);
}

.canvas-role-node .canvas-node-card > .canvas-media-replace:hover,
.canvas-role-node .canvas-node-card > .canvas-media-library-button:hover,
.canvas-scene-node .canvas-node-card > .canvas-media-library-button:hover {
  opacity: 1;
  background: #fff;
  color: #111;
  transform: scale(1.06);
}

.canvas-role-node .canvas-node-card > .canvas-node-options:hover,
.canvas-role-node .canvas-node-card > .canvas-node-options:focus-visible {
  opacity: 1;
  background: rgba(20, 25, 30, 0.09);
  color: #111;
  transform: scale(1.06);
  outline: none;
}

.canvas-role-editor-panel {
  position: absolute;
  top: 42px;
  left: calc(100% - 6px);
  z-index: 120;
  width: 480px;
  padding: 32px 30px 30px;
  border: 1px solid rgba(0, 0, 0, 0.07);
  border-radius: 32px;
  background: rgba(247, 247, 247, 0.98);
  color: #1f252a;
  cursor: default;
  box-shadow: 0 20px 54px rgba(20, 26, 32, 0.14);
  font-family: var(--font-body);
}

.canvas-role-editor-panel.left {
  right: calc(100% - 6px);
  left: auto;
}

.canvas-role-editor-panel.right {
  right: auto;
}

.canvas-role-editor-panel label {
  position: relative;
  display: block;
  margin: 0 0 18px;
}

.canvas-role-editor-panel label > span {
  display: block;
  margin: 0 0 10px;
  color: #8a939b;
  font-size: 14px;
  font-weight: 600;
}

.canvas-role-editor-input {
  height: 44px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  border: 1px solid #dedede;
  border-radius: 999px;
  background: #f9f9f9;
}

.canvas-role-editor-input.has-select {
  background: #e9e9eb;
}

.canvas-role-editor-input.locked,
.canvas-role-editor-input.locked input {
  cursor: not-allowed;
}

.canvas-role-editor-input.locked input {
  color: #202428;
}

.canvas-role-editor-input.locked em,
.canvas-role-editor-input.locked svg {
  opacity: 0.72;
}

.canvas-role-editor-input input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: #202428;
  font: 400 14px/1 var(--font-body);
}

.canvas-role-editor-input select {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  appearance: none;
  background: transparent;
  color: #202428;
  cursor: pointer;
  font: 400 14px/1 var(--font-body);
}

.canvas-role-editor-input em {
  color: #9aa0a6;
  font-style: normal;
  font-size: 13px;
  white-space: nowrap;
}

.canvas-role-editor-input svg {
  flex: 0 0 auto;
  color: #9aa0a6;
}

.canvas-scene-editor-field {
  z-index: 1;
}

.canvas-scene-editor-field:has(.canvas-scene-editor-dropdown) {
  z-index: 5;
}

.canvas-scene-editor-select {
  width: 100%;
  justify-content: flex-start;
  border-radius: 999px;
  cursor: pointer;
  text-align: left;
}

.canvas-scene-editor-select strong {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: #202428;
  font-size: 14px;
  font-weight: 400;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.canvas-scene-editor-select em {
  color: #151515;
  font-size: 12px;
  opacity: 1;
}

.canvas-scene-editor-select.open svg {
  transform: rotate(180deg);
}

.canvas-scene-editor-dropdown {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 10px);
  z-index: 40;
  max-height: 246px;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 12px 0;
  border: 1px solid #e5e5e5;
  border-radius: 26px;
  background: #fff;
  box-shadow: 0 18px 38px rgba(20, 26, 32, 0.12);
}

.canvas-scene-editor-dropdown.name-dropdown {
  border-top-left-radius: 18px;
  border-top-right-radius: 18px;
}

.canvas-scene-editor-dropdown.episode-dropdown {
  border-radius: 22px;
}

.canvas-scene-editor-dropdown::-webkit-scrollbar {
  width: 5px;
}

.canvas-scene-editor-dropdown::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: #d2d6da;
}

.canvas-scene-editor-dropdown button {
  width: 100%;
  min-height: 37px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 24px;
  border: 0;
  background: transparent;
  color: #202428;
  cursor: pointer;
  font: 400 14px/1 var(--font-body);
  text-align: left;
}

.canvas-scene-editor-dropdown button:first-child {
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}

.canvas-scene-editor-dropdown button:last-child {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}

.canvas-scene-editor-dropdown button:hover,
.canvas-scene-editor-dropdown button.selected {
  background: #efefef;
}

.canvas-scene-editor-dropdown.episode-dropdown {
  padding: 12px 0 14px;
  background: #fff;
}

.canvas-scene-editor-dropdown.episode-dropdown button {
  min-height: 36px;
  gap: 12px;
  padding: 0 28px;
  border-radius: 0;
  background: transparent;
  font-size: 15px;
}

.canvas-scene-editor-dropdown.episode-dropdown button:hover,
.canvas-scene-editor-dropdown.episode-dropdown button.selected,
.canvas-scene-editor-dropdown.episode-dropdown button.selected:hover {
  background: #f0f0f0;
}

.scene-editor-check {
  width: 15px;
  height: 15px;
  display: grid;
  place-items: center;
  flex: 0 0 15px;
  border-radius: 4px;
  background: #6b4eff;
  color: #fff;
}

.canvas-scene-editor-dropdown.episode-dropdown button:not(.selected) .scene-editor-check {
  background: #e4e6e8;
}

.canvas-role-editor-panel footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}

.canvas-role-editor-panel footer button {
  min-width: 140px;
  height: 44px;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  font: 500 14px/1 var(--font-body);
}

.canvas-role-editor-cancel {
  background: #e9ecef;
  color: #202428;
}

.canvas-role-editor-save {
  background: #151515;
  color: #fff;
}

.canvas-role-editor-panel footer button:hover {
  filter: brightness(0.97);
}

.canvas-node.linking .canvas-node-card {
  border-color: #8157ff;
  box-shadow: 0 0 0 4px rgba(129, 87, 255, 0.25), 0 16px 32px rgba(0, 0, 0, 0.08);
}

.production-canvas-main {
  overflow: auto;
  scrollbar-width: none;
}

.production-canvas-main::-webkit-scrollbar {
  display: none;
}

.canvas-scene-group-backdrop {
  position: absolute;
  z-index: 0;
  border-radius: 24px;
  background: rgba(199, 203, 206, 0.42);
  pointer-events: none;
}

.canvas-scene-node .canvas-node-card {
  width: 420px;
  min-height: 327px;
  padding: 4px;
  border: 1px solid rgba(255, 255, 255, 0.92);
  border-radius: 30px;
  background: rgba(245, 246, 247, 0.78);
  box-shadow: none;
}

.canvas-asset-node .canvas-node-card {
  width: 300px;
  min-height: 234px;
  padding: 12px;
  border-color: rgba(255, 255, 255, 0.92);
  border-radius: 18px;
}

.canvas-asset-node:has(.canvas-media-card) {
  width: 480px;
}

.canvas-asset-node:has(.canvas-media-card) .canvas-side-add {
  top: 240px;
  background: rgba(246, 247, 248, 0.96);
  box-shadow: none;
}

.canvas-media-label {
  position: absolute;
  left: 2px;
  bottom: calc(100% + 1px);
  z-index: 7;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #777d82;
  cursor: grab;
  font: 400 13px/1.2 var(--font-body);
}

.canvas-media-label:active {
  cursor: grabbing;
}

.canvas-media-actions {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 25px);
  z-index: 8;
  display: inline-flex;
  align-items: center;
  min-height: 48px;
  padding: 7px 11px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 999px;
  background: rgba(250, 250, 250, 0.96);
  box-shadow: 0 2px 9px rgba(25, 33, 42, 0.04);
  transform: translateX(-50%);
  white-space: nowrap;
}

.canvas-media-actions button {
  height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 9px;
  border: 0;
  background: transparent;
  color: #2e3236;
  cursor: pointer;
  font: 400 14px/1 var(--font-body);
}

.canvas-media-actions button:hover {
  color: #11161c;
}

.canvas-media-actions button:disabled {
  opacity: 0.52;
  cursor: wait;
}

.canvas-role-node > .canvas-media-actions,
.canvas-scene-node > .canvas-media-actions {
  width: 360px;
  min-height: 46px;
  top: -54px;
  bottom: auto;
  justify-content: center;
  gap: 2px;
  padding: 6px 10px;
  border-color: rgba(0, 0, 0, 0.08);
  background: rgba(250, 250, 250, 0.97);
  box-shadow: 0 2px 7px rgba(25, 33, 42, 0.04);
}

.canvas-scene-node > .canvas-media-actions {
  width: 362px;
}

.canvas-role-node > .canvas-media-actions button,
.canvas-scene-node > .canvas-media-actions button {
  height: 32px;
  gap: 7px;
  padding: 0 8px;
  color: #34383c;
  font-size: 14px;
  font-weight: 600;
}

.canvas-role-node > .canvas-media-actions button svg,
.canvas-scene-node > .canvas-media-actions button svg {
  width: 18px;
  height: 18px;
  stroke-width: 2.25;
}

.canvas-asset-node .canvas-node-card.canvas-media-card {
  width: 480px;
  min-height: 372px;
  padding: 0;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.92);
  border-radius: 36px;
  background: rgba(248, 248, 248, 0.52);
  box-shadow: none;
}

.canvas-node.active .canvas-node-card,
.canvas-asset-node.active .canvas-node-card.canvas-media-card {
  border-color: #8f969c;
  box-shadow: none;
}

.canvas-asset-node .canvas-media-card .canvas-node-preview {
  width: 100%;
  height: 372px;
  border-radius: 35px;
  background: rgba(248, 248, 248, 0.42);
  color: rgba(194, 199, 203, 0.52);
}

.canvas-asset-node .canvas-media-card .canvas-node-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.canvas-asset-node .canvas-media-card.uploading .canvas-node-preview {
  opacity: 0.62;
}

.canvas-asset-node .canvas-node-card.canvas-media-card > .canvas-media-replace,
.canvas-asset-node .canvas-node-card.canvas-media-card > .canvas-media-library-button {
  top: 12px;
  bottom: auto;
  width: 34px;
  height: 34px;
  opacity: 0;
  border: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(255, 255, 255, 0.9);
  color: #202428;
  pointer-events: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transform: scale(0.94);
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.canvas-asset-node .canvas-node-card.canvas-media-card > .canvas-media-replace {
  right: 12px;
}

.canvas-asset-node .canvas-node-card.canvas-media-card > .canvas-media-library-button {
  right: 54px;
}

.canvas-asset-node .canvas-node-card.canvas-media-card:hover > .canvas-media-replace,
.canvas-asset-node .canvas-node-card.canvas-media-card:hover > .canvas-media-library-button {
  opacity: 1;
  pointer-events: auto;
  transform: scale(1);
}

.canvas-asset-node .canvas-node-card.canvas-media-card > .canvas-media-replace:hover,
.canvas-asset-node .canvas-node-card.canvas-media-card > .canvas-media-library-button:hover {
  background: #fff;
  color: #111;
}

.canvas-asset-node .canvas-node-preview {
  height: 164px;
  border-radius: 14px;
}

.canvas-asset-node .canvas-node-card p {
  margin: 10px 0 5px;
  font-size: 12px;
}

.canvas-asset-node .canvas-node-card small {
  font-size: 10px;
}

.canvas-scene-node .canvas-node-preview {
  height: 239px;
  border-radius: 26px;
  background: #dde0e2;
  color: #c7cdd2;
  overflow: hidden;
}

.canvas-scene-node .canvas-node-preview img {
  width: 100%;
  height: 100%;
  display: block;
  border-radius: inherit;
  object-fit: contain;
}

.canvas-scene-node .canvas-node-card p {
  align-items: center;
  gap: 11px;
  margin: 16px 14px 7px;
  padding-right: 30px;
  font-size: 14px;
}

.canvas-scene-node .canvas-node-card p strong {
  min-width: 0;
  flex: 1 1 auto;
}

.canvas-scene-node .canvas-node-card p em {
  flex: 0 0 auto;
}

.canvas-scene-node .canvas-node-card small {
  margin: 0 14px;
  font-size: 13px;
}

.canvas-scene-node .canvas-node-card > .canvas-node-options {
  right: 10px;
  bottom: 45px;
  width: 28px;
  height: 28px;
  opacity: 0.58;
  background: transparent;
  color: #6f767d;
  transition: background 0.14s ease, color 0.14s ease, opacity 0.14s ease, transform 0.14s ease;
}

.canvas-scene-node .canvas-node-card:hover > .canvas-node-options {
  opacity: 0.58;
  background: transparent;
  color: #6f767d;
  transform: none;
}

.canvas-scene-node .canvas-node-card > .canvas-node-options:hover,
.canvas-scene-node .canvas-node-card > .canvas-node-options:focus-visible {
  opacity: 1;
  background: rgba(20, 25, 30, 0.09);
  color: #111;
  transform: scale(1.06);
  outline: none;
}

.canvas-scene-node .canvas-node-card > .canvas-scene-replace {
  top: 16px;
  right: 16px;
  bottom: auto;
  width: 34px;
  height: 34px;
  opacity: 0;
  background: rgba(255, 255, 255, 0.94);
  color: #22282e;
  box-shadow: 0 5px 16px rgba(20, 25, 30, 0.10);
  transition: opacity 0.14s ease, background 0.14s ease, transform 0.14s ease;
}

.canvas-scene-node .canvas-node-card:hover > .canvas-scene-replace,
.canvas-scene-node .canvas-node-card > .canvas-scene-replace:focus-visible {
  opacity: 1;
}

.canvas-scene-node .canvas-node-card > .canvas-scene-replace:hover {
  opacity: 1;
  background: #fff;
  transform: scale(1.06);
}

.canvas-scene-node .canvas-side-add {
  top: 190px;
}

.canvas-scene-node .canvas-side-add.left {
  left: -46px;
}

.canvas-scene-node .canvas-side-add.right {
  right: -46px;
}

.canvas-side-add {
  position: absolute;
  top: calc(50% + 13px);
  z-index: 6;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  opacity: 0;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: #050505;
  cursor: pointer;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.12);
  transform: translateY(-50%) scale(0.92);
  transition: opacity 0.16s ease, transform 0.16s ease, background 0.16s ease;
}

.canvas-side-add svg {
  width: 22px;
  height: 22px;
}

.canvas-side-add.left {
  left: -16px;
}

.canvas-side-add.right {
  right: -16px;
}

.canvas-node:hover .canvas-side-add {
  opacity: 1;
  transform: translateY(-50%) scale(1);
}

.canvas-side-add:hover {
  opacity: 1;
  background: #805dff;
  color: #fff;
  transform: translateY(-50%) scale(1.08);
  box-shadow: 0 10px 26px rgba(128, 93, 255, 0.38);
}

.canvas-side-add.active {
  opacity: 1;
  background: #805dff;
  color: #fff;
  transform: translateY(-50%) scale(1);
  box-shadow: 0 8px 22px rgba(128, 93, 255, 0.34);
}

.canvas-asset-node:has(.canvas-media-card) .canvas-side-add:hover,
.canvas-asset-node:has(.canvas-media-card) .canvas-side-add.active {
  background: #805dff;
  color: #fff;
  transform: translateY(-50%) scale(1.08);
  box-shadow: 0 8px 22px rgba(128, 93, 255, 0.34);
}

.media-library-overlay {
  position: fixed;
  inset: 0;
  z-index: 130;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(48, 57, 69, 0.5);
}

.media-library-modal {
  width: min(860px, calc(100vw - 48px));
  height: min(474px, calc(100vh - 48px));
  display: grid;
  grid-template-rows: 82px minmax(0, 1fr) 70px;
  overflow: hidden;
  border-radius: 12px;
  background: #fff;
  color: #252a30;
  box-shadow: 0 24px 70px rgba(20, 27, 36, 0.22);
  font-family: var(--font-body);
}

.media-library-modal > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #e7e9ec;
}

.media-library-modal h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0;
}

.media-library-modal header p {
  margin: 5px 0 0;
  color: #858c95;
  font-size: 13px;
}

.media-library-header-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.media-library-modal header > button,
.media-library-header-actions > button {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 1px solid #dfe3e8;
  border-radius: 7px;
  background: #fff;
  color: #24292f;
  cursor: pointer;
}

.media-library-select-toggle {
  width: auto !important;
  min-width: 132px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 600;
}

.media-library-select-toggle.active {
  border-color: #c7b8ff;
  background: #f4f0ff;
  color: #5b3fd6;
}

.media-library-modal header > button:hover,
.media-library-header-actions > button:hover {
  background: #f5f6f7;
}

.media-library-content {
  min-height: 0;
  overflow: auto;
  padding: 20px;
}

.media-library-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 154px);
  align-content: start;
  gap: 14px;
}

.media-library-card {
  width: 154px;
  overflow: hidden;
  padding: 7px;
  border: 2px solid transparent;
  border-radius: 8px;
  background: #f5f6f7;
  color: #252a30;
  cursor: pointer;
  text-align: left;
}

.media-library-card.selected {
  border-color: #7b5cff;
  background: #fff;
}

.media-library-card.checked {
  border-color: #7b5cff;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(123, 92, 255, 0.12);
}

.media-library-thumb {
  position: relative;
  height: 142px;
  overflow: hidden;
  border-radius: 4px;
  background: #eef0f2;
}

.media-library-thumb img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.media-library-thumb span {
  position: absolute;
  top: 7px;
  left: 7px;
  padding: 4px 6px;
  border-radius: 4px;
  background: rgba(44, 48, 53, 0.8);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
}

.media-library-check {
  position: absolute;
  right: 8px;
  top: 8px;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border: 2px solid rgba(255, 255, 255, 0.92);
  border-radius: 999px;
  background: rgba(38, 43, 51, 0.58);
  color: transparent;
  box-shadow: 0 4px 12px rgba(20, 27, 36, 0.16);
}

.media-library-card.checked .media-library-check {
  background: #7b5cff;
  color: #fff;
}

.media-library-card strong {
  display: block;
  overflow: hidden;
  margin-top: 8px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.media-library-state {
  min-height: 230px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  color: #858c95;
  font-size: 14px;
}

.media-library-state .lucide-loader-circle {
  animation: spin 0.9s linear infinite;
}

.media-library-modal > footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-top: 1px solid #e7e9ec;
}

.media-library-modal > footer > span {
  color: #666e78;
  font-size: 13px;
}

.media-library-modal > footer > div {
  display: flex;
  gap: 8px;
}

.media-library-cancel,
.media-library-confirm {
  height: 32px;
  padding: 0 15px;
  border: 1px solid #dfe3e8;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}

.media-library-cancel {
  background: #fff;
  color: #252a30;
}

.media-library-confirm {
  border-color: #7b5cff;
  background: #7b5cff;
  color: #fff;
}

.media-library-delete {
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 15px;
  border: 1px solid #efb8c2;
  border-radius: 6px;
  background: #fff1f3;
  color: #b4233c;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}

.media-library-delete:hover:not(:disabled) {
  border-color: #d92d4a;
  background: #d92d4a;
  color: #fff;
}

.media-library-confirm:disabled,
.media-library-delete:disabled {
  border-color: #c5b8ff;
  background: #c5b8ff;
  cursor: not-allowed;
}

.media-library-delete:disabled {
  border-color: #f1c9d0;
  background: #fff5f6;
  color: #cf7d8c;
}

@media (max-width: 640px) {
  .media-library-overlay {
    padding: 12px;
  }

  .media-library-modal {
    width: calc(100vw - 24px);
    height: calc(100vh - 24px);
  }

  .media-library-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .media-library-card {
    width: 100%;
  }
}

.canvas-create-node {
  z-index: 2;
  cursor: default;
}

.canvas-create-card {
  width: 340px;
  min-height: 418px;
  display: grid;
  place-items: center;
  gap: 10px;
  padding: 18px;
  border: 1px dashed rgba(0, 0, 0, 0.14);
  border-radius: 32px;
  background: rgba(255, 255, 255, 0.62);
  color: #8a9299;
  cursor: pointer;
  font: 600 15px/1.2 var(--font-body);
}

.canvas-create-card svg {
  width: 56px;
  height: 56px;
  padding: 12px;
  border-radius: 999px;
  background: #fff;
  color: #111;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
}

.canvas-create-card:hover {
  background: rgba(255, 255, 255, 0.78);
}

.canvas-generation-chat {
  position: absolute;
  left: 50%;
  bottom: auto;
  z-index: 50;
  width: min(800px, calc(100vw - 64px));
  height: min(320px, calc(100vh - 96px));
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) 48px;
  padding: 24px 20px 12px;
  border-radius: 30px;
  background: rgba(255, 255, 255, 0.96);
  color: #18202a;
  box-shadow: 0 18px 58px rgba(22, 28, 36, 0.16);
  transform: translateX(-50%);
  font-family: var(--font-body);
}

.canvas-generation-chat {
  cursor: default !important;
}

.canvas-generation-chat * {
  cursor: inherit !important;
}

.canvas-generation-chat button:not(:disabled) {
  cursor: pointer !important;
}

.canvas-generation-chat button:disabled {
  cursor: not-allowed !important;
}

.canvas-generation-chat.expanded {
  position: fixed;
  left: 50%;
  top: auto;
  bottom: 50%;
  z-index: 95;
  width: min(1140px, calc(100vw - 120px));
  height: min(580px, calc(100vh - 120px));
  padding: 14px 20px 14px;
  transform: translate(-50%, 50%);
}

.canvas-prompt-reference-row {
  position: relative;
  z-index: 4;
  grid-row: 1;
  min-height: 66px;
  display: flex;
  align-items: flex-start;
  gap: 4px;
  margin: 0 36px 6px 0;
  padding: 0 2px 4px 0;
  overflow: visible;
}

.canvas-prompt-reference-chip {
  position: relative;
  width: 74px;
  height: 66px;
  display: inline-grid;
  justify-items: start;
  align-content: start;
  flex: 0 0 74px;
  color: #a0a8b0;
  overflow: visible;
  cursor: grab !important;
}

.canvas-prompt-reference-thumb,
.canvas-prompt-reference-thumb * {
  cursor: grab !important;
}

.canvas-prompt-reference-chip:active,
.canvas-prompt-reference-chip:active .canvas-prompt-reference-thumb,
.canvas-prompt-reference-chip:active .canvas-prompt-reference-thumb * {
  cursor: grabbing !important;
}

.canvas-prompt-reference-chip > button,
.canvas-prompt-reference-chip > button * {
  cursor: pointer !important;
}
.canvas-prompt-reference-thumb {
  width: 64px;
  height: 64px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 14px;
  background: #edf0f3;
}

.canvas-prompt-reference-thumb img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.canvas-prompt-reference-chip > button:not(.canvas-prompt-reference-count) {
  position: absolute;
  top: 0;
  right: 0;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border: 2px solid #fff;
  border-radius: 999px;
  background: rgba(95, 100, 107, 0.88);
  color: #fff;
  box-shadow: 0 4px 10px rgba(26, 34, 45, 0.14);
  cursor: pointer !important;
}

.canvas-prompt-reference-chip > button:not(.canvas-prompt-reference-count):hover,
.canvas-prompt-reference-chip > button:not(.canvas-prompt-reference-count):focus-visible {
  background: rgba(75, 80, 88, 0.94);
  outline: 0;
}

.canvas-prompt-reference-count {
  position: absolute;
  top: auto;
  right: 0;
  bottom: 0;
  z-index: 2;
  width: 22px;
  min-width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 2px solid #fff;
  border-radius: 999px;
  background: rgba(95, 100, 107, 0.88);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  box-shadow: 0 4px 10px rgba(26, 34, 45, 0.14);
  cursor: pointer !important;
}

.canvas-prompt-reference-count:hover,
.canvas-prompt-reference-count:focus-visible {
  background: rgba(75, 80, 88, 0.94);
  outline: 0;
}

.canvas-reference-occurrence-popover {
  position: absolute;
  left: calc(100% + 2px);
  top: auto;
  bottom: 0;
  z-index: 20;
  width: 170px;
  display: grid;
  gap: 2px;
  padding: 6px;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid rgba(225, 229, 235, 0.96);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 14px 34px rgba(22, 29, 38, 0.16);
  user-select: none;
  -webkit-user-drag: none;
}

.canvas-reference-occurrence-popover * {
  -webkit-user-drag: none;
}

.canvas-reference-occurrence-popover::-webkit-scrollbar {
  width: 5px;
}

.canvas-reference-occurrence-popover::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: #cbd1d8;
}

.canvas-reference-occurrence-row {
  min-height: 34px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px;
  align-items: center;
  gap: 2px;
  padding: 2px 2px 2px 8px;
  border-radius: 8px;
  background: transparent;
  color: #26313d;
  cursor: default;
  user-select: none;
  -webkit-user-drag: none;
}

.canvas-reference-occurrence-row:hover {
  background: #f1f4f7;
}

.canvas-reference-occurrence-row.selected {
  background: #f1f4f7;
  color: #6049dd;
}

.canvas-reference-occurrence-row.selected:hover {
  background: #e7eaf0;
}

.canvas-reference-occurrence-row.selected .canvas-reference-occurrence-select {
  color: #6049dd;
}

.canvas-reference-occurrence-select {
  min-height: 28px;
  min-width: 0;
  overflow: hidden;
  padding: 0;
  border: 0;
  background: transparent;
  color: #26313d;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  user-select: none;
  -webkit-user-drag: none;
}

.canvas-reference-occurrence-remove {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #7a8591;
  cursor: pointer;
  user-select: none;
  -webkit-user-drag: none;
}

.canvas-reference-occurrence-remove svg {
  pointer-events: none;
}

.canvas-reference-occurrence-remove:hover,
.canvas-reference-occurrence-remove:focus-visible {
  background: #dfe4e9;
  color: #313b46;
  outline: 0;
}

.canvas-prompt-editor {
  position: relative;
  z-index: 1;
  grid-row: 2;
  width: 100%;
  min-height: 0;
  height: 100%;
  overflow: auto;
  padding: 0 34px 8px 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #151b22;
  font: 500 16px/1.44 var(--font-body);
  white-space: pre-wrap;
  cursor: text !important;
}

.canvas-prompt-editor,
.canvas-prompt-editor * {
  cursor: text !important;
}

.canvas-prompt-editor :deep(.canvas-prompt-mention-chip),
.canvas-prompt-editor :deep(.canvas-prompt-mention-chip *) {
  cursor: default !important;
}

.canvas-prompt-editor.drag-target {
  border-radius: 14px;
  background: rgba(123, 92, 255, 0.06);
  box-shadow: inset 0 0 0 1px rgba(123, 92, 255, 0.18);
}

.canvas-reference-transparent-drag {
  position: fixed;
  top: 0;
  left: 0;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.canvas-reference-drag-preview {
  position: fixed;
  z-index: 9999;
  display: inline-flex;
  align-items: center;
  max-width: 154px;
  height: 24px;
  gap: 5px;
  padding: 2px 7px 2px 3px;
  overflow: hidden;
  border-radius: 999px;
  background: #eef1f5;
  color: #4b5563;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  box-shadow: 0 12px 28px rgba(18, 25, 38, 0.22);
  pointer-events: none;
}

.canvas-reference-drag-preview > img {
  width: 20px;
  height: 20px;
  display: block;
  flex: 0 0 20px;
  border-radius: 6px;
  object-fit: cover;
}

.canvas-reference-drag-preview > svg {
  width: 20px;
  height: 20px;
  flex: 0 0 20px;
  padding: 3px;
  border-radius: 6px;
  background: #e4e8ee;
  color: #6b7683;
}

.canvas-reference-drag-preview > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.canvas-prompt-editor:empty::before {
  content: attr(data-placeholder);
  color: #9aa2ab;
}

.canvas-prompt-editor :deep(.canvas-prompt-mention-chip) {
  position: relative;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  max-width: 154px;
  height: 24px;
  gap: 5px;
  vertical-align: middle;
  margin: 0 3px;
  padding: 2px 7px 2px 3px;
  border-radius: 999px;
  background: #eef1f5;
  color: #4b5563;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  cursor: default !important;
  user-select: none;
  pointer-events: auto;
}

.canvas-prompt-editor :deep(.canvas-prompt-mention-chip.no-preview-image) {
  padding-left: 8px;
}

.canvas-prompt-editor :deep(.canvas-prompt-mention-chip.selected-occurrence) {
  background: #e4e8ff;
  color: #4936c8;
  box-shadow: inset 0 0 0 2px rgba(105, 82, 255, 0.32);
}

.canvas-prompt-editor :deep(.canvas-prompt-mention-chip > img) {
  width: 20px;
  height: 20px;
  display: block;
  border-radius: 6px;
  object-fit: cover;
  flex: 0 0 20px;
}

.canvas-prompt-editor :deep(.canvas-prompt-mention-chip > span) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.canvas-mention-hover-card {
  position: fixed;
  z-index: 160;
  width: 220px;
  min-height: 82px;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 10px;
  border: 1px solid rgba(226, 230, 235, 0.96);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.98);
  color: #171d24;
  box-shadow: 0 16px 42px rgba(24, 31, 42, 0.18);
  transform: translateX(-50%);
  pointer-events: none;
}

.canvas-mention-hover-visual {
  width: 58px;
  height: 58px;
  display: grid;
  place-items: center;
  flex: 0 0 58px;
  overflow: hidden;
  border-radius: 12px;
  background: #edf0f3;
  color: #a5adb6;
}

.canvas-mention-hover-visual img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.canvas-mention-hover-text {
  min-width: 0;
  display: grid;
  gap: 5px;
  text-align: left;
}

.canvas-mention-hover-text span {
  color: #8d97a3;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}

.canvas-mention-hover-text strong {
  overflow: hidden;
  color: #141a22;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.25;
  text-overflow: ellipsis;
}

.canvas-chat-expand {
  position: absolute;
  top: 24px;
  right: 24px;
  z-index: 8;
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #9aa2ab;
  cursor: pointer;
  pointer-events: auto;
  transition: background 0.16s ease, color 0.16s ease, transform 0.16s ease;
}

.canvas-chat-expand:hover,
.canvas-chat-expand:focus-visible {
  color: #1f2933;
  background: rgba(239, 242, 245, 0.92);
  transform: scale(1.04);
  outline: 0;
}

.canvas-chat-toolbar {
  grid-row: 3;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  color: #1f2933;
}

.canvas-chat-toolbar button {
  height: 36px;
  min-width: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex: 0 0 auto;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #1f2933;
  cursor: pointer;
  font: 600 13px/1 var(--font-body);
  letter-spacing: 0;
  white-space: nowrap;
}

.canvas-chat-toolbar button:hover,
.canvas-chat-toolbar button.active {
  background: #f1f3f5;
}

.canvas-chat-add-reference {
  background: #f4f6f8 !important;
  color: #111827 !important;
  transition: background 0.16s ease, color 0.16s ease, transform 0.16s ease;
}

.canvas-chat-add-reference:hover:not(:disabled),
.canvas-chat-add-reference:focus-visible:not(:disabled) {
  background: #e9edf2 !important;
  color: #111827 !important;
  transform: translateY(-1px);
  outline: 0;
}

.canvas-chat-style-trigger,
.canvas-chat-model-trigger,
.canvas-chat-ratio-trigger {
  padding: 0 10px;
}

.canvas-chat-style-trigger span,
.canvas-chat-model-trigger strong,
.canvas-chat-ratio-trigger {
  color: #1f2933;
}

.canvas-chat-model-trigger {
  min-width: 0;
  max-width: min(260px, 34vw);
}

.canvas-chat-model-trigger strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.canvas-chat-chevron {
  transition: transform 0.16s ease;
}

.canvas-chat-style-trigger.active .canvas-chat-chevron,
.canvas-chat-model-trigger.active .canvas-chat-chevron,
.canvas-chat-ratio-trigger.active .canvas-chat-chevron {
  transform: rotate(180deg);
}

.canvas-chat-ratio-trigger {
  min-width: 104px;
}

.canvas-chat-ratio-trigger i {
  width: 3px;
  height: 3px;
  display: inline-block;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.72;
}

.canvas-model-mark {
  width: 13px;
  height: 13px;
  flex: 0 0 13px;
  display: inline-block;
  border-left: 3px solid #1f2937;
  border-right: 3px solid #1f2937;
  border-radius: 2px;
}

.canvas-chat-spacer {
  flex: 1;
  min-width: 8px;
}

.canvas-chat-optimize {
  color: #172033;
}


.canvas-chat-send {
  width: 38px;
  height: 38px !important;
  border-radius: 999px !important;
  background: #162033 !important;
  color: #fff !important;
}

.canvas-chat-toolbar button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

@media (max-width: 760px) {
  .canvas-generation-chat {
    width: calc(100vw - 24px);
    height: 238px;
    bottom: 16px;
    grid-template-rows: auto minmax(0, 1fr) auto;
    padding: 20px 14px 12px;
  }

  .canvas-generation-chat.expanded {
    width: calc(100vw - 24px);
    height: calc(100vh - 96px);
  }

  .canvas-chat-toolbar {
    flex-wrap: wrap;
    row-gap: 6px;
  }

  .canvas-chat-model-trigger {
    order: 3;
    max-width: calc(100% - 118px);
  }

  .canvas-chat-ratio-trigger {
    order: 4;
    min-width: 96px;
  }

  .canvas-chat-spacer {
    flex-basis: 100%;
    height: 0;
  }

  .canvas-chat-optimize {
    margin-left: auto;
  }
}

.canvas-chat-popover {
  position: absolute;
  bottom: 62px;
  z-index: 30;
  border: 1px solid rgba(20, 28, 36, 0.06);
  border-radius: 22px;
  background: #fff;
  box-shadow: 0 18px 48px rgba(19, 25, 32, 0.14);
}

.canvas-chat-popover h3 {
  margin: 0 0 12px;
  color: #65707c;
  font-size: 13px;
  font-weight: 600;
}

.canvas-mention-menu {
  left: 20px;
  width: 250px;
  padding: 18px 14px 12px;
}

.canvas-inline-mention-menu {
  position: fixed;
  bottom: auto;
  z-index: 180;
  max-height: min(390px, calc(100vh - 24px));
  overflow: visible;
}

.canvas-mention-menu > button,
.canvas-model-menu > button {
  width: 100%;
  min-height: 42px;
  display: grid;
  align-items: center;
  gap: 10px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #27303a;
  cursor: pointer;
  text-align: left;
}

.canvas-mention-menu > button {
  grid-template-columns: 28px 1fr auto 16px;
}

.canvas-mention-menu > button strong {
  font-weight: 600;
}

.canvas-mention-menu > button:hover,
.canvas-model-menu > button:hover,
.canvas-model-menu > button.selected {
  background: #f3f5f7;
}

.canvas-mention-menu button span:first-child {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: #f4f6f8;
}

.canvas-mention-menu button em {
  color: #607086;
  font-size: 11px;
  font-style: normal;
}

.canvas-mention-recents {
  display: grid;
  gap: 6px;
  margin: 0 0 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid #eef0f3;
}

.canvas-mention-recents button {
  width: 100%;
  min-height: 42px;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 5px 8px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #172033;
  cursor: pointer;
  text-align: left;
}

.canvas-mention-recents button:hover {
  background: #f4f6f8;
}

.canvas-mention-recents button.active {
  background: #f4f6f8;
}

.canvas-mention-recents.inline-results {
  max-height: 312px;
  overflow: auto;
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: 0;
}

.canvas-mention-recents.inline-results p {
  margin: 2px 8px 6px;
  color: #8a95a3;
  font-size: 12px;
  font-weight: 600;
}

.canvas-mention-recents strong {
  min-width: 0;
  overflow: hidden;
  color: #1f2933;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}


.canvas-mention-items {
  position: absolute;
  top: 34px;
  left: calc(100% + 8px);
  width: 264px;
  max-height: 292px;
  overflow: auto;
  margin-top: 0;
  padding: 10px;
  border: 1px solid rgba(20, 28, 36, 0.08);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 16px 42px rgba(19, 25, 32, 0.14);
}

.canvas-mention-items button {
  width: 100%;
  min-height: 44px;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: #172033;
  cursor: pointer;
  text-align: left;
}

.canvas-mention-items button:hover {
  background: #f4f6f8;
}

.canvas-mention-recents button .canvas-mention-thumb,
.canvas-mention-items button .canvas-mention-thumb {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 8px;
  background: #eef1f4;
  color: #607083;
}

.canvas-mention-recents button .canvas-mention-thumb img,
.canvas-mention-items button .canvas-mention-thumb img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.canvas-mention-items strong {
  min-width: 0;
  overflow: hidden;
  color: #1f2933;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 760px) {
  .canvas-mention-items {
    position: static;
    width: 100%;
    max-height: 180px;
    margin-top: 8px;
  }
}
.canvas-model-menu {
  left: 176px;
  width: 400px;
  display: grid;
  gap: 6px;
  padding: 14px;
}

.canvas-model-menu > button {
  grid-template-columns: 24px 1fr 20px;
  padding: 10px 14px;
}

.canvas-model-menu > button strong,
.canvas-model-menu > button small {
  grid-column: 2;
}

.canvas-model-menu > button small {
  margin-top: -4px;
  color: #617087;
  font-size: 11px;
}

.canvas-model-menu > button > svg {
  grid-column: 3;
  grid-row: 1 / span 2;
  color: #6e4cff;
}

.canvas-ratio-menu {
  right: 84px;
  width: 440px;
  padding: 18px 16px 14px;
}

.canvas-resolution-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-bottom: 16px;
}

.canvas-resolution-row button,
.canvas-ratio-grid button {
  min-height: 36px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  color: #252b33;
  cursor: pointer;
  font-weight: 600;
}

.canvas-resolution-row button.selected,
.canvas-ratio-grid button.selected {
  border-color: #a385ff;
  background: #f2edff;
  color: #27203a;
}

.canvas-ratio-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.canvas-ratio-grid button {
  position: relative;
  min-height: 70px;
  display: grid;
  place-items: center;
  gap: 6px;
}

.canvas-ratio-shape {
  width: 25px;
  height: 16px;
  display: block;
  border: 2px solid #71757a;
  border-radius: 3px;
}

.canvas-ratio-shape.ratio-9-16,
.canvas-ratio-shape.ratio-3-4 {
  width: 14px;
  height: 28px;
}

.canvas-ratio-shape.ratio-1-1 {
  width: 20px;
  height: 20px;
}

.canvas-ratio-grid svg {
  position: absolute;
  top: 9px;
  right: 9px;
  color: #7b5cff;
}

.canvas-role-cluster .canvas-create-node {
  left: 1130px;
  top: 52px;
}

.canvas-bottom-tools {
  position: fixed;
  left: 16px;
  cursor: default;
  bottom: 18px;
  z-index: 55;
  height: 48px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.11);
  cursor: default;
}

.canvas-bottom-tools button {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #1e2429;
  cursor: pointer;
  font-size: 18px;
}

.canvas-bottom-tools button.active,
.canvas-bottom-tools button:hover:not(:disabled) {
  background: #edf0f2;
}

.canvas-bottom-tools button:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}

.canvas-bottom-tools span {
  width: 1px;
  height: 20px;
  background: #d8dde1;
  cursor: default;
}

.canvas-bottom-tools strong {
  min-width: 42px;
  text-align: center;
  color: #1f252a;
  font-size: 13px;
  font-weight: 600;
  cursor: default;
}

.screen-shell .production-assets-status {
  display: none !important;
}

/* Professional typography pass */
.agent-shell,
.production-canvas-main,
.production-assets-main {
  font-size: var(--type-base);
  line-height: var(--leading-ui);
}

.agent-logo,
.agent-step strong,
.agent-step span,
.production-tabs button,
.asset-card h3,
.canvas-node-card strong,
.canvas-chat-model strong,
.canvas-model-menu > button strong,
.canvas-reference-occurrence-button,
.canvas-mention-menu button,
.media-library-title {
  font-weight: var(--weight-semibold);
}

.screen-topbar-left,
.agent-control-trigger,
.canvas-bottom-tools,
.canvas-media-actions button,
.canvas-context-menu button,
.canvas-chat-toolbar,
.canvas-chat-select,
.canvas-node-card p,
.canvas-node-card small {
  font-size: var(--type-md);
  line-height: var(--leading-ui);
}

.agent-logo,
.production-assets-title,
.media-library-title,
.canvas-chat-style-menu h3,
.canvas-model-menu h3,
.canvas-ratio-menu h3 {
  font-family: var(--font-display);
  font-weight: var(--weight-semibold);
  letter-spacing: 0;
}

.production-assets-title,
.media-library-title {
  font-size: var(--type-xl);
}

.canvas-node header,
.canvas-media-label {
  font-size: var(--type-md);
  font-weight: var(--weight-medium);
  color: #7c858d;
}

.canvas-node-card p {
  font-size: 13.5px;
  font-weight: var(--weight-regular);
}

.canvas-node-card strong {
  font-size: 13.5px;
  letter-spacing: 0;
}

.canvas-node-card em,
.canvas-node-card small,
.asset-card > p,
.production-assets-subtitle,
.media-library-subtitle {
  font-size: var(--type-sm);
  font-weight: var(--weight-regular);
}

.canvas-main-pill {
  font-size: var(--type-md);
  font-weight: var(--weight-semibold);
}

.canvas-generation-chat {
  font-size: var(--type-base);
  line-height: var(--leading-copy);
}

.canvas-prompt-editor {
  font-size: 15px;
  line-height: 1.58;
  font-weight: var(--weight-regular);
}

.canvas-chat-send,
.canvas-resolution-row button,
.canvas-ratio-grid button {
  font-weight: var(--weight-semibold);
}

.canvas-chat-optimize,
.canvas-reference-count,
.canvas-prompt-reference-count {
  font-weight: var(--weight-medium);
}

@keyframes shimmer {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}

@media (max-width: 760px) {
  .story-topbar {
    height: auto;
    padding: 16px;
    column-gap: 28px;
    align-items: flex-start;
  }

  .story-account {
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

.story-main {
    padding: 8px 16px 86px;
  }

  .story-hero {
    padding-bottom: 24px;
  }

  .story-hero h1 {
    font-size: 26px;
  }

  .composer-tabs {
    height: auto;
    grid-template-columns: 1fr;
    border-radius: 22px 22px 0 0;
  }

  .composer-tab {
    min-height: 40px;
    border-radius: 18px;
  }

  .upload-actions,
  .ai-controls,
  .screen-builder,
  .composer-note {
    flex-direction: column;
    align-items: stretch;
  }

  .generate-button {
    width: 100%;
    margin-left: 0;
  }

  .composer-note {
    gap: 8px;
  }

  .skip-analysis-link {
    padding-left: 0;
    border-left: 0;
  }

  .projects-section {
    max-width: 100%;
  }

  .projects-grid {
    grid-template-columns: 1fr;
  }

  .paste-modal {
    min-height: min(620px, calc(100vh - 48px));
    padding: 24px;
  }

  .delete-confirm-modal {
    width: calc(100vw - 24px);
    min-height: 0;
    padding: 32px 24px 24px;
    border-radius: 22px;
  }

  .delete-confirm-modal h2 {
    font-size: 22px;
  }

  .delete-confirm-modal p {
    margin-top: 24px;
    font-size: 15px;
  }

  .delete-confirm-modal footer {
    gap: 12px;
    margin-top: 32px;
  }

  .delete-cancel-button,
  .delete-confirm-button {
    min-width: 0;
    flex: 1;
  }

  .style-library-overlay {
    padding: 12px;
    align-items: center;
  }

  .style-library-panel {
    width: calc(100vw - 24px);
    height: calc(100vh - 24px);
    padding: 18px 18px 22px;
    border-radius: 24px;
  }

  .style-category-row {
    width: 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .style-card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-content: start;
    height: 100%;
  }

  .style-scroll-cue {
    right: -12px;
    height: 100%;
  }

  .selection-bar {
    width: calc(100vw - 28px);
    justify-content: center;
    flex-wrap: wrap;
    border-radius: 24px;
  }

  .agent-main {
    width: calc(100vw - 24px);
    padding-top: 32px;
  }

  .agent-title-row {
    align-items: flex-start;
    flex-direction: column;
    column-gap: 28px;
  }

  .episode-batch-actions {
    width: 100%;
    flex-wrap: wrap;
  }

  .episode-batch-actions > button {
    min-width: 0;
    flex: 1 1 128px;
  }

  .script-card-scroll {
    padding: 36px 24px 116px;
  }

  .script-summary-readonly-grid {
    grid-template-columns: 1fr;
    gap: 22px;
    margin-left: 0;
  }

  .script-summary-readonly-copy {
    margin-left: 0;
  }

  .episode-outline-list {
    padding-left: 0;
  }

  .agent-status-bar.episodes-ready {
    width: calc(100vw - 24px);
    grid-template-columns: 24px 1fr;
    border-radius: 24px;
  }

  .agent-status-bar.episodes-ready button {
    width: 100%;
    grid-column: span 1;
  }
}

@media (min-width: 761px) and (max-width: 1260px) {

.story-main {
    padding-right: 24px;
    padding-left: 24px;
  }
}

.shortcuts-overlay {
  z-index: 100;
  display: grid;
  place-items: center;
}

.shortcuts-modal {
  background: #fff;
  border-radius: 20px;
  padding: 32px 40px;
  max-width: 800px;
  width: 90%;
  position: relative;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
}

.shortcuts-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #7b848c;
  cursor: pointer;
  padding: 0;
  transition: all 0.2s ease;
}

.shortcuts-close:hover {
  background: #f6f6f6;
  color: #111;
}

.shortcuts-grid {
  display: flex;
  gap: 40px;
}

.shortcuts-column {
  flex: 1;
}

.shortcuts-column h3 {
  font-size: 16px;
  font-weight: 700;
  color: #1f252a;
  margin: 0 0 20px;
}

.shortcut-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  gap: 8px;
}

.shortcut-item span {
  font-size: 14px;
  color: #555c63;
  font-weight: 500;
}

.shortcut-keys {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}

.shortcut-keys kbd {
  background: #f4f6f8;
  border: 1px solid #dfe3e8;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
  font-family: inherit;
  font-weight: 600;
  color: #1f252a;
  white-space: nowrap;
}
</style>

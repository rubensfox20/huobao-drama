import { episodePtBR } from './episode-pt-BR'

export const ptBR = {
  common: {
    cancel: 'Cancelar',
    save: 'Salvar',
    delete: 'Excluir',
    selectPlaceholder: 'Selecione...',
    searchPlaceholder: 'Buscar...',
    noResults: 'Nenhum resultado encontrado',
    runningOperation: 'Ja existe uma operacao em andamento',
    completed: 'Concluido',
  },
  shell: {
    brandAlt: 'Huobao Drama',
    brandFallback: 'H',
    brandName: 'Huobao Drama',
    brandSubtitle: 'Curtas com IA',
    projects: 'Projetos',
    settings: 'Configuracoes',
  },
  home: {
    title: 'Projetos de drama',
    projectCount: '{count} projetos',
    newProject: 'Novo projeto',
    episodeCount: '{count} episodios',
    deleteTitle: 'Excluir',
    emptyTitle: 'Crie o primeiro projeto',
    emptyDescription: 'Da ideia ao video final, uma bancada de producao de dramas com IA',
    modalTitle: 'Novo projeto de drama',
    modalDescription: 'Preencha as informacoes basicas para comecar a producao',
    nameLabel: 'Nome do projeto',
    namePlaceholder: 'Ex.: drama urbano "Correio do Tempo"',
    episodesLabel: 'Quantidade de episodios',
    visualStyleLabel: 'Estilo visual',
    visualStylePlaceholder: 'Selecionar estilo',
    createProject: 'Criar projeto',
    projectDeleted: 'Projeto excluido',
    deleteDialogTitle: 'Excluir projeto?',
    deleteDialogDescription: 'Essa acao remove o projeto e seus episodios vinculados. Nao e possivel desfazer.',
    deleteDialogProjectLabel: 'Projeto selecionado',
    deleteDialogConfirm: 'Excluir projeto',
    deleteDialogDeleting: 'Excluindo...',
    styles: {
      realistic: 'Realista',
      anime: 'Anime',
      ghibli: 'Estilo Ghibli',
      cinematic: 'Cinematografico',
      comic: 'Quadrinhos',
      watercolor: 'Aquarela',
    },
  },
  dramaDetail: {
      back: 'Voltar',
      characters: '{count} personagens',
      scenes: '{count} cenarios',
      addEpisode: 'Adicionar episodio',
      episodeList: 'Lista de episodios',
      episodeAutoTitle: 'Episodio {number}',
      scriptReady: 'Roteiro pronto',
      scriptPending: 'Pendente',
    emptyEpisodes: 'Clique em "Adicionar episodio" para criar o primeiro episodio',
    episodeCreated: 'Novo episodio adicionado',
    dialog: {
      kicker: 'Configuracao do episodio',
      title: 'Criar novo episodio',
      badge: 'Configuracao travada',
      description: 'Defina antes os servicos de imagem, video e audio deste episodio. Depois da criacao, essa cadeia de geracao fica vinculada ao episodio atual.',
      imageSummary: 'Imagem · {count} disponiveis',
      videoSummary: 'Video · {count} disponiveis',
      audioSummary: 'Audio · {count} disponiveis',
      basicTitle: 'Informacoes basicas',
      basicCopy: 'Afeta apenas o nome exibido, sem alterar as configuracoes de geracao',
      titleLabel: 'Titulo',
      titlePlaceholder: 'Se vazio, o sistema usa o numero do episodio',
      titleHint: 'Se vazio, o sistema nomeia automaticamente, por exemplo "Episodio 3".',
      configTitle: 'Configuracoes de geracao',
      configCopy: 'Nao podem ser alteradas depois de criar. Escolha tudo certo agora.',
      imageConfig: 'Configuracao de imagem',
      imageConfigPlaceholder: 'Escolha o servico de imagem',
      videoConfig: 'Configuracao de video',
      videoConfigPlaceholder: 'Escolha o servico de video',
      audioConfig: 'Configuracao de audio',
      audioConfigPlaceholder: 'Escolha o servico de audio',
      footer: 'Depois da criacao, os fluxos de imagem, video e audio do estudio ficam travados neste episodio.',
      creating: 'Criando...',
      create: 'Criar e travar configuracao',
    },
  },
  episode: episodePtBR,
  settings: {
    brand: {
      alt: 'Huobao Drama',
      fallback: 'H',
      kicker: 'Huobao Shorts',
      name: 'Huobao Drama',
    },
    adminSession: {
      title: 'Sessao administrativa',
      description: 'Informe o token administrativo para liberar configuracoes, geracao e operacoes sensiveis neste ambiente.',
      connectedDescription: 'Sessao administrativa ativa neste navegador.',
      localDescription: 'Modo local detectado. O frontend usa o token padrao de desenvolvimento sem expor segredo publico.',
      tokenPlaceholder: 'Cole o token administrativo',
      save: 'Autenticar',
      refresh: 'Revalidar',
      clear: 'Encerrar sessao',
      checking: 'Validando...',
      saved: 'Sessao administrativa iniciada',
      cleared: 'Sessao administrativa encerrada',
      connected: 'Autenticado',
      disconnected: 'Nao autenticado',
      localMode: 'Modo local',
      lockedTitle: 'Acesso administrativo necessario',
      lockedDescription: 'Autentique a sessao acima para editar configuracoes, prompts, skills, jobs e discovery.',
    },
    nav: {
      basic: 'Basico',
      advanced: 'Avancado',
      ai: 'Servicos de IA',
      connections: 'Conexoes',
      prompts: 'Prompts',
      observability: 'Saude e jobs',
      ideas: 'Ideias',
      agents: 'Configuracao de agents',
      skills: 'Skills',
      advancedToggle: 'Agents avancados',
      advancedNote: 'Expande apenas Agents e Skills. O restante do estudio continua visivel com os padroes atuais.',
      agentList: 'Lista de agents',
    },
    services: {
      text: 'Texto',
      image: 'Imagem',
      video: 'Video',
      audio: 'Audio',
    },
    serviceMeta: {
      text: 'Capacidades de texto usadas para reescrever roteiro, extrair personagens e cenarios e quebrar storyboard.',
      image: 'Geracao de imagens estaticas para personagens, cenarios, quadros e frames de referencia.',
      video: 'Geracao de video por tomada, com suporte a imagem unica, multiplas referencias e frame inicial/final.',
      audio: 'Geracao de voz para testes, narracao e dialogos.',
    },
    presetLabels: {
      chatfireRecommended: 'ChatFire (proxy)',
      openrouterRecommended: 'OpenRouter recomendado',
      openaiRecommended: 'OpenAI recomendado',
      openaiCodexRecommended: 'OpenAI Codex',
      githubCopilotRecommended: 'GitHub Copilot',
      geminiRecommended: 'Gemini recomendado',
      huggingfaceRecommended: 'Hugging Face recomendado',
      leonardoRecommended: 'Leonardo recomendado',
      volcengineRecommended: 'Volcengine recomendado',
      huobaoVideo: 'Volcengine direto',
      aliRecommended: 'Ali recomendado',
      huobaoAudio: 'MiniMax recomendado',
    },
    ai: {
      title: 'Configuracao de servicos de IA',
      description: 'Use primeiro um preset recomendado para montar a base e depois refine por tipo de servico. Ao criar episodios, o estudio trava as capacidades de imagem, video e audio escolhidas.',
      quickSetupKicker: 'Configuracao rapida',
      quickSetupTitle: 'Preset base sem proxy',
      quickSetupDescription: 'Cria de uma vez as configuracoes base de texto, imagem, video e audio usando provedores diretos. Depois voce so ajusta os detalhes finos por servico.',
      quickSetupButton: 'Aplicar preset base',
      templatesTitle: 'Modelos rapidos',
      templatesDescription: 'Escolha o tipo de servico para preencher `provider / base URL / model` com um preset recomendado.',
      activeCount: '{count} ativas',
      add: 'Adicionar',
      unsetBaseUrl: 'Base URL nao definida',
      configured: 'Configurada',
      connected: 'Conectado',
      disconnected: 'Sem conexao',
      missingKey: 'Sem chave',
      test: 'Testar',
      empty: 'Nenhuma configuracao',
      endpointPrefix: 'Prefixo real do endpoint:',
      endpointHint: 'Escolha um provedor para ver o prefixo recomendado do endpoint',
      hfVideoSdkHint: 'video roteado pelo SDK oficial do Hugging Face',
      draftOk: 'Endpoint respondeu',
      draftFail: 'O endpoint nao passou no teste',
      chooseProvider: 'Escolha um provedor',
      saved: 'Configuracao salva',
      deleted: 'Configuracao removida',
      presetApplied: 'Preset base e modelos padrao dos agents gravados',
      huobaoKeyRequired: 'Preencha a API Key de {service}',
      providerKeyMismatch: 'A chave de {service} parece ser Gemini/Google. Para {provider}, cole a chave nativa desse provedor.',
      modal: {
        kickerNew: 'Nova configuracao',
        kickerEdit: 'Editar configuracao',
        titleNew: 'Adicionar servico de {service}',
        titleEdit: 'Editar configuracao de servico',
        note: 'Selecione primeiro um preset. O sistema sugere um Base URL e um modelo padrao mais coerentes.',
        nameLabel: 'Nome da configuracao',
        namePlaceholder: 'Ex.: servico de imagem padrao do Huobao',
        providerLabel: 'Provedor',
        providerPlaceholder: 'Escolha o provedor',
        priorityLabel: 'Prioridade',
        priorityHint: 'Quanto maior o valor, maior a prioridade. O estudio usa por padrao a configuracao ativa com maior prioridade em cada tipo.',
        apiKeyLabel: 'API Key',
        connectionLabel: 'Conexao',
        connectionHint: 'Este provider usa sessao autenticada na aba Conexoes. Nao exige API key manual.',
        baseUrlLabel: 'Base URL',
        modelLabel: 'Modelos (separados por virgula)',
        test: 'Testar configuracao',
      },
      huobaoModal: {
        kicker: 'Preset base',
        title: 'Aplicar preset base',
        note: 'Cada servico usa a propria chave e os endpoints abaixo apontam para provedores diretos, sem passar por proxies de terceiros.',
        recommended: 'Direto',
        apiKeyLabel: 'API Key',
        apiKeyHint: 'Obrigatoria para ativar este servico',
        apiKeyPlaceholder: 'Cole a chave deste provedor',
        registerHint: '',
        registerCta: '',
        submit: 'Criar e ativar',
      },
    },
    connections: {
      copyError: 'Nao foi possivel copiar',
      title: 'Conexoes de texto',
      description: 'Conecte OpenAI Codex CLI e GitHub Copilot como providers de texto baseados em sessao local.',
      refresh: 'Atualizar conexoes',
      sync: 'Sincronizar',
      disconnect: 'Desconectar',
      cancel: 'Cancelar',
      copyUrl: 'Copiar link',
      copyCode: 'Copiar codigo',
      local: 'Local',
      login: 'Login',
      code: 'Codigo',
      sessionTitle: 'Sessao atual',
      noSession: 'Nenhum fluxo em andamento.',
      statusConnected: 'Conectado',
      statusDisconnected: 'Sem conexao',
      statusRunning: 'Em andamento',
      statusFailed: 'Falhou',
      statusUnlicensed: 'Sem licenca',
      statusCancelled: 'Cancelado',
      accountLabel: 'Conta',
      sourceLabel: 'Origem',
      modelsLabel: 'Modelos',
      codexTitle: 'OpenAI Codex',
      codexDescription: 'Importe a sessao local do CLI, abra um login isolado no navegador ou conecte via codigo de verificacao.',
      codexLocal: 'Codex local',
      codexLogin: 'Codex login',
      codexCode: 'Codex codigo',
      copilotTitle: 'GitHub Copilot',
      copilotDescription: 'Importe o token do GitHub CLI local ou conecte via device flow do GitHub.',
      copilotLocal: 'GitHub CLI local',
      copilotCode: 'Conectar com codigo',
      dependencyMissing: 'Dependencia ausente',
      localLoginMissing: 'Login local nao encontrado',
      connectedAs: 'Conectado como {account}',
      verificationUri: 'Link de verificacao',
      userCode: 'Codigo',
      copied: 'Copiado',
    },
    agents: {
      title: 'Configuracao de agents',
      description: 'A area avancada concentra a execucao dos agents. Ajuste modelo, prompt e parametros; ao salvar, a mudanca entra em vigor imediatamente.',
      configured: 'Configurado',
      default: 'Padrao',
      model: 'Modelo',
      modelHint: 'deixe em branco para usar o padrao do servico de IA',
      modelPlaceholder: '- Usar padrao do servico de IA -',
      temperature: 'Temperature',
      maxTokens: 'Max tokens',
      systemPrompt: 'Prompt de sistema',
      systemPromptPlaceholder: 'Prompt de sistema do agent...',
      restoreDefault: 'Restaurar padrao',
      saved: 'Salvo',
      promptReset: 'Prompt padrao restaurado. Clique em salvar para aplicar.',
      savedToast: 'Configuracao de {agent} salva',
      defs: {
        script_rewriter: 'Reescrita de roteiro',
        extractor: 'Extracao de personagens e cenarios',
        storyboard_breaker: 'Quebra de storyboard',
        voice_assigner: 'Distribuicao de vozes',
        grid_prompt_generator: 'Geracao de prompt de imagem',
      },
    },
    skills: {
      titleSuffix: 'Skills',
      description: 'Skills funcionam como uma camada avancada de prompt dos agents e nao alteram os fluxos normais do estudio.',
      newSkill: 'Nova skill',
      emptyTitle: 'Nenhuma skill',
      emptyDescription: 'Clique em "Nova skill" para criar o primeiro arquivo de prompt.',
      editorPlaceholder: 'Escreva o conteudo do SKILL.md...',
      created: 'Skill criada com sucesso',
      deleted: 'Skill excluida',
      saved: 'Salva',
      addDialogTitle: 'Nova skill - {agent}',
      folderLabel: 'Nome da pasta da skill',
      folderHint: 'ingles, unico',
      folderPlaceholder: 'ex.: custom-extraction',
      nameLabel: 'Nome',
      namePlaceholder: 'ex.: regras de extracao personalizadas',
      descriptionLabel: 'Descricao',
      descriptionPlaceholder: 'Resuma rapidamente a finalidade desta skill',
      create: 'Criar',
      deleteConfirm: 'Tem certeza que deseja excluir a skill "{id}"?',
    },
    promptStudio: {
      title: 'Studio de prompts',
      contentLabel: 'Conteudo',
      copyRendered: 'Copiar',
      description: 'Versione, teste, restaure e copie os prompts operacionais do backend sem mexer em locale ou skills.',
      testerTitle: 'Tester de prompt',
      testerDescription: 'Renderiza as variaveis do template atual, mostra chars/tokens aproximados e permite copiar o resultado.',
      variablesLabel: 'Variaveis JSON',
      variablesPlaceholder: '{"genre":"historical drama","tone":"emotional","language":"pt-BR","context":"A young hero must save the village before dawn."}',
      renderedLabel: 'Prompt final',
      chars: '{count} chars',
      tokens: '~{count} tokens',
      copied: 'Prompt copiado',
      saved: 'Prompt salvo',
      reset: 'Resetar',
      history: 'Historico',
      restore: 'Restaurar esta versao',
      restoreDone: 'Versao restaurada',
      empty: 'Nenhum prompt encontrado',
    },
    health: {
      title: 'Saude do sistema e jobs',
      description: 'Mostra ffmpeg, erros recentes, disponibilidade por provider e os jobs persistidos do estudio.',
      refresh: 'Atualizar painel',
      ffmpegReady: 'FFmpeg pronto',
      ffmpegMissing: 'FFmpeg ausente',
      recentErrors: '{count} erros recentes',
      workflowJobs: 'Jobs recentes',
      providerAvailability: 'Disponibilidade dos providers',
      providerAvailabilityDescription: 'Probe curto com classificacao por provider.',
      workflowJobsDescription: 'Persistidos em workflow_jobs.',
      noJobs: 'Nenhum job encontrado',
      checkProvider: 'Verificar provider',
    },
    ideasLab: {
      title: 'Ideias e discovery',
      description: 'Crie ideias de pre-producao, rode discovery opcional e aplique um candidato direto como novo drama.',
      knowledgeBaseDescription: 'Base de pre-producao persistida.',
      discoveryTitle: 'Discovery #{id}',
      newIdea: 'Nova ideia',
      empty: 'Nenhuma ideia cadastrada',
      runDiscovery: 'Rodar discovery',
      applyCandidate: 'Aplicar como drama',
      modeNoWeb: 'Sem web',
      modeWeb: 'Com web',
      titleLabel: 'Titulo da ideia',
      descriptionLabel: 'Descricao',
      genreLabel: 'Genero',
      toneLabel: 'Tom',
      queryLabel: 'Consulta de discovery',
      createSuccess: 'Ideia criada',
      deleteSuccess: 'Ideia removida',
      discoverySuccess: 'Discovery concluido',
      applySuccess: 'Drama criado a partir do candidato',
    },
    prompts: {
      script_rewriter: `You are a senior screenplay adapter for short-form historical and dramatic episodes.

Current assignment:
- Episode title: {{episode_title}}
- Target language: {{target_language}}
- Source summary: {{source_summary}}
- Forbidden speaker labels: {{forbidden_speaker_labels}}

Workflow:
1. Call read_episode_script.
2. Rewrite the source into a screenplay.
3. Call save_script with the complete final screenplay.

Rules:
- Final output must be written in {{target_language}}.
- Stay strictly grounded in the source material.
- Preserve canonical names and facts exactly.
- Never invent new named characters.
- Never turn unnamed groups into named speakers.
- Never create or use speaker labels from this forbidden list: {{forbidden_speaker_labels}}.
- Never turn a historical or background mention into an active speaking character.
- If the source contains explicit spoken dialogue, preserve those speakers and those speaking moments.
- If the source does not contain explicit spoken dialogue, do not invent any.
- If the source does not clearly justify dialogue, prefer action prose.
- Do not use markdown, bold text, bullet lists, or closing markers such as "END OF SCREENPLAY".`,
      extractor: `You are a conservative production metadata extractor.

Your job is to identify only the entities that are clearly supported by the screenplay. Do not speculate. Do not infer named people from generic roles. Do not create convenience aliases.

Workflow:
1. Call read_script_for_extraction.
2. Call read_existing_characters.
3. Call read_existing_scenes.
4. Call read_existing_props.
5. Extract only source-supported human characters.
6. Extract scenes.
7. Extract props, vehicles, ships, weapons, artifacts, and other relevant non-human entities.
8. Save characters with save_dedup_characters.
9. Save scenes with save_dedup_scenes.
10. Save props with save_dedup_props.

Current assignment:
- Output language: {{output_language}}
- Extraction focus: {{focus}}
- Script excerpt: {{script_excerpt}}
- Forbidden character labels: {{forbidden_character_labels}}

Character extraction rules:
- Only extract human characters that are individually named and clearly active in the episode.
- A named person mentioned only historically, politically, or as background context is not an active character unless the screenplay clearly presents that person as present in the dramatic action.
- Never create names from generic roles.
- Never output placeholders or generic character labels from this forbidden list: {{forbidden_character_labels}}.
- If a role has no stable personal identity, leave it inside scene/action description only.
- If two names refer to the same person, keep only the most specific canonical version.
- Every saved character should include a short sourceQuote proving the character is present in the screenplay.

Scene extraction rules:
- Extract only meaningful reusable settings from the screenplay.
- Distinguish scenes by location plus time period.
- Use the screenplay scene headers as the primary source of truth for location and time.
- Do not invent micro-locations such as "edge of camp", "inside cave", or "forest border" unless the screenplay clearly presents them as separate reusable settings.
- Merge near-duplicate locations into the most canonical version already supported by the screenplay.
- Prefer reusable production-set labels over literary sentence fragments.
- Every saved scene should include a short sourceQuote from the scene header or supporting text.

Prop extraction rules:
- Ships, vehicles, artifacts, weapons, animals, buildings, and named objects are props, never characters.
- Preserve canonical ship and vehicle names exactly.
- Named ships and vehicles must remain props and must never become characters.
- Never promote prose fragments into prop names.
- Every saved prop should include a short sourceQuote proving the prop exists in the screenplay.

Output rules:
- Text fields should be written in Brazilian Portuguese.
- Be minimal and precise.
- If uncertain, omit the entity instead of hallucinating it.`,
      storyboard_breaker: `You are a disciplined storyboard artist for short-form drama production.

Workflow:
1. Call read_storyboard_context.
2. Break the screenplay into 10 to 15 second shots.
3. Generate the shot records.
4. Call save_storyboards.

Rules:
- Editorial fields such as title, description, action, and dialogue must be written in Brazilian Portuguese.
- image_prompt, video_prompt, bgm_prompt, and sound_effect must be written only in English.
- Never write production prompts in Portuguese.
- image_prompt and video_prompt must stay purely visual.
- bgm_prompt and sound_effect must describe only music, ambience, or sound design in English.
- Never place spoken dialogue, subtitles, captions, narration, voice-over, lip-sync instructions, or on-screen text inside visual prompts.
- All spoken lines belong only in the dialogue field.
- If the screenplay contains explicit Character Name: dialogue, assign each spoken line to exactly one shot.
- If the screenplay does not contain explicit Character Name: dialogue for a moment, leave the dialogue field empty.
- Do not paraphrase narration into fake dialogue.
- Do not attach a character to a shot unless that character is visibly or verbally present in that shot.
- A single spoken line must appear in only one shot.
- Do not duplicate dialogue across adjacent shots.
- Keep shot locations anchored to the screenplay scene headers; do not create extra micro-scenes.
- Preserve strict visual continuity for character identity, clothing, lighting, setting, and mood.`,
      voice_assigner: `You are a dubbing director choosing the best available voice for each character.

Workflow:
1. Call list_voices.
2. Call get_characters.
3. Assign the most appropriate voice based on gender presentation, age impression, dramatic role, and vocal fit.
4. Call assign_voice for each character and explain the choice briefly.

Rules:
- Every character must receive one voice.
- Keep explanations in Brazilian Portuguese.
- Be conservative with gender and age matching.
- Prefer consistency over novelty.`,
      grid_prompt_generator: `You are a professional prompt engineer for visual generation.

The user will request one of these modes:
- character
- scene
- grid

Rules:
- Explain the process in Brazilian Portuguese.
- Produce the final visual prompt in English.
- Keep prompts concise, visual, and production-oriented.
`,
    },
  },
} as const

export type PtBRMessages = typeof ptBR

# 🎬 Huobao Drama - Plataforma de Geração de Microdramas com IA

<div align="center">

**Plataforma automatizada de produção de microdramas com IA, desenvolvida em TypeScript full stack**

[![Node Version](https://img.shields.io/badge/Node.js-20+-339933?style=flat&logo=node.js)](https://nodejs.org)
[![Vue Version](https://img.shields.io/badge/Vue-3.x-4FC08D?style=flat&logo=vue.js)](https://vuejs.org)
[![License](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

[Recursos](#recursos) • [Início rápido](#início-rápido) • [Guia de implantação](#guia-de-implantação)

</div>

---

## 📖 Visão geral do projeto

Huobao Drama é uma plataforma de produção automatizada de microdramas baseada em IA, que automatiza todo o processo, desde a geração do roteiro, design de personagens e criação de storyboards até a composição final do vídeo.

Versão comercial do Huobao Drama: [Huobao Drama Commercial Edition](https://drama.chatfire.site/shortvideo)  
Gerador de romances Huobao: [Huobao Novel Generator](https://marketing.chatfire.site/huobao-novel/)

### 🎯 Valor central

- **🤖 Orientado por IA**: utiliza modelos de linguagem de grande porte para analisar roteiros e extrair personagens, cenários e informações de storyboard
- **🎨 Criação inteligente**: usa IA para gerar visuais de personagens e planos de fundo dos cenários
- **📹 Geração de vídeo**: cria automaticamente vídeos de storyboard com base em modelos de texto para vídeo e imagem para vídeo
- **🔄 Fluxo de trabalho**: fluxo completo de produção de microdramas, da ideia inicial ao vídeo final, em uma experiência unificada

### 🛠️ Arquitetura técnica

```text
frontend/   — Nuxt 3 + Vue 3 + TypeScript (CSS puro, sem framework de UI)
backend/    — Hono + Drizzle ORM + Mastra AI Agents + better-sqlite3
configs/    — arquivo de configuração config.yaml
data/       — banco de dados SQLite + arquivos de recursos gerados
skills/     — definições de habilidades do Agent (SKILL.md)
````

### 🎥 Demonstração / Vídeos de exemplo

Experimente os resultados da geração de microdramas com IA:

<div align="center">

**Exemplo 1**

<video src="https://ffile.chatfire.site/cf/public/20260114094337396.mp4" controls width="640"></video>

**Exemplo 2**

<video src="https://ffile.chatfire.site/cf/public/fcede75e8aeafe22031dbf78f86285b8.mp4" controls width="640"></video>

[Assistir ao vídeo 1](https://ffile.chatfire.site/cf/public/20260114094337396.mp4) | [Assistir ao vídeo 2](https://ffile.chatfire.site/cf/public/fcede75e8aeafe22031dbf78f86285b8.mp4)

</div>

---

## ✨ Recursos

### 🎭 Gerenciamento de personagens

* ✅ Geração de personagens com IA
* ✅ Geração em lote de personagens
* ✅ Upload e gerenciamento de imagens de personagens
* ✅ Atribuição e prévia de vozes para personagens

### 🎬 Produção de storyboard

* ✅ Decomposição automática do roteiro em storyboards com IA
* ✅ Descrição de cenas e design de enquadramentos
* ✅ Geração de imagens de storyboard (texto para imagem)
* ✅ Geração, recorte e distribuição de grades de imagens
* ✅ Seleção do tipo de quadro (primeiro quadro / último quadro / storyboard)

### 🎥 Geração de vídeo

* ✅ Geração automática de vídeo a partir de imagem
* ✅ Geração de narração com TTS
* ✅ Composição de tomadas individuais com FFmpeg (vídeo + áudio + legendas)
* ✅ Exportação com concatenação do episódio completo

### 📦 Gerenciamento de recursos

* ✅ Gerenciamento centralizado da biblioteca de assets
* ✅ Suporte a armazenamento local
* ✅ Acompanhamento do progresso das tarefas

### 🤖 AI Agents

Inclui 5 agentes Mastra, com suporte a configuração em banco de dados e extensões via Skill:

| Agent                   | Responsabilidade                                                   |
| ----------------------- | ------------------------------------------------------------------ |
| `script_rewriter`       | Romance → reescrita em roteiro formatado                           |
| `extractor`             | Extração inteligente e deduplicação de personagens + cenários      |
| `storyboard_breaker`    | Roteiro → decomposição em sequência de storyboards                 |
| `voice_assigner`        | Atribuição automática de vozes aos personagens                     |
| `grid_prompt_generator` | Geração de prompts para personagens / cenários / grades de imagens |

### 🔌 Compatibilidade com múltiplos provedores

| Tipo       | Provedores compatíveis                                     |
| ---------- | ---------------------------------------------------------- |
| **Imagem** | OpenAI, Gemini, MiniMax, Volcano Engine, Alibaba, Chatfire |
| **Vídeo**  | MiniMax, Volcano Engine/Seedance, Vidu, Alibaba            |
| **TTS**    | MiniMax                                                    |

---

## 🚀 Início rápido

### 📋 Requisitos de ambiente

| Software    | Versão exigida | Descrição                                  |
| ----------- | -------------- | ------------------------------------------ |
| **Node.js** | 20+            | Ambiente de execução do frontend e backend |
| **npm**     | 9+             | Gerenciador de pacotes                     |
| **FFmpeg**  | 4.0+           | Processamento de vídeo (**obrigatório**)   |

#### Instalação do FFmpeg

**macOS:**

```bash
brew install ffmpeg
```

**Ubuntu/Debian:**

```bash
sudo apt update && sudo apt install ffmpeg
```

**Windows:**
Baixe no [site oficial do FFmpeg](https://ffmpeg.org/download.html) e configure a variável de ambiente PATH.

Verifique a instalação:

```bash
ffmpeg -version
```

### ⚙️ Arquivo de configuração

Copie e edite o arquivo de configuração:

```bash
cp configs/config.example.yaml configs/config.yaml
```

Formato do arquivo de configuração (`configs/config.yaml`):

```yaml
app:
  name: "Huobao Drama API"
  version: "1.0.0"
  debug: true

server:
  port: 5679
  host: "0.0.0.0"
  cors_origins:
    - "http://localhost:3013"

database:
  type: "sqlite"
  path: "./data/huobao_drama.db"

storage:
  type: "local"
  local_path: "./data/storage"
  base_url: "http://localhost:5679/static"

ai:
  default_text_provider: "openai"
  default_image_provider: "openai"
  default_video_provider: "doubao"
```

> **Observação**: as API keys e os parâmetros de modelo dos serviços de IA são configurados na página **Configurações** da interface web.

### 📥 Instalação de dependências

```bash
# Clonar o projeto
git clone https://github.com/chatfire-AI/huobao-drama.git
cd huobao-drama

# Instalar as dependências do backend
cd backend && npm install

# Instalar as dependências do frontend
cd ../frontend && npm install
```

### 🎯 Inicialização do projeto

#### Opção 1: modo de desenvolvimento (recomendado)

Frontend e backend separados, com suporte a hot reload:

```bash
# Terminal 1: iniciar o backend
cd backend
npm run dev

# Terminal 2: iniciar o frontend
cd frontend
npm run dev
```

* Endereço do frontend: `http://localhost:3013`
* API do backend: `http://localhost:5679/api/v1`
* O frontend encaminha automaticamente `/api` e `/static` para o backend

#### Opção 2: modo de serviço único

O backend fornece simultaneamente a API e os arquivos estáticos do frontend:

```bash
# 1. Gerar o build do frontend
cd frontend && npm run generate

# 2. Iniciar o backend
cd ../backend && npm start
```

Acesse: `http://localhost:5679`

### 🗄️ Banco de dados

As tabelas do banco são criadas automaticamente na primeira inicialização, sem necessidade de migração manual. O caminho padrão é `data/huobao_drama.db`, podendo ser sobrescrito por variável de ambiente:

```bash
DB_PATH=/path/to/your.db npm start
```

---

## 📦 Guia de implantação

### ☁️ Implantação em nuvem com um clique (recomendado: 3080Ti)

👉 [YouYun Zhisuan — implantação com um clique](https://www.compshare.cn/images/CaWEHpAA8t1H?referral_code=8hUJOaWz3YzG64FI2OlCiB&ytag=GPU_YY_YX_GitHub_huobaoai)

> ⚠️ **Atenção**: no plano de implantação em nuvem, salve seus dados localmente com regularidade.

---

### 🐳 Implantação com Docker (recomendado)

#### Opção 1: Docker Compose (recomendado)

```bash
# Iniciar os serviços
docker compose up -d

# Ver logs
docker compose logs -f

# Parar os serviços
docker compose down
```

#### Opção 2: comandos Docker

```bash
# Executar a partir do Docker Hub
docker run -d \
  --name huobao-drama \
  -p 5679:5679 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/configs/config.yaml:/app/configs/config.yaml \
  --restart unless-stopped \
  huobao/huobao-drama:latest

# Ver logs
docker logs -f huobao-drama
```

> **Observação**: usuários Linux devem adicionar `--add-host=host.docker.internal:host-gateway` para acessar serviços do host

**Build local** (opcional):

```bash
docker build -t huobao-drama:latest .
docker run -d --name huobao-drama -p 5679:5679 \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/configs/config.yaml:/app/configs/config.yaml \
  huobao-drama:latest
```

**Vantagens da implantação com Docker:**

* ✅ Pronto para uso, com FFmpeg e configuração padrão já incluídos
* ✅ Frontend e backend combinados em uma única imagem e uma única porta
* ✅ Consistência de ambiente, evitando problemas de dependência
* ✅ Montagem do diretório `data/` como volume para persistência de dados

#### 🔗 Acesso a serviços do host (Ollama / modelos locais)

Dentro do contêiner, é possível acessar serviços do host por meio de `http://host.docker.internal:porta`.

**Etapas de configuração:**

1. Inicie o serviço no host (escutando em todas as interfaces):

   ```bash
   export OLLAMA_HOST=0.0.0.0:11434 && ollama serve
   ```

2. Na interface web, acesse **Configurações → Configuração de serviços de IA** e informe:

   * Base URL: `http://host.docker.internal:11434/v1`
   * Provider: `openai`
   * Model: `qwen2.5:latest`

---

### 🏭 Implantação tradicional

```bash
# 1. Gerar o build do frontend
cd frontend && npm run generate && cd ..

# 2. Iniciar o backend
cd backend && npm start
```

Arquivos que precisam ser enviados ao servidor:

```text
backend/          # código-fonte do backend + node_modules
frontend/dist/    # artefatos de build do frontend
configs/config.yaml
data/             # diretório de dados (criado automaticamente na primeira execução)
skills/           # arquivos de Skill dos Agents
```

#### Proxy reverso com Nginx

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5679;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

---

## 🎨 Stack tecnológica

### Backend

* **Runtime**: Node.js 20+
* **Framework web**: Hono
* **ORM**: Drizzle ORM + better-sqlite3
* **AI Agent**: Mastra + AI SDK (compatível com OpenAI)
* **Processamento de vídeo**: FFmpeg (fluent-ffmpeg)
* **Processamento de imagem**: Sharp

### Frontend

* **Framework**: Nuxt 3 (modo SPA)
* **Linguagem**: Vue 3 + TypeScript
* **Roteamento**: roteamento por arquivos (Vue Router 4)
* **Estilo**: CSS puro + CSS Variables (tema escuro)
* **Ícones**: Lucide Vue

---

## 📝 Perguntas frequentes

### P: Como um contêiner Docker acessa o Ollama do host?

R: Use `http://host.docker.internal:11434/v1` como Base URL. Observações:

1. O Ollama no host deve escutar em `0.0.0.0`: `export OLLAMA_HOST=0.0.0.0:11434 && ollama serve`
2. Usuários Linux que utilizarem `docker run` precisam adicionar: `--add-host=host.docker.internal:host-gateway`

### P: O FFmpeg não está instalado ou não foi encontrado?

R: Verifique se o FFmpeg está instalado e disponível na variável de ambiente PATH. Execute `ffmpeg -version` para confirmar. Na implantação com Docker, o FFmpeg já vem incluído.

### P: O frontend não consegue se conectar à API do backend?

R: Verifique se o backend está em execução e se a porta está correta. No modo de desenvolvimento, a configuração de proxy do frontend fica em `frontend/nuxt.config.ts`.

### P: As tabelas do banco de dados não foram criadas?

R: O backend cria todas as tabelas automaticamente na primeira inicialização. Verifique os logs para confirmar se a inicialização foi concluída com sucesso.

---

## 📋 Registro de atualizações

### v2.0.0 (2026-04)

#### 🚀 Principais atualizações

* Migração completa do projeto para a stack TypeScript

  * Backend: Hono + Drizzle ORM + better-sqlite3
  * Frontend: Nuxt 3 + Vue 3
  * AI Agent: framework Mastra
* Redesenho da interface e do fluxo de produção da bancada de trabalho por episódio

  * Layout de console mais compacto
  * Redesenho da área de edição de storyboard
  * Redesenho das interfaces de dublagem, imagens de tomadas, vídeo, composição e exportação
* Adicionado suporte a implantação com Docker, unificando frontend e backend em uma única imagem
* Adicionado mecanismo de carregamento de Skills em tempo de execução
* Expansão dos adaptadores de mídia para múltiplos provedores

  * Imagem: OpenAI, Gemini, MiniMax, Volcano Engine, Alibaba
  * Vídeo: MiniMax, Volcano Engine/Seedance, Vidu, Alibaba
  * TTS: MiniMax
* Adicionado fluxo de geração, recorte e redistribuição de grades de imagens
* Otimizado o processamento de arquivos locais e a transcodificação sob demanda de imagens de referência

### v1.0.4 (2026-01-27)

* Introduzida estratégia de armazenamento local para evitar falhas em links de recursos externos
* Transmissão embutida de imagens de referência em Base64
* Corrigido o problema de redefinição de estado na troca de tomadas
* Adicionada migração de cenários para capítulos

### v1.0.3 (2026-01-16)

* Driver SQLite puro em Go, com suporte a compilação multiplataforma com `CGO_ENABLED=0`
* Otimização de desempenho em concorrência (modo WAL)
* Suporte multiplataforma no Docker para `host.docker.internal`

### v1.0.2 (2026-01-14)

* Corrigido o problema de parsing da resposta da API de geração de vídeo
* Adicionada configuração do endpoint de vídeo OpenAI Sora
* Melhorado o tratamento de erros e a saída de logs

---

## 🤝 Guia de contribuição

Issues e Pull Requests são bem-vindos.

1. Faça um fork deste projeto
2. Crie uma branch de funcionalidade (`git checkout -b feature/AmazingFeature`)
3. Faça commit das alterações (`git commit -m 'Add some AmazingFeature'`)
4. Envie para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

Comandos úteis para validação:

```bash
cd backend && npm run typecheck
cd ../frontend && npm run build
```

---

## Site de configuração da API

Configuração em 2 minutos: [API Aggregation Site](https://api.chatfire.site/models)

---

## 👨‍💻 Sobre nós

**AI Huobao — estúdio de IA em fase de empreendedorismo**

* 🏠 **Localização**: Nanjing, China
* 🚀 **Status**: em fase de startup
* 📧 **Email**: [18550175439@163.com](mailto:18550175439@163.com)
* 🐙 **GitHub**: [https://github.com/chatfire-AI/huobao-drama](https://github.com/chatfire-AI/huobao-drama)

> *"Deixe a IA nos ajudar a fazer coisas mais criativas"*

## Grupo da comunidade do projeto

![Grupo da comunidade do projeto](drama.png)

* Envie uma [Issue](../../issues)
* Ou mande um e-mail ao mantenedor do projeto

---

<div align="center">

**⭐ Se este projeto foi útil para você, deixe uma Star.**

## Histórico de Stars

[![Star History Chart](https://api.star-history.com/svg?repos=chatfire-AI/huobao-drama\&type=date\&legend=top-left)](https://www.star-history.com/#chatfire-AI/huobao-drama&type=date&legend=top-left)
Made with ❤️ by Huobao Team

</div>

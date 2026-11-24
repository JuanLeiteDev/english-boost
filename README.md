# English Boost 🇺🇸 → 🇧🇪

Intensivo de inglês **A2 → B1 sólido (B2 como meta esticada)** de **25/11/2026 a 01/02/2027**, para o Erasmus na Howest (AI Engineer).
Funciona com o **Claude Code** e com o **Codex**, com skills partilhadas e todo o progresso no Git.

## Começar (todos os dias)

| | Linux / macOS | Windows |
|---|---|---|
| **🐳 Docker (recomendado, igual em todos)** | `docker compose up -d` | `docker compose up -d` |
| Nativo (sem Docker) | `./estudar.sh` | `estudar.bat` |

Depois abre **http://127.0.0.1:8765**.

| Menu | O que tem |
|---|---|
| 💬 **Estudar** | Chat com o **Claude ou o Codex** (escolhes no topo), sugestões prontas e um painel lateral que abre sozinho: **Hoje** (plano do dia, cronómetro, *Terminar sessão*), **Exercício** (respostas dentro da unidade, *Corrigir* ✓/✗, *Explicar erros*) e **Documento** |
| 📘 **Gramática** | As 45 unidades por cores; clica numa para a abrir |
| 📈 **Progresso** | Horas, sequência de dias, calendário, erros recorrentes, checkpoints e **Guardar no Git** |
| 📖 **Recursos** | Links verificados, plano, semana atual, estudos |

- 🎤 **Falar em inglês:** botão do microfone (Chrome ou Edge). 🔊 **Ouvir** uma resposta em inglês americano: botão em cada mensagem.
- **Sem API:** a app usa o Claude Code (extensão do VS Code) e o Codex (app ChatGPT) instalados no PC, com as tuas contas. Modelos: ⚙ Definições.
- Funciona só neste PC (`127.0.0.1`). O histórico do chat fica em `app/state/` e não vai para o Git.

**Alternativa sem app:** no VS Code ou no Codex, escreve `vamos estudar` e, no fim, `terminei a sessão`.
**Painel estático:** `dashboard/index.html` (atualiza com `python3 scripts/build_dashboard.py`).

## Primeira vez num dispositivo novo

### 🐳 Com Docker (Linux, macOS, Windows): recomendado

A imagem já traz o Python, o Git, o **Claude Code CLI** e o **Codex CLI**. Só precisas do Docker e das tuas contas.

1. Instala o Docker: **Windows/macOS:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) (no Windows com WSL 2) · **Linux:** Docker Engine e depois `sudo usermod -aG docker $USER`; termina a sessão e volta a entrar.
2. Clona e entra no projeto:
   ```bash
   git clone https://github.com/JuanLeiteDev/english-boost.git && cd english-boost
   cp .env.example .env            # opcional: fuso horário, porta, nome para os commits
   docker compose build            # 1.ª vez: ~3–5 min
   docker compose run --rm app login   # entra no Claude, no Codex e (opcional) no GitHub, com códigos no browser
   docker compose up -d            # a app fica a correr e arranca sozinha com o Docker
   ```
3. Abre **http://127.0.0.1:8765**.

| Comando | Para quê |
|---|---|
| `docker compose up -d` / `down` | Ligar / desligar a app |
| `docker compose run --rm app status` | Ver se o Claude, o Codex e o GitHub têm sessão iniciada |
| `docker compose logs -f` | Ver o registo da app |
| `docker compose build --no-cache` | Atualizar as versões dos CLIs (editar `docker/Dockerfile`) |

- **Os teus ficheiros ficam no teu disco:** o projeto é montado no contentor. Os logins ficam em volumes Docker (`claude-home`, `codex-home`, `gh-config`), por isso fazes login **uma vez por dispositivo**.
- **Os agentes usam as tuas subscrições**, sem API: Claude (Pro/Max) e Codex (ChatGPT).
- **Microfone e voz:** funcionam no browser do teu computador, não dependem do Docker.

### Sem Docker (nativo)

| | Linux / macOS | Windows |
|---|---|---|
| Requisitos | Python 3.9+, Git | Python 3.9+ (`winget install Python.Python.3.12`), Git for Windows |
| Configurar (1×) | `bash scripts/setup.sh` | `powershell -ExecutionPolicy Bypass -File scripts\setup-windows.ps1` |
| Claude | extensão Claude Code do VS Code com login feito, **ou** `curl -fsSL https://claude.ai/install.sh \| bash` | extensão do VS Code, **ou** `irm https://claude.ai/install.ps1 \| iex` |
| Codex | app Codex/ChatGPT, **ou** `npm i -g @openai/codex` + `codex login` | `npm i -g @openai/codex` + `codex login` |
| Abrir a app | `./estudar.sh` | `estudar.bat` |

A app encontra o Claude e o Codex automaticamente. Se não os encontrar, indica o caminho em ⚙ **Definições**.
Skills de PDF/DOCX/XLSX: `uv venv .venv && uv pip install --python .venv/bin/python -r requirements.txt` (no Docker já vêm incluídas).

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `plan/` | [Plano mestre](plan/master-plan.md) · [espinha de gramática](plan/grammar-spine.md) · planos semanais |
| `materials/grammar/` | Unidades de gramática com exercícios (gabaritos em `answers/`) |
| `resources/catalog.md` | Recursos externos verificados |
| `research/` | [Fundamentação científica do plano](research/2026-11-24-fundamentacao.md) |
| `assessments/` | Diagnóstico e checkpoints (C0–C3) |
| `progress/` | Registo de sessões e de erros recorrentes |
| `speaking/`, `writing/` | As tuas transcrições e textos |
| `.agents/skills/` | Todas as skills (o Claude lê-as através de `.claude/skills`) |
| `vendor/SOURCES.md` | Origem, licenças e adaptações das skills externas |

## Frases úteis para a IA

| Queres… | Diz |
|---|---|
| A sessão do dia | `vamos estudar` / `o que faço hoje?` |
| Fazer um checkpoint | `vamos fazer o diagnóstico C0` / `checkpoint C1` |
| Conversar / role-play | `quero fazer o role-play da câmara municipal` |
| Corrigir um texto | `corrige este email: …` |
| Rever uma dúvida de gramática | `/tutor present perfect vs past simple` |
| Revisão de vocabulário | `revisão de vocabulário` |
| Ver o progresso | `como estou a ir?` / `revisão semanal` |
| Falhaste dias | `falhei ontem, ajusta o plano` |

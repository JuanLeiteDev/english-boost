# Skills externas: origem, versão, licença e adaptações

Instaladas a 2026-11-24 em `.agents/skills/` (pasta única: o Codex lê-a diretamente e o Claude Code lê-a através do symlink `.claude/skills → ../.agents/skills`).

| Skills | Repositório | Commit | Licença | Adaptações locais |
|---|---|---|---|---|
| `langtutor-assessor`, `langtutor-session`, `langtutor-vocab`, `langtutor-tracker`, `langtutor-immersion` | [gislio/claude-language-tutor](https://github.com/gislio/claude-language-tutor) | `6a98066` (2026-03-24) | GPL-3.0 (cópia em cada pasta) | Nenhuma. Extraídas dos pacotes `.skill` (zip). Guardam dados em `Language-Tutor/learner-data/english/` |
| `tutor`, `level-check`, `course-research`, `source-check`, `course-builder`, `teach-me`, `final-exam`, `recall` | [TakeOff-Team/claude-tutor](https://github.com/TakeOff-Team/claude-tutor) | `4149f4a` (2026-11-15) | MIT | Nenhuma. Instaladas no projeto, não em `~/.claude/skills` como sugere o `install.sh` do autor |
| `literature-review` | [pinshuai/literature-review-skill](https://github.com/pinshuai/literature-review-skill) | `ed62a28` (2026-06-26) | MIT | **1)** O caminho fixo `/Users/shuai/github/paper-search-mcp` foi trocado por `"$PAPER_SEARCH_DIR"`. **2)** Foi removido o campo `required_environment_variables` do frontmatter (fora da especificação; a chave OpenRouter era opcional). **3)** Foi acrescentado um bloco *Project adaptation* no topo: fallback para OpenAlex e fontes de SLA/ELT, outputs em `research/`. Os exemplos do repositório (wildfire-streamflow, ~PDFs) não foram copiados |
| `skill-creator`, `pdf`, `docx`, `xlsx` | [anthropics/skills](https://github.com/anthropics/skills) | `e4bb5d9` (2026-11-16) | Apache-2.0 (`LICENSE.txt` em cada pasta) | Nenhuma |

**Skills do projeto** (criadas com o `skill-creator`): `daily-study-planner`, `english-examiner`, `speaking-coach`.

## Compatibilidade Claude Code × Codex

| Tema | Claude Code | Codex (CLI 0.158) | Solução |
|---|---|---|---|
| Pasta de skills do projeto | `.claude/skills/` | `.agents/skills/` (confirmado no código-fonte do openai/codex) | Ficheiros reais em `.agents/skills/` e symlink `.claude/skills` para essa pasta. Os symlinks *dentro* de `.agents/skills` podem ser bloqueados pelo sandbox do Codex, por isso não se usam |
| Instruções do projeto | `CLAUDE.md` | `AGENTS.md` | `AGENTS.md` é a fonte; `CLAUDE.md` importa-o com `@AGENTS.md` |
| Frontmatter | `name`, `description` (+ `allowed-tools`, `license`…) | `name`, `description` (os outros campos são ignorados) | Todas as skills têm `name` + `description` válidos |
| Subagentes | Sim | Sim (depende da configuração) | As skills Claude Tutor e o `english-examiner` têm fallback "sem subagentes" |
| Ferramentas citadas nos SKILL.md (`WebSearch`, `WebFetch`) | Nativas | Pesquisa web do Codex / `curl` | Os nomes das ferramentas são indicativos; os dois agentes usam o equivalente |
| Scripts Python (`pdf`, `docx`, `xlsx`, `skill-creator`, `literature-review`) | — | — | `uv venv .venv && uv pip install --python .venv/bin/python -r requirements.txt` (o `.venv` não vai para o Git) |
| Windows | symlinks need `git config core.symlinks true` + Developer Mode | — | **Docker** (recommended: the entrypoint links the skills inside the container) or `scripts/setup-windows.ps1` (creates a directory junction, no admin rights needed) |

## Redundâncias conhecidas

- **Claude Code:** `skill-creator`, `pdf`, `docx` e `xlsx` também existem no plugin `anthropic-skills:` da tua conta. As cópias do projeto garantem que o Codex e outros dispositivos as têm. Qualquer uma das versões funciona.
- **Avaliação de nível:** `langtutor-assessor` vs `level-check` vs `english-examiner`. **SRS:** `langtutor-vocab` vs `recall`. **Tutoria:** `langtutor-session` vs `teach-me`. **Progresso:** `langtutor-tracker`. A divisão de papéis está em `AGENTS.md` ("Known overlaps").

## Incompatibilidades e limites

- **`literature-review`:** desenhada para biomedicina, com bases como PubMed e bioRxiv. Funciona para ELT/SLA com o fallback adaptado. O `paper-search-mcp` não está instalado; é opcional (`PAPER_SEARCH_DIR`). `OPENROUTER_API_KEY` não é necessária.
- **`claude-tutor`:** cursos pensados "para uma tarde". Aqui usam-se só para micro-cursos de um ponto de gramática ou de um tema, não para o plano de 10 semanas.
- **`langtutor-*`:** o assessor gera o seu próprio plano. O perfil (`profile.json`) indica que o plano mestre do projeto prevalece.

## Atualizar as skills externas

```bash
S=$(mktemp -d)
git clone --depth 1 https://github.com/TakeOff-Team/claude-tutor "$S/ct"
diff -r "$S/ct/skills/tutor" .agents/skills/tutor   # rever as diferenças antes de copiar
# copiar só o que for aprovado e atualizar o commit nesta tabela
```

Volta sempre a aplicar as adaptações da tabela (ex.: `literature-review`) depois de atualizar.

# English Boost 🇺🇸 → 🇧🇪

Intensivo de inglês **A2 → B1 sólido (B2 como meta esticada)** de **25/11/2026 a 01/02/2027**, para o Erasmus na Howest (AI Engineer).
Funciona com o **Claude Code** e com o **Codex**, com skills partilhadas e todo o progresso no Git.

## Começar (todos os dias)

```bash
./estudar.sh          # abre http://127.0.0.1:8765 no browser
```

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

```bash
git clone <o teu repositório privado> English && cd English
bash scripts/fetch-official-materials.sh        # testes oficiais Cambridge (não vão para o Git)
uv venv .venv && uv pip install --python .venv/bin/python -r requirements.txt   # só para PDF/DOCX/XLSX
```

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

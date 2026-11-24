# Grammar unit template

Use `materials/grammar/P1-02.md` as the gold example. Every unit follows this skeleton. Explanations are in Portuguese and examples and exercises are in English.

```markdown
# <ID> · <title> (<CEFR>)

**Objetivo:** <one sentence: what the learner can do + 1–2 Erasmus/AI example sentences>
**Tempo:** 22 min (Fase 1) / 25 min (Fase 2) · **Gabarito:** `answers/<ID>.md`

## 1. Descobre a regra (2 min)
<5–7 example sentences in an Erasmus/campus/AI context, with the target form in bold>
**Pergunta:** <1–2 questions that lead to the rule>

## 2. Explicação (4 min)
<a table of forms; at most 4 rules; uses; contrast with Portuguese where it causes errors>

## 3. Erros típicos
| ❌ | ✅ | (Porquê, optional) |  ← 4–5 errors typical of Portuguese speakers

## 4. Exercícios
### A · <controlled: fill in / choose>       (6–8 items)
### B · <transformation / question formation> (4–6 items)
### C · <error correction: 1 error each>      (4–5 items)
### D · Produção: <personal, Erasmus-context task> (not scored)

## 5. Pronúncia
<1–2 points tied to the form (contractions, endings, stress, intonation)> + a shadowing line in American English

## 6. Prática extra
<2–3 links from resources/catalog.md, or verified with curl before adding>
```

Answer key file (`answers/<ID>.md`):

```markdown
# Gabarito <ID>
**A** 1. … 2. …   (accept variants and list them)
**B** …
**C** …  (show the corrected word in bold)
**D:** pessoal. Verifica: <3 checkpoints>
**Pontuação:** A–C = N itens. ≥ 90% → ✅ · 70–89% → ☑️ · < 70% → 🔄
```

Quality checks before saving:
- Every scored item has exactly one clearly correct answer, or the key lists all accepted variants.
- The words given in reorder tasks can produce the correct answer, with no extra auxiliaries that force an error.
- Use American spelling and usage (color, apartment, on the weekend). Mention the British variant only when the learner will hear it in Belgium.
- Context sentences reflect the learner's real life: Howest, Kortrijk/Bruges, flatmates, AI coursework, city hall, the bank.
- Phase 2 units add a "Uso académico/técnico" line to section 2 (e.g. the passive in documentation, hedging in reports).

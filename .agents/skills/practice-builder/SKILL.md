---
name: practice-builder
description: Builds an extra practice set for the English Boost learner, beyond the daily plan, from the choices made on the web app's Practice page (skills, grammar points, listening/speaking/reading/writing type, topics, level, time, exercise types, a free note). Writes an interactive, auto-graded practice file plus a hidden answer key, adds short speaking/writing tasks and 1–3 verified external links, then opens it in the app. Use when the message says "create a practice set", "practice-builder", comes from the Practice page with a list of choices, or the learner asks for "extra practice", "more exercises on X", "quero praticar mais X" outside the plan.
---

# Practice Builder

Juan chose what he wants to practise on the **Practice** page. Your job: turn those choices into **one short, useful practice set** that he does in the app. Practice first, theory second. Follow `AGENTS.md` (simple English only, never Portuguese, honest level).

## 1. Read the choices and the learner (2 minutes, no more)

The message lists the choices and ends with `Choices (JSON): {...}`. Keys: `skills`, `grammar` (unit IDs like `P1-02`, or `weak`), `vocabulary`, `listening`, `accent`, `speaking`, `reading`, `writing`, `topics`, `level` (`easier` / `level` / `challenge`), `time` (minutes), `types`, `note`. A missing optional key means "you choose".

Then look quickly at:
- `Language-Tutor/learner-data/english/profile.json`: the level. "My level" = that level. "Easier" = one step down, mostly review. "Challenge" = one step up, with a few harder items.
- `plan/grammar-spine.md`: the title and level of each chosen unit. A unit that is not studied yet (⬜) needs a slightly longer "Quick look".
- `progress/error-log.md` and the latest files in `progress/exercises/`: real mistakes. For `weak`, build the grammar part from these (open errors, units with 🔄, items he got wrong). If there is no data yet, say so in one line and use the units already studied.
- `materials/grammar/<ID>.md` for a chosen unit: reuse its rule, **never copy its items**. New sentences every time.

You decide the mix. Use your judgement: if he chose Grammar + Speaking + "Housing", the grammar items can be about housing, and the speaking task can be a flat-viewing role-play that uses the same grammar.

## 2. Size it to the time

| Time | Scored items | Other parts |
|---|---|---|
| 10 min | 8–10 | 1 short "Your turn" |
| 20 min | 12–16 | 1 listening or reading part if chosen + 1 "Your turn" |
| 30 min | 16–22 | listening/reading + 1–2 "Your turn" |
| 45 min | 22–30 | listening/reading + 2 "Your turn" + 1 extra link |

Every chosen skill gets at least one part. Grammar and vocabulary are scored items. Listening and reading are scored questions. Speaking and writing go in "Your turn" (the tutor gives feedback in the chat).

## 3. Write the files

- ID: `YYYY-MM-DD-<slug>` (today's date from the system, slug = 2–5 lowercase words with hyphens, for example `2026-11-26-past-present-housing`). If the file exists, add `-2`.
- Practice set: `materials/generated/practice/<ID>.md`
- Answer key: `materials/generated/practice/answers/<ID>.md`

Follow `references/practice-template.md` exactly. The app turns numbered items under a `## … Practice …` heading into answer boxes and grades them with the key, so the format matters.

## 4. Listening, reading and external materials

- **Listening:** the app can read a script aloud. Put a short script (60–150 words, natural, the chosen accent and topic) in a ```` ```listen ```` block, then numbered questions about it. For "international" voices, write speakers with simple non-native English (a Spanish, a German and a Belgian student…). You may add one external listening with a transcript from `resources/catalog.md`, but your questions must come from text you actually read (WebFetch the transcript). Never ask questions about audio you could not read.
- **Reading:** write the text yourself (level-appropriate, 120–250 words) or use a real page you read.
- **Extra materials:** 1–3 links that fit the choices. Prefer `resources/catalog.md`. A new link is allowed only after you check it is live (`curl -s -o /dev/null -w "%{http_code}" <url>` gives 200) and that it goes **directly** to the exercise, test or episode, not a preparation page. If you add a good new resource, also add it to `resources/catalog.md`.

## 5. Check, then open it

Before you answer, check:
- Items are numbered 1..N with no gaps across the whole file. "Your turn" items are not in the key.
- Every key line has all accepted answers (` / `). Contractions are fine (the app accepts "isn't" = "is not"). The app also accepts a full sentence when the item has a `___` gap, so write gap items with one gap each.
- Simple English, American spelling, real Erasmus contexts (Howest, Kortrijk, Bruges, flatmates, AI classes).

Then reply in the chat in 2–4 short lines: what is in the set and how long it takes, and one tip. End with the marker on its own line:

```
[[open:practice:<ID>]]
```

Do not show the answers in the chat. When Juan sends his wrong answers later, explain them briefly and log recurring errors in `progress/error-log.md`.

---
name: practice-builder
description: Builds an extra practice set for the English Boost learner, beyond the daily plan, from the choices made on the web app's Practice page (skills, grammar points, listening/speaking/reading/writing type, topics, level, time, exercise types, a free note). Researches real material (verified direct exercise links, real American audio with transcripts), writes a demanding, interactive, auto-graded practice file plus a hidden answer key, runs the quality checker, then opens it in the app. Use when the message says "create a practice set", "practice-builder", comes from the Practice page with a list of choices, or the learner asks for "extra practice", "more exercises on X", "quero praticar mais X" outside the plan.
---

# Practice Builder

Juan chose what he wants to practise on the **Practice** page. Your job: build **one demanding, well-made practice set** that really trains him. He said it clearly: weak, obvious exercises are useless; he prefers a longer, harder set that makes him think. Quality beats speed. Follow `AGENTS.md` (simple English only in the files, never Portuguese, honest level).

**Gold standard:** `references/example-set.md` + `references/example-key.md`. Read them before you write. Match that quality: a "Learn it" built on real explanation pages, varied tasks, 4-option multiple choice, no answer in the question, a long listening with traps, real audio with your own questions, a task card for speaking.

## 1. Read the choices and the learner

The message ends with `Choices (JSON): {...}`. Keys: `skills`, `grammar` (unit IDs like `P1-02`, or `weak`), `vocabulary`, `listening`, `accent`, `speaking`, `reading`, `writing`, `topics`, `level` (`easier` / `level` / `challenge`), `time` (minutes), `types`, `note`. A missing optional key means "you choose".

Then read:
- `Language-Tutor/learner-data/english/profile.json`: the level (now about A2+/B1-).
- `plan/grammar-spine.md` and `materials/grammar/<ID>.md` for chosen units: the rule. **Never copy unit items**: new sentences every time.
- `progress/error-log.md` and `progress/exercises/*.json`: his real mistakes. Build traps around them. For `weak`, the grammar part comes from these.

**Level** changes the language and the content, not the effort:
- `easier`: A2 language, review content, but the tasks still need recall and choice.
- `level`: A2+/B1 language and tasks.
- `challenge`: B1/B1+: longer texts, faster dialogues, inference, less support.

## 2. Find real material (5–10 minutes)

**External material comes first.** Juan said it clearly: short summaries made up by the tutor teach too much, too badly. Quantity is not quality. Good teachers already explained these points on the web. Use their work.

- **The explanation ("Learn it") comes from a real page.** Pick the page for each point from the `## Explanations` section of `resources/exercise-links.md`. Open it (`curl -s` or WebFetch) and **read it**. Then link it at the top of "Learn it" and explain the point **from that page**: its rules, its order and its kind of examples, in simple English, adapted to Juan's life. Say where the notes come from. Short quotes are fine; never copy the whole page.
- **Teach fewer points, well.** At most 2–3 grammar points, or 6–8 new words or phrasal verbs, in one set. Each one gets a real explanation (see rule 11). If the choices cover more, choose the most useful ones and say so in the reply.
- To add an explanation page: open it, check that it really explains the point (rules and examples on that page, not a menu), then add a row to `## Explanations` with the date.
- **Direct links only from `resources/exercise-links.md`.** It lists pages where the exercise or the audio is **on the page itself** (checked). Pick 1–3 that fit the choices for "Extra materials". Never link a home page, a course index, a "choose a lesson" page, or a page you did not check. The checker rejects any link that is not in that file.
- To add a new direct link: open it (`curl -s` or WebFetch), confirm the questions or the audio are on that page, then add a row to `resources/exercise-links.md` with the date. Only then use it.
- **Listening with real audio:** for listening, use one ESL Lab lesson from the list when the topic fits. Read its transcript at the same address plus `-script/` (for example `https://www.esl-lab.com/easy/party-invitations-script/`, via `curl -s` or WebFetch) and write **your own** questions about it in the set. Link only the lesson page, never the script page (it shows the answers). Never write questions about audio you did not read.

## 3. Quality rules (the checker enforces most of them)

1. **The answer is never visible in the question.** Brackets may hold: a **meaning** `(= visit my home)` or a **base verb when the task is the form** (`(cook)` → *cooked*). Never the answer word itself, like `(hang)` for *hang out*. Never options in brackets: options go in a multiple-choice list (rule 12).
2. **Recall before recognition.** Vocabulary items start from meaning or context, and Juan produces the word. Phrasal verbs: write the whole phrasal verb, or choose the particle from 4 options. Never just copy a word.
3. **Every item needs a decision:** tense from the time words, form vs meaning, false friends, the typical Portuguese-speaker errors (*make homework, people is, I have 22 years, didn't went, look forward to see*).
4. **At least 3 different task types** in each set, max 10 items per section, max 40% of items with a single word in brackets. Menu: meaning→word · choose (4 options) · form in context (tense chosen by the context) · find and correct the mistake · transform/rewrite · word order · question formation · cloze text (a short connected text with gaps) · listening/reading questions (detail, gist, inference).
5. **Size** (scored items, more is fine): 10 min → 12+ · 20 min → 20+ · 30 min → 28+ · 45 min → 36+. Say the honest time in the meta line ("about 30 min").
6. **Listening scripts** (```` ```listen ````): at least 120 words (80 for 10 min). Natural speech with **traps**: plans that change, numbers, corrections ("Friday… no, Saturday"), two similar options. Start with `voices: Name=f, Name=m` so each speaker gets the right voice (the app reads it aloud with real voices). Questions **paraphrase** the text, they don't quote it. Mix detail, gist and inference. Inference questions are multiple choice (rule 12).
7. **Reading:** 150–300 words (A2+/B1), with the same question types as listening.
8. **Speaking / writing:** a task card under `### Your turn · Speaking` (or Writing): the situation, the goal, 3–5 required elements (structures or words from the set), and a short self-check list.
9. **Key:** one line per item, **all** acceptable answers after ` / ` (with and without *the*, numbers as digits and words, the short answer and the full sentence). Contractions are fine (the app accepts *isn't* = *is not*).
10. **Context:** Juan's real life: Howest, Kortrijk, Bruges, flatmates, AI classes, city hall, bank, parties. American spelling.
11. **"Learn it" is a real explanation, not a summary.** It starts with the external page (section 2). For each grammar point: what it means, when we use it, the form (a small table), 3+ full example sentences, and the typical mistake ✗ → ✓. For each word or phrasal verb: its own table row with the meaning and a full example sentence, plus notes like "the pronoun goes in the middle: *pick me up*". Never a line like *move in · fill in · look for · turn on · find out*: a list without meanings teaches nothing. The checker rejects 5+ points on one line and a "Learn it" under 150 words.
12. **Multiple choice = exactly 4 options**, written at the end of the item: `a) … b) … c) … d) …` (on the same line, or each on its own indented line). The app shows them as tick boxes, one per line. Exactly one option is correct; the other three are real traps (the typical errors), not silly answers. The key starts with the letter: `b) full option text`.

## 4. Write the files

- ID: `YYYY-MM-DD-<slug>` (today's date from the system; slug = 2–5 lowercase words, e.g. `2026-11-27-past-present-housing`). If the file exists, add `-2`.
- Set: `materials/generated/practice/<ID>.md` · key: `materials/generated/practice/answers/<ID>.md`.
- Follow `references/practice-template.md`: the app turns numbered items under a `## … Practice …` heading into answer boxes, so the format matters.

## 5. Check, then review like a strict teacher

1. Run `python3 scripts/check_practice.py <ID> --time <minutes> --skills <comma list> --online`. Fix every ERROR and run it again until it prints `OK: ready to show`.
2. Then re-read every item as a demanding teacher:
   - Can he answer without knowing the point? Then make it harder.
   - Is there exactly one correct answer, or are all of them in the key?
   - Is the answer visible anywhere?
   - Is the listening long enough to need two listens?
   - Could Juan learn the point from "Learn it" alone, with the linked page? Does every word have a meaning and an example?

   Fix what you find, and run the checker again.

## 6. Reply

In the chat, write 2–4 short lines: what the set contains, the honest time, and one tip, for example "Listen twice before you open the transcript". End with the marker on its own line:

```
[[open:practice:<ID>]]
```

Never show the answers in the chat. When Juan sends his wrong answers later, explain each one briefly and log recurring errors in `progress/error-log.md`.

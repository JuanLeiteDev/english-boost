# Practice set template

Everything in **simple English**. Short. The app renders this Markdown and adds answer boxes to numbered items under any `##` heading that contains the word **Practice**.

````markdown
# <Short title, for example: Past & present simple · Housing>

*<skills> · <level> · <time> min*

## 1. Quick look
<Only for grammar or vocabulary that was chosen. Max 5 lines per point: one tiny table or 2–3 bullets + 2 examples with the form in **bold**.>

## 2. Practice · Grammar
### A · <Fill the gap>
1. My flatmate ___ (cook) every evening.
2. Last week we ___ (visit) Bruges.

### B · <Choose the right word>
3. Yesterday I ___ home late. (go / went / goes)

### C · Find the mistake (one in each)
4. She don't like the new room.

## 3. Practice · Listening
```listen
Anna: Hi! Are you the new student in room 4?
Tom: Yes, I arrived yesterday. ...
```
5. Where did Tom arrive yesterday?

## 4. Practice · Reading
<short text>
6. <question>

### Your turn · Speaking
<One task. Say what to do in 2–3 lines, for example: "Record 1 minute in the chat (microphone): describe your room. Use the past simple twice.">

### Your turn · Writing
<One task: who, what, how many words.>

## Extra materials
- [<name, what to do there>](https://direct-link) · <1 line: why, how long>
````

## Rules for items

- **One `___` per item.** The learner can type the missing word or the full sentence.
- **Multiple choice:** put the options in brackets at the end, `(go / went / goes)`, and write the correct word in the key. Do not use a) b) c) letters.
- **Find the mistake:** one mistake per sentence. The key is the corrected word or the corrected sentence, with the fixed part in **bold**.
- **Rewrite / word order:** the key is the full sentence. Give every correct order after ` / `.
- **Listening/reading questions:** short answers (1–4 words) are easiest to grade. Key: all good short answers, ` / ` between them.
- Number items **1..N across the whole file** (do not restart at 1 in each section).
- Headings with "Your turn" are not graded: the app shows a text box with "Send to the tutor". They must be `###` headings **inside a `## … Practice …` section** (if there is no other practice section before them, add `## Practice · Your turn`).

## Answer key (`answers/<ID>.md`)

```markdown
# Answer key · <ID>

1. cooks
2. visited
3. went
4. She **doesn't** like the new room. / doesn't
5. in Kortrijk / Kortrijk

**Score:** 5 items · 90%+ mastered · 70–89% done · under 70% repeat
```

- One line per scored item: `N. answer`. Alternatives after ` / `. Optional words in `( )`. Notes in English in `( )`, for example `(also accepted: …)`.

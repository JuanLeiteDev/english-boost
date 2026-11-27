# Practice set template

Read `example-set.md` first: it shows the expected quality. Everything in **simple English**. The app renders this Markdown and adds answer boxes to numbered items under any `##` heading that contains the word **Practice**.

````markdown
# <Topic · focus>   (for example: Housing · Past vs present simple & listening)

*<skills> · <level> · about <honest time> min · <N> scored items + speaking*

## 1. Quick look
<Only for the grammar/vocabulary chosen. One small table or 3 bullets + 2 examples with the form in **bold**. Add the trap: ✗ typical error → ✓ correct.>

## 2. Practice · <Grammar or Vocabulary>
### A · <task type 1, e.g. Read the meaning, write the phrasal verb>
1. I want to ___ for the football team. Where is the list? (= put my name on it)

### B · <task type 2, e.g. Choose the right form: the time words decide>
2. Last year I ___ in Lisbon. Now I live in Kortrijk with two flatmates. (live)

### C · <task type 3, e.g. Find the mistake and write the correct sentence>
3. Yesterday I didn't went to class.

## 3. Practice · Listening
### D · <situation> (listen twice, then answer; open the transcript only at the end)
```listen
voices: Anna=f, Tom=m
Anna: …   (120+ words, natural, with a changed plan / numbers / a correction)
Tom: …
```
4. When is the meeting now? a) … b) … c) …
5. Why did Tom change the time?

### E · Real audio: <ESL Lab lesson title>
Open [ESL Lab · <title>](<direct lesson link from resources/exercise-links.md>), listen twice, then answer here.
6. <question written from the transcript you read>

### Your turn · Speaking
**Role-play.** <situation + goal>
- <required element 1>
- <required element 2>
- Check yourself: <2 quick checks>

## Extra materials
- [<site · exercise name>](<direct link from resources/exercise-links.md>) · <what to do> · <minutes>
````

## Item rules (the checker tests them)

- **One `___` per item.** Juan may type the missing words or the full sentence; both are graded.
- Brackets hold a meaning `(= …)`, a base verb when the task is the form, or 3+ options `(make / do / take)`. **Never the answer.**
- Multiple choice with long options: `a) … b) … c) …` at the end of the item; key `b) full option text` (Juan can type `b` or the text).
- Find the mistake: one mistake per sentence. Key: the corrected sentence with the fix in **bold**, then ` / ` the corrected word(s).
- Number items **1..N across the whole file**. Max 10 items per `###` section; at least 3 task types.
- "Your turn" headings are not graded (the app shows a text box with "Send to the tutor"). They must be `###` inside a `## … Practice …` section.

## Answer key (`answers/<ID>.md`)

```markdown
# Answer key · <ID>

1. sign up
2. b) Saturday at eight / Saturday at 8
3. Yesterday I didn't **go** to class. / go / didn't go

**Score:** N items · 90%+ mastered · 70–89% done · under 70% repeat
```

# Screen recordings (real app, demo data)

Made by `scripts/record.mjs` (Playwright + CDP screencast, resampled to constant 60 fps). Re-run: `source env.sh && PLAYWRIGHT_BROWSERS_PATH=$PWD/.tools/ms-playwright node scripts/record.mjs [clip ...]`.
All clips: `public/recordings/<name>.mp4` (3840×2160, 60 fps, H.264) + `<name>.json` (events in CSS px of 1920×1080). Stills: `public/stills/app-today.png`, `progress.png`, `grammar.png` (3840×2160).

| Clip | Duration | Marks (s) |
|---|---|---|
| `today` | 8.07 s | timer-start 1.94, block-done 3.96, hover-open 5.55 |
| `exercise` | 13.47 s | open-unit 3.21, check 10.85, score 10.86 |
| `research` | 8.75 s | table 5.24 |
| `cambridge` | 20.50 s | send-1 5.01, pill 7.81, send-2 14.24, reply-2 17.06 |
| `speaking` | 14.45 s | mic-on 1.96, mic-off 6.78, transcript 7.33, send 9.24, correction 11.04 |
| `progress` | 15.40 s | stats 1.88, day-dialog 5.92, level 13.39 |

Exercise: items 5–22 are pre-filled as drafts (localStorage `ans:P1-01`) with key answers; items 1–4 are typed on camera (3 is wrong), so the score is 21/22 (95%). Recorded with the app's fixed CSS (no patch).

`cambridge-tab` (real ceq.inspera.com B1 listening test, audio request aborted + muted): 7.48 s · loaded 1.01, start 3.07, question 3.53, hover-option-a 4.88 · question box [8, 178, 1029, 318] · still `public/stills/cambridge-question.png`.

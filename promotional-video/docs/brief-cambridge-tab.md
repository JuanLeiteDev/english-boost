# Brief: record the REAL Cambridge listening test tab (worker: Codex, network allowed)

Scope is strict: work only inside `promotional-video/`; the only website you may open is
`https://ceq.inspera.com/player/?assessmentRunId=539335544&context=exam` (Cambridge English official
B1 Preliminary listening practice test, public, no login) and the resources that page loads itself.
Never open `.env`. Do not create accounts, do not type personal data, do not submit answers, do not
play or capture the exam audio. If the page asks for a login or personal details, stop and report.
Another worker may be editing `src/scenes/*.tsx` and `src/Promo.tsx`: do not touch `src/`.

## Tools
Reuse the existing recorder: `scripts/rec-lib.mjs` (CDP screencast → 4K 60 fps MP4, mouse/typing
helpers, event log) and the style of `scripts/record.mjs`. Run with
`source env.sh && PLAYWRIGHT_BROWSERS_PATH=$PWD/.tools/ms-playwright node scripts/record.mjs ...`
(add a new target `cambridge-tab`; do not change the other targets' behaviour).
Viewport 1920×1080, deviceScaleFactor 2 (3840×2160 frames), headless Chromium, `--mute-audio`.

## Clip: `public/recordings/cambridge-tab.mp4` + `.json` (same JSON format as the other clips)
1. Open the URL in a fresh page; start the screencast as soon as the page starts loading so the clip
   shows the real loading → test welcome screen (`mark: loaded` when the welcome/start screen is
   fully rendered).
2. Hold ~0.8 s, then move the mouse naturally to the button that starts the test (it may be labelled
   "Start", "Start test", "Begin", "Next" or similar; there may be an intro/instructions screen —
   go through it with the same natural clicks) (`mark: start` on the click).
3. Continue until the first **Part 1 question screen with the audio player** is visible
   (`mark: question`, with `box` = the audio player or the question area). Do NOT press play.
   Hover over the first option (A) for ~1 s so it looks like the learner is about to answer.
4. Hold ~1 s and stop. Target length 7–12 s. Drop dead waiting time at the start if loading is slow
   (but keep at least ~0.4 s of the loading state so the "tab opening" feels real).
Also save `public/stills/cambridge-question.png` (3840×2160) of the question screen.

## Verify
- ffprobe: 3840×2160, 60 fps. Extract 4 frames, look at them downscaled: sharp, no cookie banners
  covering the content (if a cookie/consent banner appears, dismiss it with the least-tracking option
  before recording, or click it on camera as part of the flow if that looks natural), no errors.
- Append one line to `docs/recordings.md` with duration and marks.
- Final message: duration, mark times, screen names you went through, anything odd.

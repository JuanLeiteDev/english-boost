# QA report — English Boost promo v2

Input: `out/english-boost-promo-v2.mp4`; 60.800 s, 1920×1080, 60 fps. Checked 3 downscaled frames per scene and frames at all 19 SFX cues.

## Audio measurements

- Whole file (FFmpeg `loudnorm` first pass): **−18.46 LUFS**, **−0.99 dBTP**, LRA 3.90 LU. Loudness misses the −14 ±1 LUFS target; true peak just meets the −1 dBTP ceiling.
- Estimated voice minus ducked music, dB RMS, from each source clip and `music.wav` at `Music`'s speaking volume 0.18: s1 **25.3**, s2 **21.8**, s3 **16.6**, s4 **15.5**, s5 **16.6**, s6a **18.0**, learner **16.0**, s6b **15.9**, s7 **16.7**, s8 **20.3**. Opening music is quieter; s3–s7 meet the 15–20 dB aim.
- Music uses a 0.3 s duck ramp, 0.62 base and 0.18 under speech. The source curve is continuous across line gaps. A listening pass is still needed to judge perceived gap smoothness.
- 100 ms FFmpeg true-peak windows near every cue (dBTP; windows include voice/music): s3 14.99 tick **−7.5**, 17.19 rise **−13.3**.
- s4 20.42 click **−12.8**, 21.86 click **−9.4**, 23.50 click **−7.5**, 23.65 success **−11.0**.
- s5 26.49 click **−10.4**, 28.43 whoosh **−5.2**, 29.42 pop **−6.7**, 31.36 click **−5.2**, 33.28 success **−10.1**.
- s6 36.95 rec **−7.3**, 42.32 click **−10.6**, 42.76 pop **−7.1**, 44.27 click **−6.3**, 46.08 success **−13.5**.
- s7 49.29 tick **−9.5**, 50.09 tick **−7.5**, 50.89 tick **−10.5**. No cue window clips. The SFX files peak at −6 dBFS before their 0.30–0.40 volume props, so their isolated peaks are below the voice.

## Problems and changes

- **Whole file:** −18.46 LUFS is 3.46 LU below the lower target bound. A simple gain increase would exceed the peak ceiling. Suggested fix: final loudness normalization with a true-peak limiter, then measure the coordinator's final render. No source volume changed.
- **42.32 s, s6 Speaking:** the waveform crossed “Transcrito no meu computador.” Moved `Wave` top from 330 to 560 px in `src/scenes/S6Speaking.tsx`; it now sits below the caption by layout geometry. The rendered MP4 still contains the old overlap until rerendered.
- **14.99/17.19 s, s3; 21.86/23.50/23.65 s, s4; 26.49/33.28 s, s5; 36.95/42.32/44.27/46.08 s, s6; 49.29/50.09/50.89 s, s7:** SFX overlap spoken words, including stressed ones (for example “Cambridge”, “corrigidos”, “histórico”). These cues are quieter than the voice, but the brief's no-collision criterion is unmet. Suggested fix: delay or mute selected accents after a listening review; UI clicks may need to stay with the action.
- **Other checked frames:** no black/blank frame, cut-off headline, or important UI text obscured at the sampled times. The `say(...)` cue words matched the visible scene actions at those samples.

`source env.sh && npx tsc --noEmit` passed. A single-frame source render was attempted, but Chrome launch failed with sandbox `Operation not permitted`; the placement fix needs visual confirmation in the coordinator's rerender.

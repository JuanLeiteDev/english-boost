"""Build the original music and UI sounds for the promotional video.

Run from any directory with: .venv/bin/python scripts/music.py
All timing comes from src/data/timeline.json; no samples are used.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import soundfile as sf


ROOT = Path(__file__).resolve().parents[1]
SR = 48_000
BPM = 100
BEAT = 60 / BPM
RNG = np.random.default_rng(87241)
TIMELINE = json.loads((ROOT / "src/data/timeline.json").read_text())
SCENES = TIMELINE["scenes"]
MUSIC_LENGTH = TIMELINE["duration"] + 1.0
MUSIC = np.zeros((round(MUSIC_LENGTH * SR), 2), dtype=np.float32)


def midi(note: int) -> float:
    return 440.0 * 2 ** ((note - 69) / 12)


def envelope(n: int, attack: float, release: float) -> np.ndarray:
    """A smooth envelope with silence at both ends."""
    env = np.ones(n, dtype=np.float32)
    a = min(n, max(1, round(attack * SR)))
    r = min(n, max(1, round(release * SR)))
    env[:a] *= np.sin(np.linspace(0, np.pi / 2, a, dtype=np.float32)) ** 2
    env[-r:] *= np.sin(np.linspace(np.pi / 2, 0, r, dtype=np.float32)) ** 2
    return env


def place(signal: np.ndarray, start: float, level: float, pan: float = 0.0) -> None:
    first = round(start * SR)
    if first >= len(MUSIC) or first < 0:
        return
    end = min(first + len(signal), len(MUSIC))
    # Equal-power stereo placement; narrow panning keeps the center steady.
    angle = (pan + 1) * np.pi / 4
    MUSIC[first:end, 0] += signal[: end - first] * level * np.cos(angle)
    MUSIC[first:end, 1] += signal[: end - first] * level * np.sin(angle)


def band_noise(n: int, low: float, high: float) -> np.ndarray:
    """Soft spectral band limiting, entirely from seeded white noise."""
    spectrum = np.fft.rfft(RNG.standard_normal(n).astype(np.float32))
    freq = np.fft.rfftfreq(n, 1 / SR)
    high_pass = 1 - np.exp(-((freq / max(low, 1)) ** 4))
    low_pass = 1 / np.sqrt(1 + (freq / high) ** 8)
    result = np.fft.irfft(spectrum * high_pass * low_pass, n).astype(np.float32)
    return result / (np.std(result) + 1e-8)


def pad_note(note: int, duration: float) -> np.ndarray:
    """Two gently detuned saw oscillators, harmonically low-passed at 650 Hz."""
    n = round(duration * SR)
    t = np.arange(n, dtype=np.float32) / SR
    f = midi(note)
    out = np.zeros(n, dtype=np.float32)
    for detune in (0.996, 1.004):
        for harmonic in range(1, min(10, int(2300 / f) + 1)):
            hz = f * detune * harmonic
            low_pass = 1 / np.sqrt(1 + (hz / 650) ** 8)
            out += (low_pass / harmonic) * np.sin(2 * np.pi * hz * t)
    return out * envelope(n, 0.65, min(1.45, duration * 0.25)) * 0.20


def pluck(note: int, duration: float = 0.37) -> np.ndarray:
    n = round(duration * SR)
    t = np.arange(n, dtype=np.float32) / SR
    f = midi(note)
    tone = (
        np.sin(2 * np.pi * f * t)
        + 0.21 * np.sin(2 * np.pi * 2 * f * t)
        + 0.055 * np.sin(2 * np.pi * 3 * f * t)
    )
    decay = np.exp(-10 * t)
    return (tone * decay * envelope(n, 0.008, 0.045)).astype(np.float32)


def bass(note: int, duration: float = 0.65) -> np.ndarray:
    n = round(duration * SR)
    t = np.arange(n, dtype=np.float32) / SR
    f = midi(note)
    tone = np.sin(2 * np.pi * f * t) + 0.12 * np.sin(2 * np.pi * 2 * f * t)
    return (tone * np.exp(-2.4 * t) * envelope(n, 0.025, 0.15)).astype(np.float32)


def kick() -> np.ndarray:
    n = round(0.34 * SR)
    t = np.arange(n, dtype=np.float32) / SR
    freq = 47 + 68 * np.exp(-t * 38)
    phase = 2 * np.pi * np.cumsum(freq) / SR
    tone = np.sin(phase) * np.exp(-14 * t)
    puff = band_noise(n, 90, 650) * np.exp(-75 * t) * 0.07
    return ((tone + puff) * envelope(n, 0.004, 0.04)).astype(np.float32)


def hat() -> np.ndarray:
    n = round(0.105 * SR)
    t = np.arange(n, dtype=np.float32) / SR
    return (band_noise(n, 3200, 9500) * np.exp(-49 * t) * envelope(n, 0.002, 0.018)).astype(np.float32)


def impact(duration: float = 0.30) -> np.ndarray:
    n = round(duration * SR)
    t = np.arange(n, dtype=np.float32) / SR
    phase = 2 * np.pi * np.cumsum(52 + 42 * np.exp(-t * 28)) / SR
    tone = np.sin(phase) * np.exp(-12 * t)
    air = band_noise(n, 100, 1200) * np.exp(-25 * t) * 0.11
    return ((tone + air) * envelope(n, 0.006, 0.065)).astype(np.float32)


def make_music() -> None:
    # C major, with suspended/color tones. The narrow voicings leave room for narration.
    chords = {
        "s1": ([48, 55, 59, 62], 36),  # Cmaj9
        "s2": ([48, 53, 57, 60], 41),  # Fmaj7
        "s3": ([48, 52, 55, 57], 45),  # Am7
        "s4": ([50, 55, 60, 62], 43),  # Gsus4
        "s5": ([48, 53, 57, 60], 41),
        "s6": ([48, 52, 55, 57], 45),
        "s7": ([50, 55, 60, 62], 43),
        "s8": ([48, 55, 59, 62], 36),
    }
    beat_sound = kick()
    hat_sound = hat()

    for scene in SCENES:
        sid = scene["id"]
        start = float(scene["start"])
        span = float(scene["duration"])
        notes, root = chords[sid]
        final = sid == "s8"
        pad_duration = min(MUSIC_LENGTH - start, span + (1.0 if final else 0.38))
        for j, note in enumerate(notes):
            level = 0.43 if sid == "s1" else 0.52
            if sid in ("s5", "s6", "s7"):
                level *= 1.10
            place(pad_note(note, pad_duration), start, level, pan=(-0.28 if j % 2 else 0.28))

        # Repeating small chord tones provide rhythm without a foreground melody.
        step = 1.2 if sid == "s1" else (0.3 if sid == "s7" else 0.6)
        if final:
            step = 1.2
        for i, offset in enumerate(np.arange(0, span - 0.12, step)):
            if final and offset > 3.6:
                continue
            note = notes[[1, 3, 2, 3][i % 4]] + 12
            arp_level = 0.055 if sid == "s1" else 0.068
            if sid in ("s5", "s6", "s7"):
                arp_level *= 1.18
            place(pluck(note), start + float(offset), arp_level, pan=(-0.3 if i % 2 else 0.3))

        # Warm sub pulses remain below the speaking range.
        for offset in np.arange(0, span - 0.15, 1.2):
            if final and offset > 3.6:
                continue
            place(bass(root), start + float(offset), 0.13 if sid == "s1" else 0.18)

        if sid not in ("s1", "s8"):
            for offset in np.arange(0, span - 0.1, 1.2 if sid != "s7" else 0.6):
                place(beat_sound, start + float(offset), 0.12 if sid != "s7" else 0.15)
            for offset in np.arange(0.3, span - 0.04, 0.6):
                place(hat_sound, start + float(offset), 0.026 if sid not in ("s5", "s6", "s7") else 0.035,
                      pan=(-0.2 if round(offset / BEAT) % 2 else 0.2))

        if sid != "s1":
            place(impact(), start, 0.052 if sid != "s8" else 0.040)

    # The last scene resolves on C, with its soft hit 0.3 s after the cut.
    hit_time = float(SCENES[-1]["start"]) + 0.3
    place(impact(0.53), hit_time, 0.18)
    for note in (60, 64, 67):
        place(pluck(note, 0.75), hit_time, 0.038, pan=0.0)

    MUSIC[:] *= envelope(len(MUSIC), 0.3, 2.1)[:, None]
    rms = float(np.sqrt(np.mean(MUSIC.astype(np.float64) ** 2)))
    # This RMS target measures about -16 LUFS on this arrangement (EBU R128).
    target = 10 ** (-18.1 / 20)
    MUSIC[:] *= min(target / rms, 0.86 / float(np.max(np.abs(MUSIC))))
    output = ROOT / "public/audio/music.wav"
    output.parent.mkdir(parents=True, exist_ok=True)
    sf.write(output, MUSIC, SR, subtype="PCM_16")


def save_sfx(name: str, wave: np.ndarray) -> None:
    wave = np.asarray(wave, dtype=np.float32)
    wave *= envelope(len(wave), 0.0015, min(0.012, len(wave) / SR * 0.15))
    wave *= (10 ** (-6 / 20)) / (float(np.max(np.abs(wave))) + 1e-9)
    output = ROOT / "public/audio/sfx" / f"{name}.wav"
    output.parent.mkdir(parents=True, exist_ok=True)
    sf.write(output, wave, SR, subtype="PCM_16")


def make_sfx() -> None:
    def time(seconds: float) -> np.ndarray:
        return np.arange(round(seconds * SR), dtype=np.float32) / SR

    t = time(0.040)
    save_sfx("click", np.sin(2 * np.pi * (430 * t - 1800 * t * t)) * np.exp(-110 * t)
             + 0.14 * band_noise(len(t), 400, 2800) * np.exp(-175 * t))

    t = time(0.030)
    save_sfx("key", 0.7 * band_noise(len(t), 350, 2400) * np.exp(-145 * t)
             + 0.3 * np.sin(2 * np.pi * 210 * t) * np.exp(-95 * t))

    t = time(0.450)
    u = t / 0.450
    airy = band_noise(len(t), 300, 2500) * (1 - u) + band_noise(len(t), 950, 6700) * u
    save_sfx("whoosh", airy * np.sin(np.pi * u) ** 1.5)

    t = time(0.120)
    phase = 2 * np.pi * (420 * t - 1250 * t * t)
    save_sfx("pop", (np.sin(phase) + 0.14 * np.sin(2 * phase)) * np.exp(-31 * t))

    t = time(0.500)
    success = np.zeros(len(t), dtype=np.float32)
    for at, freq in ((0.0, midi(72)), (0.19, midi(76))):
        start = round(at * SR)
        local = t[: len(t) - start]
        note = (np.sin(2 * np.pi * freq * local)
                + 0.16 * np.sin(2 * np.pi * 2 * freq * local)) * np.exp(-7.5 * local)
        note *= envelope(len(note), 0.006, 0.035)
        success[start:] += note
    save_sfx("success", success)

    t = time(0.900)
    u = t / 0.900
    phase = 2 * np.pi * (190 * t + 160 * t * t)
    riser = 0.8 * np.sin(phase) + 0.10 * band_noise(len(t), 700, 3200)
    save_sfx("rise", riser * u ** 1.6)

    t = time(0.020)
    save_sfx("tick", np.sin(2 * np.pi * 830 * t) * np.exp(-180 * t)
             + 0.13 * band_noise(len(t), 900, 4200) * np.exp(-240 * t))

    t = time(0.200)
    save_sfx("rec", (np.sin(2 * np.pi * 570 * t) + 0.16 * np.sin(2 * np.pi * 1140 * t))
             * np.exp(-17 * t))


if __name__ == "__main__":
    make_music()
    make_sfx()

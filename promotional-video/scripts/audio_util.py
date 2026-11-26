"""Shared audio helpers: decode any file to 16 kHz mono float32 with the system ffmpeg
(faster-whisper's own decoder is incompatible with the installed PyAV)."""
import subprocess

import numpy as np


def load_16k(path: str) -> np.ndarray:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()

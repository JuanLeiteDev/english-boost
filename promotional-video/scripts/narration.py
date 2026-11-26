"""Generate the pt-BR narration, one clip per scene, with word timings.

Output:
  public/narration/sNN.mp3          one clip per scene
  src/data/narration.json           durations (s) and word timings, read by the compositions

Voice: Microsoft neural "pt-BR-AntonioNeural" through edge-tts (free).
Run:  .venv/bin/python scripts/narration.py
"""
import asyncio
import json
import subprocess
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "narration"
DATA = ROOT / "src" / "data" / "narration.json"
VOICE = "pt-BR-AntonioNeural"
RATE = "+10%"

# Text is what the voice reads; some English words are spelled for a natural pt-BR pronunciation.
SCENES = [
    ("s1", "Daqui a dois meses, eu vou fazer Érasmus na Bélgica. E o meu inglês ainda não estava pronto."),
    ("s2", "Então, com o Claude Code, eu construí o meu próprio tutor de inglês."),
    ("s3", "O plano não foi inventado pela IA. Ele se baseia na Cambridge, no Quadro Europeu e em vinte e dois estudos científicos."),
    ("s4", "Todo dia eu sei o que estudar, e os exercícios são corrigidos na hora."),
    ("s5", "Para o listening, o tutor me leva direto para uma prova oficial de Cambridge. Eu respondo no chat, e ele corrige com o gabarito."),
    ("s6a", "No spíking, eu falo com o aplicativo."),
    ("s6b", "A voz é transcrita no meu computador, e o tutor me corrige como um professor."),
    ("s7", "E eu acompanho tudo: o meu nível, as horas e o histórico."),
    ("s8", "Uma necessidade real, resolvida com IA. Agora é estudar, e chegar na Bélgica preparado."),
]


def duration(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return float(out.strip())


async def one(key: str, text: str) -> dict:
    com = edge_tts.Communicate(text, VOICE, rate=RATE, boundary="WordBoundary")
    words, audio = [], bytearray()
    async for chunk in com.stream():
        if chunk["type"] == "audio":
            audio += chunk["data"]
        elif chunk["type"] == "WordBoundary":
            # offsets are in 100-ns units
            words.append({"w": chunk["text"], "start": chunk["offset"] / 1e7,
                          "end": (chunk["offset"] + chunk["duration"]) / 1e7})
    path = OUT / f"{key}.mp3"
    path.write_bytes(bytes(audio))
    return {"key": key, "file": f"narration/{key}.mp3", "duration": round(duration(path), 3), "words": words}


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    DATA.parent.mkdir(parents=True, exist_ok=True)
    clips = []
    for key, text in SCENES:
        for attempt in range(3):  # the free service sometimes drops a request
            try:
                clips.append(await one(key, text))
                break
            except Exception as e:  # noqa: BLE001
                print(f"{key}: retry ({e})")
                await asyncio.sleep(2)
        else:
            raise SystemExit(f"could not synthesise {key}")
    DATA.write_text(json.dumps({"voice": VOICE, "clips": clips}, ensure_ascii=False, indent=1), encoding="utf-8")
    for c in clips:
        print(f"{c['key']:4} {c['duration']:6.2f}s  {len(c['words'])} words")
    print(f"total {sum(c['duration'] for c in clips):.1f}s")


asyncio.run(main())

#!/usr/bin/env python3
"""Download the free official Cambridge English sample materials into materials/official/.

Cross-platform (Linux, macOS, Windows), standard library only:
    python3 scripts/fetch_official_materials.py      (Windows: py -3 scripts\\fetch_official_materials.py)

The files are copyrighted by Cambridge, so they are git-ignored and never committed.
"""
import sys
import urllib.request
import zipfile
from pathlib import Path

BASE = "https://www.cambridgeenglish.org"
FILES = [
    ("a2-key", "/Images/504342-a2-key-2020-sample-tests.zip"),
    ("a2-key", "/Images/506886-a2-key-2020-vocabulary-list.pdf"),
    ("b1-preliminary", "/Images/504344-b1-preliminary-sample-papers.zip"),
    ("b1-preliminary", "/Images/168150-b1-preliminary-teachers-handbook.pdf"),
    ("b1-preliminary", "/Images/505234-b1-preliminary-handbook-for-teachers-listening-audio-files.mp3"),
    ("b1-preliminary", "/Images/506887-b1-preliminary-vocabulary-list.pdf"),
    ("b1-preliminary", "/images/231794-cambridge-english-assessing-writing-performance-at-level-b1.pdf"),
    ("b2-first", "/Images/174037-b2-first-sample-paper-1.zip"),
    ("b2-first", "/Images/167791-b2-first-handbook.pdf"),
]


def main() -> int:
    out = Path(__file__).resolve().parent.parent / "materials" / "official"
    failed = 0
    for sub, path in FILES:
        dest = out / sub / path.rsplit("/", 1)[1]
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists() and dest.stat().st_size > 0:
            print(f"ok (já existe)  {sub}/{dest.name}")
        else:
            try:
                req = urllib.request.Request(BASE + path, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=180) as r, open(dest, "wb") as f:
                    while chunk := r.read(1 << 16):
                        f.write(chunk)
                print(f"descarregado    {sub}/{dest.name}")
            except Exception as e:  # keep going with the other files
                failed += 1
                dest.unlink(missing_ok=True)
                print(f"FALHOU          {BASE + path}  ({e})")
                continue
        if dest.suffix == ".zip":
            target = dest.with_suffix("")
            if not target.exists():
                with zipfile.ZipFile(dest) as z:
                    for m in z.namelist():  # refuse path traversal inside the archive
                        if m.startswith("/") or ".." in Path(m).parts:
                            raise SystemExit(f"Entrada suspeita no zip: {m}")
                    z.extractall(target)
                print(f"descompactado   {sub}/{target.name}")
    print(f"Concluído. Materiais em: {out}" + (f"  ({failed} falhas)" if failed else ""))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

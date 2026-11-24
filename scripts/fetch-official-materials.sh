#!/usr/bin/env bash
# Downloads free official Cambridge English sample materials into materials/official/.
# These files are copyrighted by Cambridge, so they are NOT committed to git (see .gitignore).
# Run it again on any new device:  bash scripts/fetch-official-materials.sh
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$root/materials/official"
base="https://www.cambridgeenglish.org"
mkdir -p "$out"/{a2-key,b1-preliminary,b2-first}

fetch() {  # fetch <subdir> <path>
  local dest="$out/$1/$(basename "$2")"
  if [ -s "$dest" ]; then echo "ok (already there)  $1/$(basename "$2")"; return; fi
  curl -fsSL -A 'Mozilla/5.0' --max-time 180 -o "$dest" "$base$2" && echo "downloaded         $1/$(basename "$2")" || echo "FAILED             $base$2"
}

fetch a2-key        /Images/504342-a2-key-2020-sample-tests.zip
fetch a2-key        /Images/506886-a2-key-2020-vocabulary-list.pdf
fetch b1-preliminary /Images/504344-b1-preliminary-sample-papers.zip
fetch b1-preliminary /Images/168150-b1-preliminary-teachers-handbook.pdf
fetch b1-preliminary /Images/505234-b1-preliminary-handbook-for-teachers-listening-audio-files.mp3
fetch b1-preliminary /Images/506887-b1-preliminary-vocabulary-list.pdf
fetch b1-preliminary /images/231794-cambridge-english-assessing-writing-performance-at-level-b1.pdf
fetch b2-first      /Images/174037-b2-first-sample-paper-1.zip
fetch b2-first      /Images/167791-b2-first-handbook.pdf

# Unzip the sample tests next to the zip files
for z in "$out"/*/*.zip; do
  d="${z%.zip}"; [ -d "$d" ] || { mkdir -p "$d" && unzip -q -o "$z" -d "$d" && echo "unzipped           ${d#$out/}"; }
done
echo "Done. Materials in: $out"

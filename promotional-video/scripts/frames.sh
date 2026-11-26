#!/usr/bin/env bash
# Contact sheet of 4 frames from a clip: scripts/frames.sh <clip> t1 t2 t3 t4 <out.png>
set -e
clip=$1; out=${6}; tmp=$(mktemp -d)
i=0; for t in $2 $3 $4 $5; do ffmpeg -v error -y -ss "$t" -i "public/recordings/$clip.mp4" -frames:v 1 -vf scale=960:-1 "$tmp/$i.png"; i=$((i+1)); done
ffmpeg -v error -y -i "$tmp/0.png" -i "$tmp/1.png" -i "$tmp/2.png" -i "$tmp/3.png" -filter_complex "[0][1]hstack[a];[2][3]hstack[b];[a][b]vstack" "$out"
rm -rf "$tmp"

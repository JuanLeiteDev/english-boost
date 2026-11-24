#!/usr/bin/env bash
# Abre a app English Boost no browser:  ./estudar.sh   (opções: --port 8765 --no-browser)
cd "$(dirname "$0")" && exec python3 app/server.py "$@"

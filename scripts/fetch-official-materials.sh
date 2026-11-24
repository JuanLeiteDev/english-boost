#!/usr/bin/env bash
# Kept for compatibility: the downloader is now cross-platform Python.
exec python3 "$(dirname "$0")/fetch_official_materials.py" "$@"

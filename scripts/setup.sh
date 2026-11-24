#!/usr/bin/env bash
# English Boost: setup on Linux/macOS (run once per device): bash scripts/setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."
echo "English Boost: configuração"
if [ -L .claude/skills ] || [ -d .claude/skills/daily-study-planner ]; then echo "✓ .claude/skills -> .agents/skills"
else rm -f .claude/skills; mkdir -p .claude; ln -s ../.agents/skills .claude/skills; echo "✓ link criado"; fi
if [ ! -f .env ]; then  # Docker on Linux: run the container with your UID/GID so files stay yours
  sed -e "s/^EB_UID=.*/EB_UID=$(id -u)/" -e "s/^EB_GID=.*/EB_GID=$(id -g)/" .env.example > .env && echo "✓ .env criado (EB_UID=$(id -u), EB_GID=$(id -g))"
fi
command -v python3 >/dev/null || { echo "✗ Instala o Python 3"; exit 1; }
python3 scripts/fetch_official_materials.py || true
python3 - <<'PY'
import sys; sys.path.insert(0, "app")
import server
print("✓ Claude Code:", server.find_claude() or "✗ não encontrado (instala a extensão no VS Code e faz login, ou: curl -fsSL https://claude.ai/install.sh | bash)")
print("✓ Codex:      ", server.find_codex() or "✗ não encontrado (instala a app Codex/ChatGPT, ou: npm install -g @openai/codex && codex login)")
PY
chmod +x estudar.sh
echo "Pronto. Para estudar: ./estudar.sh"

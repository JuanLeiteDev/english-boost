#!/usr/bin/env bash
# English Boost container entrypoint.
#   serve   (default) start the web app on :8765
#   login   one-time sign-in to Claude, Codex and GitHub (stored in Docker volumes)
#   status  show what is signed in
#   shell   open a bash shell in the project
set -euo pipefail
cd /workspace

# Claude reads skills from $CLAUDE_CONFIG_DIR/skills too. Linking it here makes skills work
# even when the repo was cloned on Windows, where .claude/skills arrives as a text file.
user_skills="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills"
if [ -f /workspace/.claude/skills/daily-study-planner/SKILL.md ]; then
  [ -L "$user_skills" ] && rm -f "$user_skills"   # project link works: avoid listing every skill twice
else
  ln -sfn /workspace/.agents/skills "$user_skills"
fi

git config --global --add safe.directory /workspace
[ -n "${GIT_USER_NAME:-}" ] && git config --global user.name "$GIT_USER_NAME"
[ -n "${GIT_USER_EMAIL:-}" ] && git config --global user.email "$GIT_USER_EMAIL"
if gh auth status >/dev/null 2>&1; then gh auth setup-git >/dev/null 2>&1 || true; fi

claude_ok() { claude auth status 2>/dev/null | grep -q '"loggedIn": *true'; }
codex_ok()  { codex login status 2>&1 | grep -qi 'logged in using'; }
status() {
  printf "Claude: "; claude_ok && echo "✓ com sessão iniciada" || echo "✗ sem sessão (corre: docker compose run --rm app login)"
  printf "Codex:  "; codex_ok && echo "✓ com sessão iniciada" || echo "✗ sem sessão"
  printf "GitHub: "; gh auth status >/dev/null 2>&1 && echo "✓ com sessão iniciada" || echo "– sem sessão (opcional, só para o push)"
}

case "${1:-serve}" in
  serve)
    [ -d materials/official/b1-preliminary ] || python3 scripts/fetch_official_materials.py || true
    status || true
    echo "App: http://127.0.0.1:${HOST_PORT:-8765}"
    exec python3 app/server.py --host 0.0.0.0 --port 8765 --no-browser
    ;;
  login)
    echo "== 1/3 Claude: abre o link que aparece, autoriza e cola o código aqui =="
    claude_ok && echo "✓ já tens sessão" || claude auth login
    echo; echo "== 2/3 Codex: abre o link, introduz o código e entra com a conta ChatGPT =="
    codex_ok && echo "✓ já tens sessão" || codex login --device-auth
    echo; echo "== 3/3 GitHub (opcional, para o botão 'Guardar no Git' fazer push) =="
    if gh auth status >/dev/null 2>&1; then echo "✓ já tens sessão"
    else read -r -p "Entrar no GitHub agora? [s/N] " r; [[ "$r" =~ ^[sSyY] ]] && gh auth login --hostname github.com --git-protocol https --web --skip-ssh-key && gh auth setup-git || true; fi
    echo; status
    ;;
  status) status ;;
  shell) exec bash ;;
  *) exec "$@" ;;
esac

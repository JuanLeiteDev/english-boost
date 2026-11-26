# Source this file to use the subproject's local Node (no global install):  source promotional-video/env.sh
_PV_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
export PATH="$_PV_DIR/.tools/node/bin:$_PV_DIR/node_modules/.bin:$PATH"
export npm_config_update_notifier=false

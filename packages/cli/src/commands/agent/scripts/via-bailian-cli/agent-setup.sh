#!/usr/bin/env bash
# Bailian CLI — Agent Setup Script
#
# Configures a coding agent (Claude Code, Qwen Code, OpenCode, OpenClaw,
# Hermes, Codex) to use DashScope API with a single command.
#
# Usage:
#   curl -fsSL <url>/agent-setup.sh | bash -s -- \
#     --agent claude-code \
#     --base-url https://dashscope.aliyuncs.com/apps/anthropic \
#     --api-key sk-xxxxx \
#     --model qwen3.7-max

set -eo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()    { printf "${BLUE}INFO:${NC} %s\n" "$1"; }
log_success() { printf "${GREEN}✔${NC} %s\n" "$1"; }
log_warning() { printf "${YELLOW}WARNING:${NC} %s\n" "$1" >&2; }
log_error()   { printf "${RED}ERROR:${NC} %s\n" "$1" >&2; }

print_usage() {
  echo ""
  printf "${CYAN}Bailian CLI — Agent Setup${NC}\n"
  cat <<EOF

Usage:
  curl -fsSL <url>/agent-setup.sh | bash -s -- [OPTIONS]

Required Options:
  --agent <name>      Target agent: claude-code, qwen-code, opencode, openclaw, hermes, codex
  --base-url <url>    API base URL
  --api-key <key>     API key
  --model <model>     Default model name

Optional:
  --dry-run           Show what would be written without modifying files
  -h, --help          Show this help message

Examples:
  curl -fsSL <url>/agent-setup.sh | bash -s -- \\
    --agent claude-code \\
    --base-url https://dashscope.aliyuncs.com/apps/anthropic \\
    --api-key sk-xxxxx \\
    --model qwen3.7-max

EOF
}

# ── Check Node.js ─────────────────────────────────────────────────────────────

check_node() {
  if ! command -v node >/dev/null 2>&1; then
    log_error "Node.js is not installed."
    echo ""
    echo "Install Node.js 22+ from one of:"
    echo "  • https://nodejs.org/"
    echo "  • brew install node       (macOS)"
    echo "  • apt install nodejs      (Debian/Ubuntu)"
    echo "  • dnf install nodejs      (Fedora)"
    exit 1
  fi

  local node_major
  node_major=$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo "0")

  if [ "$node_major" -lt 22 ] 2>/dev/null; then
    local node_version
    node_version=$(node -v 2>/dev/null || echo "unknown")
    log_error "Node.js ${node_version} is installed, but version 22+ is required."
    echo ""
    echo "Upgrade Node.js: https://nodejs.org/"
    exit 1
  fi
}

# ── Parse args ────────────────────────────────────────────────────────────────

if [ $# -eq 0 ]; then
  print_usage
  exit 1
fi

for arg in "$@"; do
  case "$arg" in
    -h|--help)
      print_usage
      exit 0
      ;;
  esac
done

# ── Main ──────────────────────────────────────────────────────────────────────

check_node

log_info "Running: npx bailian-cli@latest agent setup $*"
echo ""

npx bailian-cli@latest agent setup "$@"

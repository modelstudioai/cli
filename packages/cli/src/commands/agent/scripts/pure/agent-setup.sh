#!/usr/bin/env bash
# Bailian — Pure Agent Setup (no Node.js / npx required)
#
# Directly writes config files for coding agents to use DashScope API.
#
# Usage:
#   curl -fsSL <url>/agent-setup.sh | bash -s -- \
#     --agent claude-code \
#     --base-url https://dashscope.aliyuncs.com/apps/anthropic \
#     --api-key sk-xxxxx \
#     --model qwen3.7-max

set -eo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()    { printf "${BLUE}INFO:${NC} %s\n" "$1"; }
log_success() { printf "${GREEN}✔${NC} %s\n" "$1"; }
log_warning() { printf "${YELLOW}WARNING:${NC} %s\n" "$1" >&2; }
log_error()   { printf "${RED}ERROR:${NC} %s\n" "$1" >&2; }

VALID_AGENTS="claude-code, qwen-code, opencode, openclaw, hermes, codex"

print_usage() {
  echo ""
  printf "${CYAN}Bailian — Agent Setup (pure, no Node.js required)${NC}\n"
  cat <<'EOF'

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
  curl -fsSL <url>/agent-setup.sh | bash -s -- \
    --agent claude-code \
    --base-url https://dashscope.aliyuncs.com/apps/anthropic \
    --api-key sk-xxxxx \
    --model qwen3.7-max
EOF
}

# ── Helpers ───────────────────────────────────────────────────────────────────

is_anthropic_endpoint() {
  case "$1" in
    */apps/anthropic*) return 0 ;;
    *) return 1 ;;
  esac
}

backup_file() {
  local f="$1"
  [ -f "$f" ] && cp "$f" "${f}.bak.$(date +%s)"
}

ensure_dir() {
  mkdir -p "$1"
}

write_file() {
  local path="$1" content="$2"
  ensure_dir "$(dirname "$path")"
  local tmp="${path}.tmp"
  printf '%s' "$content" > "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$path"
}

# Minimal JSON merge: read existing file, set a top-level key to a JSON value.
# Uses python3/python if available, otherwise falls back to writing fresh.
json_set_key() {
  local file="$1" key="$2" value="$3"
  if [ -f "$file" ] && command -v python3 >/dev/null 2>&1; then
    python3 -c "
import json, sys
try:
    with open('$file') as f: data = json.load(f)
except: data = {}
data['$key'] = json.loads('''$value''')
print(json.dumps(data, indent=2))
" 2>/dev/null && return 0
  fi
  # fallback: cannot merge, caller handles
  return 1
}

# Read existing JSON file, merge env keys, write back
merge_json_env() {
  local file="$1"
  shift
  # remaining args are key=value pairs
  if [ -f "$file" ] && command -v python3 >/dev/null 2>&1; then
    local py_pairs=""
    while [ $# -gt 0 ]; do
      local k="${1%%=*}" v="${1#*=}"
      py_pairs="${py_pairs}d.setdefault('env',{})['${k}']='${v}';"
      shift
    done
    python3 -c "
import json
try:
    with open('$file') as f: d = json.load(f)
except: d = {}
${py_pairs}
print(json.dumps(d, indent=2))
" 2>/dev/null && return 0
  fi
  return 1
}

mask_key() {
  local k="$1"
  printf '%s' "${k:0:6}"
  printf '%*s' $((${#k} - 6)) '' | tr ' ' '*'
}

# ── Agent writers ─────────────────────────────────────────────────────────────

setup_claude_code() {
  local base_url="$1" api_key="$2" model="$3" dry_run="$4"
  local settings="$HOME/.claude/settings.json"
  local onboarding="$HOME/.claude.json"

  if [ "$dry_run" = "1" ]; then
    log_info "[dry-run] Would write: $settings, $onboarding"
    return
  fi

  backup_file "$settings"
  local merged
  if merged=$(merge_json_env "$settings" \
    "ANTHROPIC_AUTH_TOKEN=$api_key" \
    "ANTHROPIC_BASE_URL=$base_url" \
    "ANTHROPIC_MODEL=$model" \
    "ANTHROPIC_DEFAULT_HAIKU_MODEL=$model" \
    "ANTHROPIC_DEFAULT_SONNET_MODEL=$model" \
    "ANTHROPIC_DEFAULT_OPUS_MODEL=$model" \
    "CLAUDE_CODE_SUBAGENT_MODEL=$model"); then
    write_file "$settings" "$merged"
  else
    write_file "$settings" "$(cat <<EOF
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "$api_key",
    "ANTHROPIC_BASE_URL": "$base_url",
    "ANTHROPIC_MODEL": "$model",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "$model",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "$model",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "$model",
    "CLAUDE_CODE_SUBAGENT_MODEL": "$model"
  }
}
EOF
)"
  fi

  backup_file "$onboarding"
  if [ -f "$onboarding" ] && command -v python3 >/dev/null 2>&1; then
    local ob
    ob=$(python3 -c "
import json
try:
    with open('$onboarding') as f: d = json.load(f)
except: d = {}
d['hasCompletedOnboarding'] = True
print(json.dumps(d, indent=2))
" 2>/dev/null) && write_file "$onboarding" "$ob"
  else
    write_file "$onboarding" '{"hasCompletedOnboarding":true}'
  fi

  log_success "Claude Code configured."
  echo "  Written: $settings"
  echo "  Written: $onboarding"
  echo ""
  echo "  Run \`claude\` to start using Claude Code with DashScope."
}

setup_qwen_code() {
  local base_url="$1" api_key="$2" model="$3" dry_run="$4"
  local settings="$HOME/.qwen/settings.json"

  if [ "$dry_run" = "1" ]; then
    log_info "[dry-run] Would write: $settings"
    return
  fi

  backup_file "$settings"
  write_file "$settings" "$(cat <<EOF
{
  "env": {
    "BAILIAN_API_KEY": "$api_key"
  },
  "modelProviders": {
    "openai": [
      {
        "id": "$model",
        "name": "[Bailian] $model",
        "baseUrl": "$base_url",
        "envKey": "BAILIAN_API_KEY"
      }
    ]
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "$model"
  },
  "\$version": 3
}
EOF
)"

  log_success "Qwen Code configured."
  echo "  Written: $settings"
  echo ""
  echo "  Run \`qwen\` to start using Qwen Code with DashScope."
}

setup_opencode() {
  local base_url="$1" api_key="$2" model="$3" dry_run="$4"
  local config="$HOME/.config/opencode/opencode.json"

  local npm="@ai-sdk/openai-compatible"
  is_anthropic_endpoint "$base_url" && npm="@ai-sdk/anthropic"

  if [ "$dry_run" = "1" ]; then
    log_info "[dry-run] Would write: $config (npm: $npm)"
    return
  fi

  backup_file "$config"
  write_file "$config" "$(cat <<EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "provider": {
    "bailian": {
      "npm": "$npm",
      "name": "Alibaba Cloud Model Studio",
      "options": {
        "baseURL": "$base_url",
        "apiKey": "$api_key"
      },
      "models": {
        "$model": {
          "name": "$model"
        }
      }
    }
  }
}
EOF
)"

  log_success "OpenCode configured."
  echo "  Written: $config"
  echo ""
  echo "  Run \`opencode\` then type \`/models\` to select your model."
}

setup_openclaw() {
  local base_url="$1" api_key="$2" model="$3" dry_run="$4"
  local config="$HOME/.openclaw/openclaw.json"

  local api="openai-completions"
  is_anthropic_endpoint "$base_url" && api="anthropic-messages"

  if [ "$dry_run" = "1" ]; then
    log_info "[dry-run] Would write: $config (api: $api)"
    return
  fi

  backup_file "$config"
  write_file "$config" "$(cat <<EOF
{
  "models": {
    "mode": "merge",
    "providers": {
      "bailian": {
        "baseUrl": "$base_url",
        "apiKey": "$api_key",
        "api": "$api",
        "models": [
          {
            "id": "$model",
            "name": "$model",
            "reasoning": false,
            "input": ["text", "image"],
            "contextWindow": 1000000,
            "maxTokens": 65536,
            "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 }
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "bailian/$model"
      }
    }
  }
}
EOF
)"

  log_success "OpenClaw configured."
  echo "  Written: $config"
  echo ""
  echo "  Run \`openclaw\` to start using OpenClaw with DashScope."
}

setup_hermes() {
  local base_url="$1" api_key="$2" model="$3" dry_run="$4"
  local config="$HOME/.hermes/config.yaml"

  local api_mode="chat_completions"
  is_anthropic_endpoint "$base_url" && api_mode="anthropic_messages"

  if [ "$dry_run" = "1" ]; then
    log_info "[dry-run] Would write: $config (api_mode: $api_mode)"
    return
  fi

  if [ "$(uname -s)" = "MINGW"* ] || [ "$(uname -s)" = "MSYS"* ]; then
    log_warning "Hermes Agent does not support native Windows. Please use WSL2."
  fi

  backup_file "$config"
  write_file "$config" "$(cat <<EOF
model:
  default: $model
  provider: custom
  base_url: $base_url
  api_mode: $api_mode
  api_key: $api_key
EOF
)"

  log_success "Hermes Agent configured."
  echo "  Written: $config"
  echo ""
  echo "  Run \`hermes chat -q \"hello\"\` to verify."
}

setup_codex() {
  local base_url="$1" api_key="$2" model="$3" dry_run="$4"
  local config="$HOME/.codex/config.toml"
  local auth="$HOME/.codex/auth.json"

  if [ "$dry_run" = "1" ]; then
    log_info "[dry-run] Would write: $config, $auth"
    return
  fi

  backup_file "$config"
  write_file "$config" "$(cat <<EOF
model_provider = "Model_Studio"
model = "$model"

[model_providers.Model_Studio]
name = "Model_Studio"
base_url = "$base_url"
env_key = "OPENAI_API_KEY"
wire_api = "responses"
EOF
)"

  backup_file "$auth"
  write_file "$auth" "$(cat <<EOF
{
  "OPENAI_API_KEY": "$api_key"
}
EOF
)"

  log_success "Codex configured."
  echo "  Written: $config"
  echo "  Written: $auth"
  echo ""
  echo "  Run \`codex\` to start using Codex with DashScope."
}

# ── Parse args ────────────────────────────────────────────────────────────────

AGENT="" BASE_URL="" API_KEY="" MODEL="" DRY_RUN="0"

if [ $# -eq 0 ]; then
  print_usage
  exit 1
fi

while [ $# -gt 0 ]; do
  case "$1" in
    --agent)    AGENT="$2";    shift 2 ;;
    --base-url) BASE_URL="$2"; shift 2 ;;
    --api-key)  API_KEY="$2";  shift 2 ;;
    --model)    MODEL="$2";    shift 2 ;;
    --dry-run)  DRY_RUN="1";   shift ;;
    -h|--help)  print_usage;   exit 0 ;;
    *) log_error "Unknown option: $1"; print_usage; exit 1 ;;
  esac
done

if [ -z "$AGENT" ] || [ -z "$BASE_URL" ] || [ -z "$API_KEY" ] || [ -z "$MODEL" ]; then
  log_error "All flags are required: --agent, --base-url, --api-key, --model"
  exit 1
fi

# ── Dispatch ──────────────────────────────────────────────────────────────────

echo ""
case "$AGENT" in
  claude-code) setup_claude_code "$BASE_URL" "$API_KEY" "$MODEL" "$DRY_RUN" ;;
  qwen-code)   setup_qwen_code   "$BASE_URL" "$API_KEY" "$MODEL" "$DRY_RUN" ;;
  opencode)    setup_opencode    "$BASE_URL" "$API_KEY" "$MODEL" "$DRY_RUN" ;;
  openclaw)    setup_openclaw    "$BASE_URL" "$API_KEY" "$MODEL" "$DRY_RUN" ;;
  hermes)      setup_hermes      "$BASE_URL" "$API_KEY" "$MODEL" "$DRY_RUN" ;;
  codex)       setup_codex       "$BASE_URL" "$API_KEY" "$MODEL" "$DRY_RUN" ;;
  *)
    log_error "Unknown agent \"$AGENT\". Valid agents: $VALID_AGENTS"
    exit 1
    ;;
esac
echo ""

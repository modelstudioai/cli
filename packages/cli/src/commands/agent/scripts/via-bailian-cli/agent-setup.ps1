# Bailian CLI — Agent Setup Script (Windows PowerShell)
#
# Configures a coding agent (Claude Code, Qwen Code, OpenCode, OpenClaw,
# Hermes, Codex) to use DashScope API with a single command.
#
# Usage:
#   $env:BL_AGENT="claude-code"
#   $env:BL_BASE_URL="https://dashscope.aliyuncs.com/apps/anthropic"
#   $env:BL_API_KEY="sk-xxxxx"
#   $env:BL_MODEL="qwen3.7-max"
#   irm https://xxx/agent-setup.ps1 | iex

$ErrorActionPreference = "Stop"

function Write-Info    { Write-Host "INFO: $args" -ForegroundColor Blue }
function Write-Success { Write-Host "[OK] $args" -ForegroundColor Green }
function Write-Err     { Write-Host "ERROR: $args" -ForegroundColor Red }

# ── Check Node.js ─────────────────────────────────────────────────────────────

function Test-Node {
    $nodePath = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodePath) {
        Write-Err "Node.js is not installed."
        Write-Host ""
        Write-Host "Install Node.js 22+ from: https://nodejs.org/"
        exit 1
    }

    $nodeMajor = & node -p "Number(process.versions.node.split('.')[0])" 2>$null
    if ([int]$nodeMajor -lt 22) {
        $nodeVersion = & node -v 2>$null
        Write-Err "Node.js $nodeVersion is installed, but version 22+ is required."
        Write-Host ""
        Write-Host "Upgrade Node.js: https://nodejs.org/"
        exit 1
    }
}

# ── Read parameters from environment variables ────────────────────────────────

$Agent   = $env:BL_AGENT
$BaseUrl = $env:BL_BASE_URL
$ApiKey  = $env:BL_API_KEY
$Model   = $env:BL_MODEL
$DryRun  = $env:BL_DRY_RUN

if (-not $Agent -or -not $BaseUrl -or -not $ApiKey -or -not $Model) {
    Write-Err "Missing required environment variables."
    Write-Host ""
    Write-Host "Set these before running:"
    Write-Host '  $env:BL_AGENT    = "claude-code"'
    Write-Host '  $env:BL_BASE_URL = "https://dashscope.aliyuncs.com/apps/anthropic"'
    Write-Host '  $env:BL_API_KEY  = "sk-xxxxx"'
    Write-Host '  $env:BL_MODEL    = "qwen3.7-max"'
    Write-Host ""
    Write-Host "Then run:"
    Write-Host '  irm https://xxx/agent-setup.ps1 | iex'
    exit 1
}

# ── Main ──────────────────────────────────────────────────────────────────────

Test-Node

$npxArgs = @("bailian-cli@latest", "agent", "setup",
    "--agent", $Agent,
    "--base-url", $BaseUrl,
    "--api-key", $ApiKey,
    "--model", $Model)

if ($DryRun -eq "1") {
    $npxArgs += "--dry-run"
}

Write-Info "Running: npx $($npxArgs -join ' ')"
Write-Host ""

& npx @npxArgs

# Clean up env vars
Remove-Item Env:BL_AGENT   -ErrorAction SilentlyContinue
Remove-Item Env:BL_BASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:BL_API_KEY  -ErrorAction SilentlyContinue
Remove-Item Env:BL_MODEL    -ErrorAction SilentlyContinue
Remove-Item Env:BL_DRY_RUN  -ErrorAction SilentlyContinue

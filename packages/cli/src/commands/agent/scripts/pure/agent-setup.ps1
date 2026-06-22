# Bailian — Pure Agent Setup (no Node.js / npx required)
#
# Directly writes config files for coding agents to use DashScope API.
#
# Usage (set env vars, then pipe):
#   $env:BL_AGENT="claude-code"
#   $env:BL_BASE_URL="https://dashscope.aliyuncs.com/apps/anthropic"
#   $env:BL_API_KEY="sk-xxxxx"
#   $env:BL_MODEL="qwen3.7-max"
#   irm https://xxx/agent-setup.ps1 | iex

$ErrorActionPreference = "Stop"

function Write-Err     { Write-Host "ERROR: $args" -ForegroundColor Red }
function Write-Info    { Write-Host "INFO: $args" -ForegroundColor Blue }
function Write-Ok      { Write-Host "[OK] $args" -ForegroundColor Green }
function Write-Warn    { Write-Host "WARNING: $args" -ForegroundColor Yellow }

function Test-AnthropicEndpoint([string]$Url) {
    return $Url -match '/apps/anthropic'
}

function Backup-File([string]$Path) {
    if (Test-Path $Path) {
        $ts = [int][double]::Parse((Get-Date -UFormat %s))
        Copy-Item $Path "$Path.bak.$ts"
    }
}

function Write-SafeFile([string]$Path, [string]$Content) {
    $dir = Split-Path $Path -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $tmp = "$Path.tmp"
    Set-Content -Path $tmp -Value $Content -Encoding UTF8 -NoNewline
    Move-Item -Path $tmp -Destination $Path -Force
}

# ── Agent writers ─────────────────────────────────────────────────────────────

function Setup-ClaudeCode([string]$BaseUrl, [string]$ApiKey, [string]$Model, [bool]$DryRun) {
    $settings = Join-Path $HOME ".claude" "settings.json"
    $onboarding = Join-Path $HOME ".claude.json"

    if ($DryRun) { Write-Info "[dry-run] Would write: $settings, $onboarding"; return }

    # settings.json — merge env if possible
    $data = @{}
    if (Test-Path $settings) {
        try { $data = Get-Content $settings -Raw | ConvertFrom-Json -AsHashtable } catch { $data = @{} }
    }
    if (-not $data.ContainsKey("env")) { $data["env"] = @{} }
    $data["env"]["ANTHROPIC_AUTH_TOKEN"] = $ApiKey
    $data["env"]["ANTHROPIC_BASE_URL"] = $BaseUrl
    $data["env"]["ANTHROPIC_MODEL"] = $Model
    $data["env"]["ANTHROPIC_DEFAULT_HAIKU_MODEL"] = $Model
    $data["env"]["ANTHROPIC_DEFAULT_SONNET_MODEL"] = $Model
    $data["env"]["ANTHROPIC_DEFAULT_OPUS_MODEL"] = $Model
    $data["env"]["CLAUDE_CODE_SUBAGENT_MODEL"] = $Model

    Backup-File $settings
    Write-SafeFile $settings ($data | ConvertTo-Json -Depth 10)

    # .claude.json — ensure hasCompletedOnboarding
    $ob = @{}
    if (Test-Path $onboarding) {
        try { $ob = Get-Content $onboarding -Raw | ConvertFrom-Json -AsHashtable } catch { $ob = @{} }
    }
    $ob["hasCompletedOnboarding"] = $true

    Backup-File $onboarding
    Write-SafeFile $onboarding ($ob | ConvertTo-Json -Depth 10)

    Write-Ok "Claude Code configured."
    Write-Host "  Written: $settings"
    Write-Host "  Written: $onboarding"
    Write-Host ""
    Write-Host "  Run ``claude`` to start using Claude Code with DashScope."
}

function Setup-QwenCode([string]$BaseUrl, [string]$ApiKey, [string]$Model, [bool]$DryRun) {
    $settings = Join-Path $HOME ".qwen" "settings.json"

    if ($DryRun) { Write-Info "[dry-run] Would write: $settings"; return }

    $data = @{
        env = @{ BAILIAN_API_KEY = $ApiKey }
        modelProviders = @{
            openai = @(
                @{
                    id = $Model
                    name = "[Bailian] $Model"
                    baseUrl = $BaseUrl
                    envKey = "BAILIAN_API_KEY"
                }
            )
        }
        security = @{ auth = @{ selectedType = "openai" } }
        model = @{ name = $Model }
        '$version' = 3
    }

    Backup-File $settings
    Write-SafeFile $settings ($data | ConvertTo-Json -Depth 10)

    Write-Ok "Qwen Code configured."
    Write-Host "  Written: $settings"
    Write-Host ""
    Write-Host "  Run ``qwen`` to start using Qwen Code with DashScope."
}

function Setup-OpenCode([string]$BaseUrl, [string]$ApiKey, [string]$Model, [bool]$DryRun) {
    $config = Join-Path $HOME ".config" "opencode" "opencode.json"

    $npm = if (Test-AnthropicEndpoint $BaseUrl) { "@ai-sdk/anthropic" } else { "@ai-sdk/openai-compatible" }

    if ($DryRun) { Write-Info "[dry-run] Would write: $config (npm: $npm)"; return }

    $data = @{
        '$schema' = "https://opencode.ai/config.json"
        provider = @{
            bailian = @{
                npm = $npm
                name = "Alibaba Cloud Model Studio"
                options = @{ baseURL = $BaseUrl; apiKey = $ApiKey }
                models = @{ $Model = @{ name = $Model } }
            }
        }
    }

    Backup-File $config
    Write-SafeFile $config ($data | ConvertTo-Json -Depth 10)

    Write-Ok "OpenCode configured."
    Write-Host "  Written: $config"
    Write-Host ""
    Write-Host "  Run ``opencode`` then type ``/models`` to select your model."
}

function Setup-OpenClaw([string]$BaseUrl, [string]$ApiKey, [string]$Model, [bool]$DryRun) {
    $config = Join-Path $HOME ".openclaw" "openclaw.json"

    $api = if (Test-AnthropicEndpoint $BaseUrl) { "anthropic-messages" } else { "openai-completions" }

    if ($DryRun) { Write-Info "[dry-run] Would write: $config (api: $api)"; return }

    $data = @{
        models = @{
            mode = "merge"
            providers = @{
                bailian = @{
                    baseUrl = $BaseUrl
                    apiKey = $ApiKey
                    api = $api
                    models = @(
                        @{
                            id = $Model
                            name = $Model
                            reasoning = $false
                            input = @("text", "image")
                            contextWindow = 1000000
                            maxTokens = 65536
                            cost = @{ input = 0; output = 0; cacheRead = 0; cacheWrite = 0 }
                        }
                    )
                }
            }
        }
        agents = @{
            defaults = @{
                model = @{ primary = "bailian/$Model" }
            }
        }
    }

    Backup-File $config
    Write-SafeFile $config ($data | ConvertTo-Json -Depth 10)

    Write-Ok "OpenClaw configured."
    Write-Host "  Written: $config"
    Write-Host ""
    Write-Host "  Run ``openclaw`` to start using OpenClaw with DashScope."
}

function Setup-Hermes([string]$BaseUrl, [string]$ApiKey, [string]$Model, [bool]$DryRun) {
    $config = Join-Path $HOME ".hermes" "config.yaml"

    $apiMode = if (Test-AnthropicEndpoint $BaseUrl) { "anthropic_messages" } else { "chat_completions" }

    if ($DryRun) { Write-Info "[dry-run] Would write: $config (api_mode: $apiMode)"; return }

    Write-Warn "Hermes Agent does not support native Windows. This config is for WSL2."

    $yaml = @"
model:
  default: $Model
  provider: custom
  base_url: $BaseUrl
  api_mode: $apiMode
  api_key: $ApiKey
"@

    Backup-File $config
    Write-SafeFile $config $yaml

    Write-Ok "Hermes Agent configured."
    Write-Host "  Written: $config"
    Write-Host ""
    Write-Host "  Run ``hermes chat -q `"hello`"`` to verify."
}

function Setup-Codex([string]$BaseUrl, [string]$ApiKey, [string]$Model, [bool]$DryRun) {
    $config = Join-Path $HOME ".codex" "config.toml"
    $auth = Join-Path $HOME ".codex" "auth.json"

    if ($DryRun) { Write-Info "[dry-run] Would write: $config, $auth"; return }

    $toml = @"
model_provider = "Model_Studio"
model = "$Model"

[model_providers.Model_Studio]
name = "Model_Studio"
base_url = "$BaseUrl"
env_key = "OPENAI_API_KEY"
wire_api = "responses"
"@

    Backup-File $config
    Write-SafeFile $config $toml

    Backup-File $auth
    Write-SafeFile $auth "{`n  `"OPENAI_API_KEY`": `"$ApiKey`"`n}"

    Write-Ok "Codex configured."
    Write-Host "  Written: $config"
    Write-Host "  Written: $auth"
    Write-Host ""
    Write-Host "  Run ``codex`` to start using Codex with DashScope."
}

# ── Read parameters from environment variables ────────────────────────────────

$Agent   = $env:BL_AGENT
$BaseUrl = $env:BL_BASE_URL
$ApiKey  = $env:BL_API_KEY
$Model   = $env:BL_MODEL
$DryRun  = $env:BL_DRY_RUN -eq "1"

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

# ── Dispatch ──────────────────────────────────────────────────────────────────

Write-Host ""

switch ($Agent) {
    "claude-code" { Setup-ClaudeCode $BaseUrl $ApiKey $Model $DryRun }
    "qwen-code"   { Setup-QwenCode   $BaseUrl $ApiKey $Model $DryRun }
    "opencode"    { Setup-OpenCode   $BaseUrl $ApiKey $Model $DryRun }
    "openclaw"    { Setup-OpenClaw   $BaseUrl $ApiKey $Model $DryRun }
    "hermes"      { Setup-Hermes     $BaseUrl $ApiKey $Model $DryRun }
    "codex"       { Setup-Codex      $BaseUrl $ApiKey $Model $DryRun }
    default {
        Write-Err "Unknown agent `"$Agent`". Valid agents: claude-code, qwen-code, opencode, openclaw, hermes, codex"
        exit 1
    }
}

Write-Host ""

# Clean up env vars
Remove-Item Env:BL_AGENT    -ErrorAction SilentlyContinue
Remove-Item Env:BL_BASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:BL_API_KEY  -ErrorAction SilentlyContinue
Remove-Item Env:BL_MODEL    -ErrorAction SilentlyContinue
Remove-Item Env:BL_DRY_RUN  -ErrorAction SilentlyContinue

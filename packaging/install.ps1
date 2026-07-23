# REFERENCE install script for the OSS layout (production scripts are maintained elsewhere).
# Expected production entry:
#   irm https://bailian-cli.oss-cn-hangzhou.aliyuncs.com/bailian-cli/install.ps1 | iex
param()

$ErrorActionPreference = "Stop"

$CdnBase = if ($env:BAILIAN_CLI_CDN) { $env:BAILIAN_CLI_CDN.TrimEnd("/") } else { "https://bailian-cli.oss-cn-hangzhou.aliyuncs.com/bailian-cli" }
$Channel = if ($env:BAILIAN_CHANNEL) { $env:BAILIAN_CHANNEL } else { "latest" }
$Version = $env:BAILIAN_VERSION
$InstallRoot = if ($env:BAILIAN_SHARE_DIR) { $env:BAILIAN_SHARE_DIR } else { Join-Path $env:LOCALAPPDATA "bailian-cli" }
$ConfigDir = if ($env:BAILIAN_CONFIG_DIR) { $env:BAILIAN_CONFIG_DIR } else { Join-Path $env:USERPROFILE ".bailian" }

function Write-Log([string]$Message) {
  [Console]::Error.WriteLine($Message)
}

if ([string]::IsNullOrWhiteSpace($Version)) {
  $manifestUrl = "$CdnBase/channels/$Channel.json"
  Write-Log "Fetching $manifestUrl"
  $manifest = Invoke-RestMethod -Uri $manifestUrl
  $Version = $manifest.version
  if ([string]::IsNullOrWhiteSpace($Version)) {
    throw "Could not parse version from $Channel channel manifest"
  }
}

$Arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "x64" }
if ($Arch -eq "arm64") {
  throw "windows arm64 is not supported for binary install; use: npm install -g bailian-cli"
}

$Asset = "bl-$Version-windows-$Arch.exe"
$Url = "$CdnBase/releases/$Version/$Asset"
$SumsUrl = "$CdnBase/releases/$Version/SHA256SUMS"

$TempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("bailian-cli-install-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $TempDir | Out-Null
try {
  $AssetPath = Join-Path $TempDir $Asset
  $SumsPath = Join-Path $TempDir "SHA256SUMS"
  Write-Log "Downloading $Asset…"
  Invoke-WebRequest -Uri $Url -OutFile $AssetPath
  Invoke-WebRequest -Uri $SumsUrl -OutFile $SumsPath

  $Expected = $null
  Get-Content $SumsPath | ForEach-Object {
    if ($_ -match "^([a-fA-F0-9]+)\s+$([regex]::Escape($Asset))\s*$") {
      $Expected = $Matches[1].ToLowerInvariant()
    }
  }
  if (-not $Expected) { throw "Checksum for $Asset not found in SHA256SUMS" }
  $Actual = (Get-FileHash -Algorithm SHA256 -Path $AssetPath).Hash.ToLowerInvariant()
  if ($Expected -ne $Actual) { throw "Checksum mismatch for $Asset" }

  $VersionDir = Join-Path $InstallRoot "versions\$Version"
  New-Item -ItemType Directory -Force -Path $VersionDir | Out-Null
  New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null
  $Target = Join-Path $VersionDir "bl.exe"
  Copy-Item -Force $AssetPath $Target
  $ShimDir = Join-Path $InstallRoot "bin"
  New-Item -ItemType Directory -Force -Path $ShimDir | Out-Null
  Copy-Item -Force $Target (Join-Path $ShimDir "bl.exe")
  Copy-Item -Force $Target (Join-Path $ShimDir "bailian.exe")
  Set-Content -Path (Join-Path $ConfigDir "install-method") -Value "binary" -NoNewline

  $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if (-not ($UserPath -split ";" | Where-Object { $_ -eq $ShimDir })) {
    [Environment]::SetEnvironmentVariable("Path", "$ShimDir;$UserPath", "User")
    Write-Log "Added $ShimDir to your user PATH. Open a new terminal to use bl."
  }

  Write-Log "Installed: $Target (bailian-cli $Version)"
  Write-Log "Done. Run: bl --help"
}
finally {
  Remove-Item -Recurse -Force $TempDir -ErrorAction SilentlyContinue
}
